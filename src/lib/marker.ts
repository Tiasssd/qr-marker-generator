/**
 * Движок трекер-меток в стиле «жирный ArUco» (по референсу пользователя).
 *
 * Геометрия снята с референса попиксельно: квадратная метка со сплошной
 * чёрной рамкой ~1.4 модуля, белой отбивкой ~1 модуль и плотной
 * асимметричной матрицей 5×5. Модули прилегают вплотную — узор читается
 * как единый битмап. Углы строго прямые, цвета чистые чёрный/белый.
 * Сторона метки = 9.8 модуля, один модуль = 10.2% стороны — модуль QR V1
 * был 3.4% стороны, наши крупнее почти втрое: с дальних дистанций
 * узор не сливается.
 *
 * Метка не декодируется — библиотека трекинга различает её по внешнему
 * виду. Узор поворотно-асимметричен: поворот метки не путает её саму
 * с собой, камера всегда понимает ориентацию.
 *
 * Детерминизм: узор выводится из ID, ID — из названия.
 * Одно название — одна метка (перепечатка не ломает привязку),
 * разные названия — заметно разные узоры.
 */

/** Конфигурация метки (то, что влияет на итоговую картинку) */
export interface MarkerConfig {
  /** Название метки — печатается над узором и определяет его */
  name: string;
  /** Код метки, выведенный из названия — сид узора */
  id: string;
}

/** Параметры отрисовки на canvas */
export interface DrawParams extends MarkerConfig {
  /** Логическая ширина картинки в px */
  size: number;
  /** Плотность пикселей (для чёткого предпросмотра) */
  dpr?: number;
}

/* ------------------------------ Геометрия -------------------------------- */

/** Матрица узора: 5×5 — максимально крупные модули при живом узоре */
export const GRID = 5;
/** Рамка в модулях — сплошная, жирная, как на референсе (14% стороны) */
const BORDER = 1.4;
/** Белая отбивка между рамкой и матрицей (в модулях) */
const QUIET = 1;
/** Сторона метки в модулях: рамка + отбивка + матрица + отбивка + рамка */
const SIDE_MODULES = 2 * BORDER + 2 * QUIET + GRID; // 9.8

/** Готовый узор метки: нарисовать можно сколько угодно раз — одинаково */
export interface MarkerDesign {
  /** Число модулей по стороне (всегда 5) */
  grid: typeof GRID;
  /** Тёмные ячейки матрицы (индекс row * grid + col) */
  cells: ReadonlySet<number>;
}

/* --------------------------- ID из названия ------------------------------ */

const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 знака, без похожих

