/**
 * Движок трекер-меток «псевдо-QR».
 *
 * Вместо настоящего QR-кода (21×21 мелких модулей — с дальних дистанций
 * модули сливаются, и библиотека трекинга перестаёт различать метки)
 * генерируем «подобие» кода: сетка 9×9 крупных модулей, три якорных
 * «глаза», произвольный силуэт заливки и форма модулей.
 * Метка не декодируется — трекинг различает её по внешнему виду.
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

/** Сетка узора: 9×9 при глазах 3×3 — глаз занимает треть стороны, как у QR V1 */
const GRID = 9;
/** Размер якорного «глаза» в модулях */
const EYE = 3;
/** Тихая зона в модулях с каждой стороны (модуль крупный, двух хватает с запасом) */
const QUIET = 2;

/** Углы якорных глаз: строка и столбец левого верхнего модуля глаза */
const EYE_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0, GRID - EYE],
  [GRID - EYE, 0],
];

export type ModuleStyle = "soft" | "round" | "sharp" | "diamond";
export type MaskKind = "full" | "disc" | "ring" | "diamond" | "cross";

/** Готовый узор метки: нарисовать можно сколько угодно раз — одинаково */
export interface MarkerDesign {
  /** Число модулей по стороне */
  grid: number;
  /** Форма модулей */
  style: ModuleStyle;
  /** Силуэт заливки */
  mask: MaskKind;
  /** Включённые ячейки заливки (индекс row * grid + col); ячейки глаз не входят */
  cells: ReadonlySet<number>;
}

/** Ячейки, занятые глазами, — заливка их не трогает */
const EYE_CELLS: ReadonlySet<number> = (() => {
  const s = new Set<number>();
  for (const [r0, c0] of EYE_ANCHORS)
    for (let r = 0; r < EYE; r++) for (let c = 0; c < EYE; c++) s.add((r0 + r) * GRID + c0 + c);
  return s;
})();

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

/** Центр сетки в координатах индексов ячеек: (col − 4, row − 4) → отклонение от центра */
const CENTER = (GRID - 1) / 2;

/** Силуэт заливки: какие ячейки считаются доступными */
function maskKeeps(mask: MaskKind, col: number, row: number): boolean {
  const dx = col - CENTER;
  const dy = row - CENTER;
  switch (mask) {
    case "disc":
      return Math.hypot(dx, dy) <= 3.9;
    case "ring": {
      const d = Math.hypot(dx, dy);
      return d >= 2.3 && d <= 4.8;
    }
    case "diamond":
      return Math.abs(dx) + Math.abs(dy) <= 4.9;
    case "cross":
      return Math.abs(dx) <= 2.9 || Math.abs(dy) <= 2.9;
    default:
      return true; // full — вся свободная область
  }
}

/**
 * Режет горизонтальные и вертикальные полосы из 4+ модулей подряд:
 * монолитные пятна сливаются в одно пятно на дальних дистанциях
 * и делают узоры разных меток менее различимыми.
 * Жадный проход: клетка, ставшая 4-й подряд, удаляется, счётчик
 * обнуляется — полосы длиннее 3 гарантированно не выживают.
 */
function antiBlob(cells: Set<number>): void {
  const killRuns = (index: (k: number) => number, length: number): void => {
    let run = 0;
    for (let k = 0; k < length; k++) {
      if (!cells.has(index(k))) {
        run = 0;
        continue;
      }
      run++;
      if (run === 4) {
        cells.delete(index(k));
        run = 0;
      }
    }
  };
  for (let r = 0; r < GRID; r++) killRuns((c) => r * GRID + c, GRID);
  for (let c = 0; c < GRID; c++) killRuns((r) => r * GRID + c, GRID);
}

/** Проверяет, что добавление клетки не создаст полосу из 4 подряд */
function wouldRun(cells: ReadonlySet<number>, i: number): boolean {
  const r = (i / GRID) | 0;
  const c = i % GRID;
  const len = (dr: number, dc: number): number => {
    let n = 0;
    let rr = r + dr;
    let cc = c + dc;
    while (rr >= 0 && rr < GRID && cc >= 0 && cc < GRID && cells.has(rr * GRID + cc)) {
      n++;
      rr += dr;
      cc += dc;
    }
    return n;
  };
  // 3 соседа + сама клетка = полоса из 4
  return len(0, -1) + len(0, 1) >= 3 || len(-1, 0) + len(1, 0) >= 3;
}

/** Размер модуля в долях клетки: квадраты почти вплотную, круги чуть меньше */
function moduleScale(style: ModuleStyle): number {
  return style === "round" ? 0.88 : style === "diamond" ? 0.94 : 0.94;
}

/**
 * Строит узор метки из ID. Одно и то же название — всегда один и тот же узор.
 */
