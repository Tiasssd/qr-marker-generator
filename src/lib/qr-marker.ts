import QRCode from "qrcode";

/** Конфигурация метки (то, что влияет на итоговую картинку) */
export interface MarkerConfig {
  /** Название метки — печатается над QR-кодом и определяет уникальный узор */
  name: string;
  /** Код метки, выведенный из названия — содержимое QR (никаких ссылок) */
  id: string;
}

/** Параметры отрисовки на canvas */
export interface DrawParams extends MarkerConfig {
  /** Логическая ширина картинки в px */
  size: number;
  /** Плотность пикселей (для чёткого предпросмотра) */
  dpr?: number;
}

/** Матрица QR-кода */
export interface QrData {
  /** Число модулей по стороне (21 для версии 1 — максимально крупные квадраты) */
  size: number;
  version: number;
  isDark(row: number, col: number): boolean;
}

interface BitMatrixLike {
  size: number;
  data: Uint8Array;
}

/**
 * Создаёт QR-матрицу с максимальной коррекцией ошибок (H = 30%).
 * Внутри кода — только ID метки, никаких ссылок.
 */
export function createQrData(content: string): QrData {
  const qr = QRCode.create(content, { errorCorrectionLevel: "H" });
  const m = qr.modules as unknown as BitMatrixLike;
  return {
    size: m.size,
    version: qr.version,
    isDark: (row, col) => m.data[row * m.size + col] > 0,
  };
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
 * 10 знаков алфавита из 32 символов → QR остаётся версией 1 (21×21) с EC H.
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

/* ------------------------------ Отрисовка -------------------------------- */

/**
 * Рисует карточку метки на canvas: [название] [рамка-трекер + QR + тихая зона].
 * Чистый чёрный на белом, модули во всю клетку — максимально крупные квадраты
 * для уверенного визуального различения камерой.
 */
export function drawMarker(canvas: HTMLCanvasElement, qr: QrData, params: DrawParams): void {
  const { name, id } = params;
  const size = params.size;
  const dpr = params.dpr ?? 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  void id;

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
  const qrSide = size - 2 * margin;
  const height = margin + nameH + gap + qrSide + margin;

  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Белый фон — максимально светлая поверхность для тёмных модулей.
  // Заливаем с запасом: дробная высота холста иначе оставляет полупрозрачный нижний ряд.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-2, -2, size + 4, height + 4);

  /* --- название над кодом --- */
  if (hasName) {
    ctx.fillStyle = "#0a0a0b";
    ctx.font = nameFont(nameSize);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    setLetterSpacing(ctx, size * 0.004);
    ctx.fillText(displayName, size / 2, margin);
    setLetterSpacing(ctx, 0);
  }

  /* --- блок QR с рамкой-трекером --- */
  const qx = margin;
  const qy = margin + nameH + gap;
  const n = qr.size;
  const frameT = qrSide * 0.026;
  const inner = qrSide - 2 * frameT;
  const quiet = 4; // тихая зона: 4 модуля с каждой стороны (по стандарту)
  const cell = inner / (n + 2 * quiet);
  const ox = qx + frameT + quiet * cell;
  const oy = qy + frameT + quiet * cell;

  const outerR = qrSide * 0.04;
  ctx.fillStyle = "#000000";
  pathRoundRect(ctx, qx, qy, qrSide, qrSide, outerR);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  pathRoundRect(ctx, qx + frameT, qy + frameT, inner, inner, Math.max(outerR - frameT * 0.4, 0));
  ctx.fill();

  /* --- модули данных: сплошные квадраты во всю клетку --- */
  ctx.fillStyle = "#000000";
  const inFinder = (r: number, c: number): boolean =>
    (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  const pad = Math.min(cell * 0.045, 0.5); // убирает волосяные швы между модулями

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (inFinder(r, c)) continue;
      if (!qr.isDark(r, c)) continue;
      ctx.fillRect(ox + c * cell, oy + r * cell, cell + pad, cell + pad);
    }
  }

  /* --- «глаза» QR (три поисковых узора) --- */
  const drawEye = (col: number, row: number): void => {
    const x = ox + col * cell;
    const y = oy + row * cell;
    const s = cell * 7;
    ctx.fillStyle = "#000000";
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x + cell, y + cell, cell * 5, cell * 5);
    ctx.fillStyle = "#000000";
    ctx.fillRect(x + cell * 2, y + cell * 2, cell * 3, cell * 3);
  };
  drawEye(0, 0);
  drawEye(n - 7, 0);
  drawEye(0, n - 7);
}

/* ------------------------------- Экспорт --------------------------------- */

/** Рендерит метку в PNG-Blob с заданным разрешением */
export async function exportMarkerPng(qr: QrData, params: DrawParams): Promise<Blob> {
  const canvas = document.createElement("canvas");
  drawMarker(canvas, qr, { ...params, dpr: 1 });
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
export function renderMarkerDataUrl(qr: QrData, params: DrawParams): string {
  const canvas = document.createElement("canvas");
  drawMarker(canvas, qr, { ...params, dpr: 1 });
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
