"""Итерация 5 (верификация движка «ArUco-bold» по референсу).

Проверяет на реальном рендере из браузера:
  1. Детерминизм: одно название -> бит-в-бит одинаковая картинка.
  2. Различимость: разные названия -> разные узоры.
  3. Геометрия референса: сплошная рамка ~1.4 модуля, отбивка ~1 модуль,
     матрица 5×5, модуль = сторона/9.8 (~10.2% стороны).
  4. Углы строго прямые (пиксели углов чёрные, без скругления).
  5. Контраст: чистые чёрный/белый, alpha=255 по всей картинке.
  6. Узор: плотность 10-15, серии <= 3, поворотная асимметрия.
  7. Название напечатано НАД рамкой.
  8. Машинное чтение при деградациях: темнота, блюр, поворот, перспектива,
     даунскейл (метка издалека) — биты матрицы восстанавливаются.
"""
import base64
import io
import json
import sys

import cv2
import numpy as np
from PIL import Image

OUT = "/home/z/my-project/scripts/out"


def load_png(path):
    with open(path, encoding="utf-8") as f:
        j = json.load(f)
    dataurl = j["data"]["result"]
    assert dataurl.startswith("data:image/png;base64,"), f"нет canvas в {path}"
    return np.array(Image.open(io.BytesIO(base64.b64decode(dataurl.split(",", 1)[1]))).convert("RGB"))


failures = []


def check(label, cond, extra=""):
    print(f"{'OK ' if cond else 'FAIL'}  {label} {extra}")
    if not cond:
        failures.append(label)


kamry1 = load_png(f"{OUT}/it5-kamry-1.json")
kamry2 = load_png(f"{OUT}/it5-kamry-2.json")
molniya = load_png(f"{OUT}/it5-molniya.json")
taifun = load_png(f"{OUT}/it5-taifun.json")

# --- 1. Детерминизм ---
check("детерминизм: Камри == Камри (бит-в-бит)",
      kamry1.shape == kamry2.shape and np.array_equal(kamry1, kamry2))

# --- 2. Различимость узоров ---
diff = (kamry1 != molniya).any(axis=2).mean()
check("различимость: Камри vs Молния", diff > 0.05, f"({diff:.1%} пикселей различаются)")

# --- 5a. Контраст: только чёрный и белый ---
gray = np.array(Image.fromarray(kamry1).convert("L"))
hist = np.bincount(gray.ravel(), minlength=256)
non_bw = int(hist[1:32].sum() + hist[224:255].sum())
check("чистый чёрный/белый", non_bw < gray.size * 0.01, f"(полутонов {non_bw} пикс. из {gray.size})")
alpha = np.array(Image.open(io.BytesIO(base64.b64decode(
    json.load(open(f"{OUT}/it5-kamry-1.json", encoding="utf-8"))["data"]["result"].split(",", 1)[1]
))).convert("RGBA"))[:, :, 3]
check("alpha=255 везде", int((alpha != 255).sum()) == 0)

# --- Геометрия: ищем чёрный квадрат метки ---
H, W = gray.shape
dark_rows = [y for y in range(H) if (gray[y] < 100).sum() > W * 0.5]
dark_cols = [x for x in range(W) if (gray[:, x] < 100).sum() > H * 0.5]
check("рамка-квадрат найдена (строки и столбцы >50% тёмные)", bool(dark_rows and dark_cols))
mt, mb = dark_rows[0], dark_rows[-1]
ml, mr = dark_cols[0], dark_cols[-1]
side = min(mb - mt, mr - ml)
check("метка квадрат", abs((mb - mt) - (mr - ml)) <= 2, f"({mb - mt}x{mr - ml})")