/** FNV-1a 32 бит с настраиваемым сидом */
function fnv1a(bytes: Uint8Array, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Выводит уникальный код метки из названия (детерминированно):
 * одинаковое название — одинаковый узор (можно перепечатать),
 * разное название — другой узор (камера различит машины с одного взгляда).
 */
export function deriveId(name: string, length = 10): string {
  const norm = name.trim().replace(/\s+/g, " ").toLowerCase();
  if (!norm) return "";
  const bytes = new TextEncoder().encode(norm);
  const h1 = fnv1a(bytes, 0x811c9dc5);
  const h2 = fnv1a(bytes, 0x9dc5811c);
  let id = "";
  for (let i = 0; i < 6 && i < length; i++) id += ID_ALPHABET[(h1 >>> (i * 5)) & 31];
  for (let i = 0; i < 4 && 6 + i < length; i++) id += ID_ALPHABET[(h2 >>> (i * 5)) & 31];
  return id;
}

/* ------------------------------- Узор ------------------------------------ */

/** ГПСЧ mulberry32 — детерминизм без внешних зависимостей */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Правила узора — все проверяются до отрисовки:

   1. Чернила 10–15 клеток из 25 (40–60%): узор всегда плотный,
      «цифровой шум» референса, а не бледная решётка и не чёрная дыра.
   2. Серия одинаковых клеток подряд (по горизонтали и вертикали) <= 3:
      монолитные полосы сливаются в одно пятно и делают узоры
      разных меток неразличимыми.
   3. Поворотная асимметрия: узор не совпадает ни с одним из трёх
      своих поворотов на 90° — камера всегда определяет ориентацию,
      а метка не «притворяется» собой же в другом положении. */

const MIN_INK = 10;
const MAX_INK = 15;
const MAX_RUN = 3;

type Bits = ReadonlyArray<boolean>;

/** Максимальная длина серии тёмных клеток по строкам и столбцам */
function maxRunLen(bits: Bits): number {
  let m = 0;
  for (let r = 0; r < GRID; r++) {
    let run = 0;
    for (let c = 0; c < GRID; c++) {
      if (bits[r * GRID + c]) {
        run++;
        if (run > m) m = run;
      } else {
        run = 0;
      }
    }
  }
  for (let c = 0; c < GRID; c++) {
    let run = 0;
    for (let r = 0; r < GRID; r++) {
      if (bits[r * GRID + c]) {
        run++;
        if (run > m) m = run;
      } else {
        run = 0;
      }
    }
  }
  return m;
}

/** Поворот битовой карты на 90° по часовой, times раз */
function rotateCW(bits: Bits, times: number): boolean[] {
  let cur = bits.slice();
  for (let t = 0; t < times; t++) {
    const next = new Array<boolean>(GRID * GRID).fill(false);
    for (let r = 0; r < GRID; r++)
      for (let c = 0; c < GRID; c++) next[c * GRID + (GRID - 1 - r)] = cur[r * GRID + c];
    cur = next;
  }
  return cur;
}

/** Узор проходит все правила? */
function patternValid(bits: Bits): boolean {
  let ink = 0;
  for (const b of bits) if (b) ink++;
  if (ink < MIN_INK || ink > MAX_INK) return false;
  if (maxRunLen(bits) > MAX_RUN) return false;
  for (let k = 1; k <= 3; k++) {
    const rot = rotateCW(bits, k);
    if (rot.every((v, i) => v === bits[i])) return false;
  }
  return true;
}

/**
 * Страховочный узор — паттерн с самого референса пользователя:
 * 13 чернил, серии не длиннее 2, поворотно-асимметричен.
 * Срабатывает, только если 256 случайных попыток не нашли узор
 * (на практике не случается — правила пропускают ~ половину узоров).
 */
const FALLBACK: Bits = [
  true, false, false, true, true,
  false, true, true, false, false,
  true, true, false, true, false,
  false, false, true, false, true,
  true, true, false, true, false,
];

/**
 * Строит узор метки из ID. Одно и то же название — всегда один и тот же узор.
 */
export function createMarkerDesign(id: string): MarkerDesign | null {
  if (!id) return null;
  const bytes = new TextEncoder().encode(id);
  const base = (fnv1a(bytes, 0x811c9dc5) ^ fnv1a(bytes, 0x9dc5811c)) >>> 0;

  /* Детерминированный отбор: сиды идут от хеша, пока узор не пройдёт правила */
  for (let attempt = 0; attempt < 256; attempt++) {
    const rnd = mulberry32((base + Math.imul(attempt + 1, 0x9e3779b9)) >>> 0);
    const density = 0.44 + rnd() * 0.14; // 44–58% — плотность узора
    const bits: boolean[] = [];
    for (let i = 0; i < GRID * GRID; i++) bits.push(rnd() < density);
    if (!patternValid(bits)) continue;
    const cells = new Set<number>();
    for (let i = 0; i < bits.length; i++) if (bits[i]) cells.add(i);
    return { grid: GRID, cells };
  }

  const cells = new Set<number>();
  for (let i = 0; i < FALLBACK.length; i++) if (FALLBACK[i]) cells.add(i);
  return { grid: GRID, cells };
}

/* ---------- Шрифты: берём реальное семейство из CSS-переменных ---------- */

let cachedSans: string | null = null;

function resolveFamily(cssVar: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  try {
    const probe = document.createElement("span");
    probe.style.fontFamily = `var(${cssVar})`;
    probe.style.display = "none";
    document.body.appendChild(probe);
    const family = getComputedStyle(probe).fontFamily || fallback;
    probe.remove();
    return family;
  } catch {
    return fallback;
  }
}

export function sansStack(): string {
  cachedSans ??= resolveFamily("--font-geist-sans", "Arial, sans-serif");
  return `${cachedSans}, Arial, sans-serif`;
}

/* ---------------------------- Вспомогательные ---------------------------- */

function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number): void {
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${px}px`;
  } catch {
    // Браузер без поддержки letterSpacing — просто игнорируем
  }
}

/* ------------------------------ Отрисовка -------------------------------- */

/**
 * Рисует карточку метки на canvas: [название] [чёрная рамка + отбивка + матрица].
 * Чистый чёрный на белом, модули прилегают вплотную — максимально крупные
 * фигуры для уверенного визуального различения камерой на расстоянии.
 *
 * Все прямоугольники привязаны к общей сетке границ и снапятся к целым
 * пикселям устройства: соседние тёмные клетки стыкуются ровно, без швов
 * и зазоров, а рамка остаётся идеально резкой при любом разрешении.
 */
export function drawMarker(
  canvas: HTMLCanvasElement,
  design: MarkerDesign,
  params: DrawParams
): void {
  const { name } = params;
  const size = params.size;
  const dpr = params.dpr ?? 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  /* Компактная вёрстка: тонкие поля — метка крупнее */
  const margin = size * 0.025;
  const gap = size * 0.03;
  const nameText = name.trim();
  const hasName = nameText.length > 0;

  /* --- подбор размера шрифта названия --- */
  const sans = sansStack();
  const nameFont = (px: number) => `700 ${px}px ${sans}`;
  let nameSize = size * 0.062;
  let displayName = nameText;
  if (hasName) {
    const maxWidth = size - margin * 2;
    setLetterSpacing(ctx, size * 0.004);
    ctx.font = nameFont(nameSize);
    let w = ctx.measureText(displayName).width;
    while (w > maxWidth && nameSize > size * 0.03) {
      nameSize -= size * 0.0025;
      ctx.font = nameFont(nameSize);
      w = ctx.measureText(displayName).width;
    }
    if (w > maxWidth) {
      let base = displayName;
      let candidate = `${base}…`;
      while (ctx.measureText(candidate).width > maxWidth && base.length > 1) {
        base = base.slice(0, -1);
        candidate = `${base}…`;
      }
      displayName = candidate;
    }
    setLetterSpacing(ctx, 0);
  }
  const nameH = hasName ? nameSize * 1.35 : 0;

  /* --- размеры холста --- */
  const markerSide = size - 2 * margin;
  const height = margin + nameH + gap + markerSide + margin;

  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Белый фон — максимально светлая поверхность для тёмных фигур.
  // Заливаем с запасом: дробная высота холста иначе оставляет полупрозрачный нижний ряд.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-2, -2, size + 4, height + 4);

  /* --- название над меткой --- */
  if (hasName) {
    ctx.fillStyle = "#0a0a0b";
    ctx.font = nameFont(nameSize);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    setLetterSpacing(ctx, size * 0.004);
    ctx.fillText(displayName, size / 2, margin);
    setLetterSpacing(ctx, 0);
  }

  /* --- метка: чёрная рамка → белая отбивка → матрица узора --- */
  const mx = margin;
  const my = margin + nameH + gap;
  const m = markerSide / SIDE_MODULES; // размер модуля

  /* Снап к целым пикселям устройства — резкие края без сглаживания */
  const snap = (v: number): number => Math.round(v * dpr) / dpr;

  /* Сплошная чёрная рамка: углы строго прямые */
  const bx0 = snap(mx);
  const by0 = snap(my);
  const bx1 = snap(mx + markerSide);
  const by1 = snap(my + markerSide);
  ctx.fillStyle = "#000000";
  ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);

  /* Белая внутренность от ВНУТРЕННЕГО края рамки:
     отбивка и поле матрицы — белые, тёмными будут только клетки узора */
  const wx0 = snap(mx + BORDER * m);
  const wy0 = snap(my + BORDER * m);
  const wx1 = snap(mx + markerSide - BORDER * m);
  const wy1 = snap(my + markerSide - BORDER * m);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(wx0, wy0, wx1 - wx0, wy1 - wy0);

  /* Границы клеток — общие для соседей: стык без шва и без нахлёста.
     Начало матрицы: рамка 1.4 + отбивка 1 = 2.4 модуля от края метки */
  const n = design.grid;
  const gx0 = snap(mx + (BORDER + QUIET) * m);
  const gy0 = snap(my + (BORDER + QUIET) * m);
  const X: number[] = [];
  const Y: number[] = [];
  for (let c = 0; c <= n; c++) X.push(snap(gx0 + c * m));
  for (let r = 0; r <= n; r++) Y.push(snap(gy0 + r * m));

  /* Тёмные клетки матрицы — модули вплотную, как битмап референса */
  ctx.fillStyle = "#000000";
  for (const i of design.cells) {
    const r = (i / n) | 0;
    const c = i % n;
    ctx.fillRect(X[c], Y[r], X[c + 1] - X[c], Y[r + 1] - Y[r]);
  }
}

/* ------------------------------- Экспорт --------------------------------- */

/** Рендерит метку в PNG-Blob с заданным разрешением */
export async function exportMarkerPng(
  design: MarkerDesign,
  params: DrawParams
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  drawMarker(canvas, design, { ...params, dpr: 1 });
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Не удалось создать PNG-файл"));
      },
      "image/png"
    );
  });
}

/** Рендерит метку в data-URL (для листа печати) */
export function renderMarkerDataUrl(design: MarkerDesign, params: DrawParams): string {
  const canvas = document.createElement("canvas");
  drawMarker(canvas, design, { ...params, dpr: 1 });
  return canvas.toDataURL("image/png");
}

/** Безопасное имя файла для скачивания */
export function markerFileName(name: string, id: string): string {
  const base =
    name
      .trim()
      .replace(/[/\\?%*:|"<>.]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40) || id || "метка";
  return `${base}.png`;
}
