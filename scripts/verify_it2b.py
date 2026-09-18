"""Итерация 2: глубокая проверка сканируемости ПРОДУКТОВОГО рендера (1600px).

Условия: оригинал, плохой свет, очень темно, поворот 15°, перспективный наклон,
даунскейл (камера издалека). Плюс геометрия: модуль, тихая зона, контраст.
"""
import sys
import numpy as np
import cv2
import zxingcpp
from PIL import Image

SRC = "/home/z/my-project/scripts/it2-render-fixed.png"
EXPECTED = "RJT73P2BA3"

img = np.array(Image.open(SRC).convert("RGB"))
H, W = img.shape[:2]


def zx(img_arr):
    r = zxingcpp.read_barcodes(img_arr)
    return r[0].text if r else ""


def cv2d(img_arr):
    det = cv2.QRCodeDetector()
    s, pts, _ = det.detectAndDecode(img_arr)
    return s or ""


def low_light(img_arr, k, seed):
    rng = np.random.default_rng(seed)
    out = img_arr.astype(np.float32) * k
    out += rng.normal(0, 6, img_arr.shape).astype(np.float32)
    out = np.clip(out, 0, 255).astype(np.uint8)
    return cv2.GaussianBlur(out, (5, 5), 1.2)


def rotate(img_arr, deg):
    h, w = img_arr.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), deg, 1.0)
    return cv2.warpAffine(img_arr, M, (w, h), borderValue=(255, 255, 255))


def perspective(img_arr, strength=0.16):
    h, w = img_arr.shape[:2]
    dx = w * strength
    dy = h * strength
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = np.float32([[dx * 0.4, dy], [w - dx, dy * 0.3], [w - dx * 0.5, h - dy], [dx, h - dy * 0.4]])
    M = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(img_arr, M, (w, h), borderValue=(255, 255, 255))


def downscale(img_arr, target_w):
    h, w = img_arr.shape[:2]
    k = target_w / w
    return cv2.resize(img_arr, (target_w, int(h * k)), interpolation=cv2.INTER_AREA)


failures = []


def check(label, cond, extra=""):
    print(f"{'OK ' if cond else 'FAIL'}  {label} {extra}")
    if not cond:
        failures.append(label)


# --- Декодирование в оригинале (два движка) ---
check("zxing оригинал", zx(img) == EXPECTED, f"-> {zx(img)!r}")
check("cv2 оригинал", cv2d(img) == EXPECTED, f"-> {cv2d(img)!r}")

# --- Плохой свет / очень темно ---
for k, seed, name in [(0.34, 7, "плохой свет"), (0.22, 11, "очень темно")]:
    t = low_light(img, k, seed)
    ok = zx(t) == EXPECTED
    check(f"zxing {name}", ok, f"-> {zx(t)!r}")

# --- Поворот ---
for deg in [15, -15]:
    t = rotate(img, deg)
    check(f"zxing поворот {deg}°", zx(t) == EXPECTED, f"-> {zx(t)!r}")

# --- Перспектива (камера под углом) ---
t = perspective(img)
check("zxing перспектива", zx(t) == EXPECTED, f"-> {zx(t)!r}")

# --- Даунскейл: метка в кадре камеры издалека ---
for tw in [320, 240, 160]:
    t = downscale(img, tw)
    check(f"zxing даунскейл {tw}px", zx(t) == EXPECTED, f"-> {zx(t)!r}")

# --- Геометрия ---
gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
dark_rows = [y for y in range(H) if np.sum(gray[y] < 100) > W * 0.5]
frame_top, frame_bot = dark_rows[0], dark_rows[-1]
frame_side = frame_bot - frame_top
frame_left = [x for x in range(W) if np.sum(gray[:, x] < 100) > H * 0.5]
frame_l, frame_r = frame_left[0], frame_left[-1]
fw = frame_r - frame_l
cell = (fw * (1 - 2 * 0.026)) / 29
print(f"геометрия: рамка {fw}x{frame_side}px, модуль {cell:.1f}px ({cell / W:.4f} ширины)")
check("рамка квадрат", abs(fw - frame_side) <= 2, f"({fw} vs {frame_side})")

# Тихая зона: белые пиксели между внутренней границей рамки и первым тёмным модулем
ft = fw * 0.026
inner_l = frame_l + ft
scan_y = frame_top + ft + int(fw * 0.5)  # строка посреди внутренней области
row = gray[int(scan_y)]
xs = [x for x in range(int(inner_l), int(frame_r - ft)) if row[x] < 100]
left_gap = xs[0] - int(inner_l)
right_gap = int(frame_r - ft) - xs[-1]
print(f"тихая зона: слева {left_gap}px = {left_gap / cell:.2f} модулей, справа {right_gap}px = {right_gap / cell:.2f}")
check("тихая зона >= 4 модуля", left_gap / cell >= 3.9 and right_gap / cell >= 3.9)

# Контраст модулей (внутри области данных)
roi = gray[int(frame_top + ft) : int(frame_bot - ft), int(frame_l + ft) : int(frame_r - ft)]
check("контраст чёрное/белое", roi.min() < 60 and roi.max() > 200, f"(min={roi.min()}, max={roi.max()})")

print()
if failures:
    print("ПРОВАЛЕНО:", failures)
    sys.exit(1)
print(f"ИТЕРАЦИЯ 2: ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ ({len(failures)} провалов)")