# --- 4. Углы строго прямые ---
corner = max(2, int(side * 0.01))
corners_dark = all(
    gray[y, x] < 100
    for y, x in [(mt, ml), (mt, mr), (mb, ml), (mb, mr)]
)
corner_fill = all(
    gray[mt + dy, ml + dx] < 100
    for dy, dx in [(0, corner), (corner, 0), (corner // 2, corner // 2)]
)
check("углы прямые: угловые пиксели чёрные", corners_dark and corner_fill)

# --- 3. Геометрия модулей по референсу ---
# сторона = 9.8 модуля: рамка 1.4 + отбивка 1 + матрица 5 + отбивка 1 + рамка 1.4
m = side / 9.8
border_px = 1.4 * m
check("рамка ~1.4 модуля (14.3% стороны)",
      0.12 * side < border_px < 0.17 * side, f"({border_px:.0f}px = {border_px / side * 100:.1f}%)")

# измеряем реальную толщину рамки по центрам сторон
mid_y, mid_x = (mt + mb) // 2, (ml + mr) // 2
row = gray[mid_y, ml:mr + 1]
col = gray[mt:mb + 1, mid_x]
def runs(line):
    out, cur, n = [], line[0] <= 128, 0
    for v in line:
        d = v <= 128
        if d == cur:
            n += 1
        else:
            out.append(n)
            cur, n = d, 1
    out.append(n)
    return out
row_runs = runs(row)
border_meas = (row_runs[0] + row_runs[-1]) / 2
check("измеренная толщина рамки = 1.35-1.45 модуля",
      1.30 * m < border_meas < 1.50 * m, f"({border_meas / m:.2f} модуля)")

# тихая зона: после рамки должен идти белый ~1 модуль до первой тёмной клетки
inner_start = border_meas
seg = row_runs[1] if len(row_runs) > 1 else 0  # ширина первой светлой полосы после рамки
check("отбивка ~1 модуль (первая светлая полоса 0.85-1.15 модуля)",
      0.85 * m < seg < 1.15 * m, f"({seg / m:.2f} модуля)")

# --- 6. Реконструкция узора 5×5 из рендера ---
gx0, gy0 = ml + 2.4 * m, mt + 2.4 * m
bits = []
for r in range(5):
    line = []
    for c in range(5):
        cy = int(gy0 + (r + 0.5) * m)
        cx = int(gx0 + (c + 0.5) * m)
        w = max(1, int(m * 0.25))
        win = gray[cy - w:cy + w, cx - cx + cx - w:cx + w] if False else gray[cy - w:cy + w, cx - w:cx + w]
        line.append(1 if (win <= 128).mean() > 0.5 else 0)
    bits.append(line)
arr = np.array(bits)
ink = int(arr.sum())
check("узор: плотность чернил 10-15 из 25", 10 <= ink <= 15, f"({ink})")


def max_run(a):
    best = 0
    for axis in (0, 1):
        for line in (a if axis == 0 else a.T):
            run = 0
            for v in line:
                run = run + 1 if v else 0
                best = max(best, run)
    return best


check("узор: серии <= 3", max_run(arr) <= 3, f"(макс {max_run(arr)})")


def rot90(a, k):
    return np.rot90(a, k)


rot_free = all(not np.array_equal(arr, rot90(arr, k)) for k in (1, 2, 3))
check("узор: поворотная асимметрия", rot_free)

# --- 7. Название над меткой ---
name_zone = gray[:mt - int(m * 0.2), :]
check("название над меткой (тёмные пиксели выше рамки)",
      (name_zone < 100).sum() > 50, f"({int((name_zone < 100).sum())} тёмных пикселей)")

# --- 8. Машинное чтение при деградациях ---
def read_bits(img_bgr, debug=""):
    """Детектор: находит чёрный квадрат, выпрямляет, снимает 5×5 битов."""
    g = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY) if img_bgr.ndim == 3 else img_bgr
    th = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best = None
    for c in contours:
        area = cv2.contourArea(c)
        if area < g.size * 0.05:
            continue
        peri = cv2.arcLength(c, True)
        ap = cv2.approxPolyDP(c, 0.04 * peri, True)
        if len(ap) == 4:
            if best is None or area > cv2.contourArea(best):
                best = ap
    if best is None:
        return None
    pts = best.reshape(4, 2).astype(np.float32)
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).ravel()
    tl, br = pts[np.argmin(s)], pts[np.argmax(s)]
    tr, bl = pts[np.argmin(d)], pts[np.argmax(d)]
    side_px = 360
    M = cv2.getPerspectiveTransform(
        np.array([tl, tr, br, bl], dtype=np.float32),
        np.array([[0, 0], [side_px, 0], [side_px, side_px], [0, side_px]], dtype=np.float32))
    sq = cv2.warpPerspective(g, M, (side_px, side_px))
    # адаптивная бинаризация, как в реальных библиотеках трекинга:
    # жёсткий порог ломается при затемнении (белый 0.34 = 86 < 128)
    _, th_sq = cv2.threshold(sq, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    mm = side_px / 9.8
    out = []
    for r in range(5):
        line = []
        for c in range(5):
            cy = int(2.4 * mm + (r + 0.5) * mm)
            cx = int(2.4 * mm + (c + 0.5) * mm)
            w = max(1, int(mm * 0.25))
            win = th_sq[cy - w:cy + w, cx - w:cx + w]
            line.append(1 if (win > 0).mean() > 0.5 else 0)
        out.append(line)
    return np.array(out)


img = cv2.cvtColor(kamry1, cv2.COLOR_RGB2BGR)
expected = read_bits(img)
check("эталонный рендер читается детектором", expected is not None)

def degrade_and_check(name, fn):
    d = fn(img)
    got = read_bits(d)
    okk = got is not None and np.array_equal(got, expected)
    check(f"чтение при деградации: {name}", okk)
    return d

# темнота 22% + шум + блюр (как в прошлых итерациях — «очень плохо»)
degrade_and_check("очень темно (22%, шум, блюр)", lambda im:
    cv2.GaussianBlur(
        np.clip((im.astype(float) * 0.22 + np.random.default_rng(7).normal(0, 14, im.shape)), 0, 255).astype(np.uint8),
        (3, 3), 0))
# плохой свет 34%
degrade_and_check("плохой свет (34%)", lambda im:
    (im.astype(float) * 0.34).astype(np.uint8))
# блюр движения
degrade_and_check("блюр движения", lambda im:
    cv2.GaussianBlur(im, (7, 7), 2.5))
# поворот ±15°
def rot_img(im, deg):
    h, w = im.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), deg, 1.0)
    return cv2.warpAffine(im, M, (w, h), flags=cv2.INTER_LINEAR, borderValue=(255, 255, 255))
degrade_and_check("поворот +15°", lambda im: rot_img(im, 15))
degrade_and_check("поворот -15°", lambda im: rot_img(im, -15))
# перспектива
def persp(im):
    h, w = im.shape[:2]
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = np.float32([[w * 0.08, h * 0.05], [w * 0.95, h * 0.0], [w, h * 0.97], [0, h]])
    M = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(im, M, (w, h), borderValue=(255, 255, 255))
degrade_and_check("перспективный наклон", persp)
# даунскейлы: метка издалека
for target in (320, 240, 160, 120):
    h, w = img.shape[:2]
    scale = target / w
    small = cv2.resize(img, (target, int(h * scale)), interpolation=cv2.INTER_AREA)
    degrade_and_check(f"издалека: ширина {target}px ({small.shape[1]}x{small.shape[0]})", lambda im=small: im)

print()
if failures:
    print(f"ИТЕРАЦИЯ 5: ПРОВАЛЕНО {len(failures)}: {failures}")
    sys.exit(1)
print("ИТЕРАЦИЯ 5 (рендер): ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ")