export function createMarkerDesign(id: string): MarkerDesign | null {
  if (!id) return null;
  const bytes = new TextEncoder().encode(id);
  const seed = (fnv1a(bytes, 0x811c9dc5) ^ fnv1a(bytes, 0x9dc5811c)) >>> 0;
  const rnd = mulberry32(seed);

  const STYLES: ModuleStyle[] = ["soft", "round", "sharp", "diamond"];
  const MASKS: MaskKind[] = ["full", "full", "disc", "ring", "diamond", "cross"]; // full чаще
  const style = STYLES[(rnd() * STYLES.length) | 0];
  const mask = MASKS[(rnd() * MASKS.length) | 0];
  const density = 0.46 + rnd() * 0.14; // 46–60% — сбалансированная плотность узора

  /* Свободные ячейки внутри силуэта */
  const free: number[] = [];
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++) {
      const i = r * GRID + c;
      if (EYE_CELLS.has(i) || !maskKeeps(mask, c, r)) continue;
      free.push(i);
    }

  /* Детерминированное перемешивание и отбор под целевую плотность */
  for (let i = free.length - 1; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    const t = free[i];
    free[i] = free[j];
    free[j] = t;
  }
  /* Целевое число модулей — от ПОЛНОЙ свободной области сетки:
     узор остаётся крупным и жирным даже на усечённых силуэтах (ring, disc),
     но не плотнее 68% маски — зазоры несут различимость узоров */
  const fullFree = GRID * GRID - EYE_CELLS.size;
  const lo = Math.min(18, free.length);
  const hi = Math.max(lo, Math.floor(free.length * 0.68));
  const target = Math.min(Math.max(Math.round(fullFree * density), lo), hi);
  const cells = new Set<number>(free.slice(0, target));

  antiBlob(cells);

  /* Страховка «достаточно чернил»: добиваем узор, не создавая полос */
  for (let i = target; cells.size < lo && i < free.length; i++) {
    if (!wouldRun(cells, free[i])) cells.add(free[i]);
  }
  /* Крайний случай: пул кончился — добиваем без проверки и повторно режем полосы */
  if (cells.size < lo) {
    for (let i = target; cells.size < lo && i < free.length; i++) cells.add(free[i]);
    antiBlob(cells);
  }

  return { grid: GRID, style, mask, cells };
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

function pathRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, rr);
    return;
  }
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Путь модуля заданной формы, вписанного в квадрат (x, y, size) */
function modulePath(
  ctx: CanvasRenderingContext2D,
  style: ModuleStyle,
  x: number,
  y: number,
  size: number
): void {
  if (size <= 0) return;
  const cx = x + size / 2;
  const cy = y + size / 2;
  if (style === "round") {
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    return;
  }
  if (style === "diamond") {
    const r = size / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    return;
  }
  pathRoundRect(ctx, x, y, size, size, style === "soft" ? size * 0.3 : size * 0.08);
}

/* ------------------------------ Отрисовка -------------------------------- */

/**
 * Якорный «глаз» в квадрате s×s: кольцо + точка, внешняя кромка кольца
 * проходит точно по границе квадрата. Форма повторяет стиль модулей.
 */
function drawEye(
  ctx: CanvasRenderingContext2D,
  style: ModuleStyle,
  x: number,
  y: number,
  s: number
): void {
  const c = s / 2;
  const lw = s / 6; // толщина кольца = 0.5 модуля
  const dot = (s * 0.92) / 3; // точка чуть меньше модуля

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = lw;
  if (style === "round") {
    ctx.beginPath();
    ctx.arc(x + c, y + c, c - lw / 2, 0, Math.PI * 2);
  } else if (style === "diamond") {
    const r = c - lw / 2;
    ctx.beginPath();
    ctx.moveTo(x + c, y + c - r);
    ctx.lineTo(x + c + r, y + c);
    ctx.lineTo(x + c, y + c + r);
    ctx.lineTo(x + c - r, y + c);
    ctx.closePath();
  } else {
    const b = s - lw;
    pathRoundRect(ctx, x + lw / 2, y + lw / 2, b, b, style === "soft" ? b * 0.26 : b * 0.1);
  }
  ctx.stroke();

  ctx.fillStyle = "#000000";
  modulePath(ctx, style, x + c - dot / 2, y + c - dot / 2, dot);
  ctx.fill();
}

/**
 * Рисует карточку метки на canvas: [название] [рамка-трекер + узор + тихая зона].
 * Чистый чёрный на белом, модули почти во всю клетку — максимально крупные
 * фигуры для уверенного визуального различения камерой на расстоянии.
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

  /* Компактная вёрстка: тонкие поля, рамка тоньше — модули крупнее */
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

  /* --- название над узором --- */
  if (hasName) {
    ctx.fillStyle = "#0a0a0b";
    ctx.font = nameFont(nameSize);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    setLetterSpacing(ctx, size * 0.004);
    ctx.fillText(displayName, size / 2, margin);
    setLetterSpacing(ctx, 0);
  }

  /* --- блок узора с рамкой-трекером --- */
  const mx = margin;
  const my = margin + nameH + gap;
  const n = design.grid;
  const frameT = markerSide * 0.026;
  const inner = markerSide - 2 * frameT;
  const cell = inner / (n + 2 * QUIET);
  const ox = mx + frameT + QUIET * cell;
  const oy = my + frameT + QUIET * cell;

  const outerR = markerSide * 0.04;
  ctx.fillStyle = "#000000";
  pathRoundRect(ctx, mx, my, markerSide, markerSide, outerR);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  pathRoundRect(ctx, mx + frameT, my + frameT, inner, inner, Math.max(outerR - frameT * 0.4, 0));
  ctx.fill();

  /* --- модули заливки: крупные фигуры, детерминированный порядок --- */
  const { style, cells } = design;
  const msize = cell * moduleScale(style);
  const inset = (cell - msize) / 2;
  ctx.fillStyle = "#000000";
  for (const i of cells) {
    const r = (i / n) | 0;
    const c = i % n;
    modulePath(ctx, style, ox + c * cell + inset, oy + r * cell + inset, msize);
    ctx.fill();
  }

  /* --- три якорных «глаза» по углам --- */
  const eyeS = EYE * cell;
  for (const [r0, c0] of EYE_ANCHORS) {
    drawEye(ctx, style, ox + c0 * cell, oy + r0 * cell, eyeS);
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
