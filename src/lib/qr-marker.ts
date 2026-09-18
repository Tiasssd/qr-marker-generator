import QRCode from "qrcode";

/** Стиль отрисовки модулей QR-кода */
export type MarkerStyle = "classic" | "rounded" | "dots";

/** Конфигурация метки (то, что влияет на итоговую картинку) */
export interface MarkerConfig {
  /** Название метки — печатается над QR-кодом */
  name: string;
  /** Уникальный код метки — содержимое QR (никаких ссылок) */
  id: string;
  style: MarkerStyle;
  /** Чёрная рамка-трекер вокруг кода */
  frame: boolean;
  /** Мелкая подпись с ID под QR-кодом */
  showId: boolean;
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
  /** Число модулей по стороне (например, 25 для версии 2) */
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
 * Внутри кода — только переданный ID, никаких ссылок.
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

const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Генерирует уникальный код метки: 8 знаков без похожих символов
 * (без O/0, I/1), чтобы код легко читался и набирался вручную.
 */
export function generateId(length = 8): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  }
  return out;
}

/* ---------- Шрифты: берём реальное семейство из CSS-переменных ---------- */

let cachedSans: string | null = null;
let cachedMono: string | null = null;

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

export function monoStack(): string {
  cachedMono ??= resolveFamily("--font-geist-mono", "ui-monospace, Consolas, monospace");
  return `${cachedMono}, ui-monospace, Consolas, monospace`;
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
 * Рисует карточку метки на canvas:
 *   [название]  [рамка-трекер + QR + тихая зона]  [ID (опция)]
 * Чистый чёрный на белом — максимум контраста для камеры.
 */
export function drawMarker(canvas: HTMLCanvasElement, qr: QrData, params: DrawParams): void {
  const { name, id, style, frame, showId } = params;
  const size = params.size;
  const dpr = params.dpr ?? 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const margin = size * 0.055;
  const gap = size * 0.048;
  const nameText = name.trim();
  const hasName = nameText.length > 0;

  /* --- подбор размера шрифта названия --- */
  const sans = sansStack();
  const nameFont = (px: number) => `700 ${px}px ${sans}`;
  let nameSize = size * 0.072;
  let displayName = nameText;
  if (hasName) {
    const maxWidth = size - margin * 2;
    // Измеряем с тем же letter-spacing, что и при отрисовке, — иначе текст «расползается»
    setLetterSpacing(ctx, size * 0.004);
    ctx.font = nameFont(nameSize);
    let w = ctx.measureText(displayName).width;
    while (w > maxWidth && nameSize > size * 0.034) {
      nameSize -= size * 0.003;
      ctx.font = nameFont(nameSize);
      w = ctx.measureText(displayName).width;
    }
    if (w > maxWidth) {
      // Обрезаем так, чтобы текст вместе с «…» гарантированно влезал в ширину
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
  const nameH = hasName ? nameSize * 1.55 : 0;

  /* --- размеры холста --- */
  const qrSide = size - 2 * margin;
  const idSize = size * 0.031;
  const idH = showId ? idSize * 2.1 : 0;
  const height =
    margin + nameH + gap + qrSide + (showId ? gap * 0.75 + idH : 0) + margin;

  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Белый фон — максимально светлая поверхность для тёмных модулей
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, height);

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
  const frameT = frame ? qrSide * 0.042 : 0;
  const inner = qrSide - 2 * frameT;
  const quiet = 4; // тихая зона: 4 модуля с каждой стороны (по стандарту)
  const cell = inner / (n + 2 * quiet);
  const ox = qx + frameT + quiet * cell;
  const oy = qy + frameT + quiet * cell;

  if (frame) {
    const outerR = qrSide * 0.055;
    ctx.fillStyle = "#000000";
    pathRoundRect(ctx, qx, qy, qrSide, qrSide, outerR);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    pathRoundRect(ctx, qx + frameT, qy + frameT, inner, inner, Math.max(outerR - frameT * 0.5, 0));
    ctx.fill();
  }

  /* --- модули данных --- */
  ctx.fillStyle = "#000000";
  const inFinder = (r: number, c: number): boolean =>
    (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  const pad = Math.min(cell * 0.045, 0.5); // убирает волосяные швы между модулями

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (inFinder(r, c)) continue;
      if (!qr.isDark(r, c)) continue;
      const x = ox + c * cell;
      const y = oy + r * cell;
      if (style === "classic") {
        ctx.fillRect(x, y, cell + pad, cell + pad);
      } else if (style === "rounded") {
        pathRoundRect(ctx, x, y, cell + pad, cell + pad, cell * 0.28);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(x + cell / 2, y + cell / 2, cell * 0.48, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* --- «глаза» QR (три поисковых узора) --- */
  const drawEye = (col: number, row: number): void => {
    const x = ox + col * cell;
    const y = oy + row * cell;
    const s = cell * 7;
    if (style === "classic") {
      ctx.fillStyle = "#000000";
      ctx.fillRect(x, y, s, s);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x + cell, y + cell, cell * 5, cell * 5);
      ctx.fillStyle = "#000000";
      ctx.fillRect(x + cell * 2, y + cell * 2, cell * 3, cell * 3);
      return;
    }
    ctx.fillStyle = "#000000";
    pathRoundRect(ctx, x, y, s, s, style === "dots" ? s * 0.5 : s * 0.3);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    pathRoundRect(ctx, x + cell, y + cell, cell * 5, cell * 5, style === "dots" ? cell * 2 : cell * 1.1);
    ctx.fill();
    ctx.fillStyle = "#000000";
    if (style === "dots") {
      ctx.beginPath();
      ctx.arc(x + s / 2, y + s / 2, cell * 1.45, 0, Math.PI * 2);
      ctx.fill();
    } else {
      pathRoundRect(ctx, x + cell * 2, y + cell * 2, cell * 3, cell * 3, cell * 1.05);
      ctx.fill();
    }
  };
  drawEye(0, 0);
  drawEye(n - 7, 0);
  drawEye(0, n - 7);

  /* --- ID под кодом --- */
  if (showId) {
    ctx.fillStyle = "#6f6f76";
    ctx.font = `500 ${idSize}px ${monoStack()}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    setLetterSpacing(ctx, idSize * 0.28);
    ctx.fillText(id, size / 2, qy + qrSide + gap * 0.75);
    setLetterSpacing(ctx, 0);
  }
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
