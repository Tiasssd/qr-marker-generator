"""Итерация 1 (верификация движка произвольных меток).

Проверяет на реальном рендере из браузера:
  1. Детерминизм: одно название -> бит-в-бит одинаковая картинка.
  2. Различимость: разные названия -> заметно разные узоры.
  3. Геометрия: квадратная рамка, глаз = 3 модуля, тихая зона >= 1.8 модуля.
  4. Три якорных глаза в углах внутренней области, профиль кольцо-зазор-точка.
  5. Контраст: чистые чёрный/белый.
  6. Плотность чернил в разумных пределах.
  7. Название напечатано НАД рамкой.
"""
import base64
import io
import json
import sys

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


kamry1 = load_png(f"{OUT}/it1-kamry-1.json")
kamry2 = load_png(f"{OUT}/it1-kamry-2.json")
molniya = load_png(f"{OUT}/it1-molniya.json")

# --- 1. Детерминизм ---
check("детерминизм: Камри == Камри (бит-в-бит)",
      kamry1.shape == kamry2.shape and np.array_equal(kamry1, kamry2))

# --- 2. Различимость узоров ---
diff = (kamry1 != molniya).any(axis=2).mean()
check("различимость: Камри vs Молния", diff > 0.05, f"({diff:.1%} пикселей различаются)")

# --- Геометрия по рендеру Камри ---
gray = np.array(Image.fromarray(kamry1).convert("L")).astype(int)
H, W = gray.shape
dark_rows = [y for y in range(H) if (gray[y] < 100).sum() > W * 0.5]
dark_cols = [x for x in range(W) if (gray[:, x] < 100).sum() > H * 0.5]
check("рамка найдена", bool(dark_rows and dark_cols))
ft, fb = dark_rows[0], dark_rows[-1]
fl, fr = dark_cols[0], dark_cols[-1]
side_h, side_w = fb - ft, fr - fl
check("рамка квадрат", abs(side_w - side_h) <= 2, f"({side_w}x{side_h})")

frameT = side_w * 0.026
inner_l, inner_r = fl + frameT, fr - frameT
inner_t, inner_b = ft + frameT, fb - frameT
inner_w = inner_r - inner_l
cell = inner_w / 13.0  # 9 модулей + 2 тихих зоны с каждой стороны
print(f"      модуль {cell:.1f}px = {cell / W:.4f} ширины карточки (QR был ~{side_w / 29 / W:.4f})")

# внутренняя область в бинаризованном виде; углы гасим — там остатки скругления рамки
bw = (gray[int(inner_t):int(inner_b), int(inner_l):int(inner_r)] < 100).astype(np.uint8)
cs = int(round(inner_w * 0.06))
bw[:cs, :cs] = 0
bw[:cs, -cs:] = 0
bw[-cs:, :cs] = 0
bw[-cs:, -cs:] = 0
R, C = bw.shape
q = 2.0 * cell  # тихая зона

# --- 3. Тихая зона на серединах строк/столбцов ---
mid = R // 2
xs_mid = np.where(bw[mid] > 0)[0]
if len(xs_mid):
    check("тихая зона слева >= 1.8 модуля", xs_mid[0] / cell >= 1.8, f"({xs_mid[0] / cell:.2f})")
    check("тихая зона справа >= 1.8 модуля", (C - 1 - xs_mid[-1]) / cell >= 1.8,
          f"({(C - 1 - xs_mid[-1]) / cell:.2f})")
else:
    check("тихая зона: средняя строка не пуста", False)
midc = C // 2
ys_mid = np.where(bw[:, midc] > 0)[0]
if len(ys_mid):
    check("тихая зона сверху >= 1.8 модуля", ys_mid[0] / cell >= 1.8, f"({ys_mid[0] / cell:.2f})")
    check("тихая зона снизу >= 1.8 модуля", (R - 1 - ys_mid[-1]) / cell >= 1.8,
          f"({(R - 1 - ys_mid[-1]) / cell:.2f})")
else:
    check("тихая зона: средний столбец не пуст", False)

# --- 4. Глаза в трёх углах: плотность и bbox = 3 модуля ---
eye_boxes = [
    ("верхний левый", q, q),
    ("верхний правый", q, C - q - 3 * cell),
    ("нижний левый", R - q - 3 * cell, q),
]
for name, gy, gx in eye_boxes:
    box = bw[int(gy):int(gy + 3 * cell), int(gx):int(gx + 3 * cell)]
    dens = float(box.mean()) if box.size else 0.0
    check(f"глаз {name}: плотность > 0.2", dens > 0.2, f"({dens:.2f})")
    ys, xs = np.where(box > 0)
    if len(xs):
        w = xs.max() - xs.min() + 1
        h = ys.max() - ys.min() + 1
        check(f"глаз {name}: bbox = 3 модуля (+-8%)",
              abs(w - 3 * cell) / (3 * cell) < 0.08 and abs(h - 3 * cell) / (3 * cell) < 0.08,
              f"({w:.0f}x{h:.0f}px, ожидание {3 * cell:.0f}px)")
    else:
        check(f"глаз {name}: найден", False)

# --- 5. Профиль глаза: кольцо-зазор-точка (5 чередований) ---
row_y = int(q + 1.5 * cell)
line = bw[row_y, int(q):int(q + 3 * cell)]
seq = []
for v in line:
    if not seq or seq[-1] != v:
        seq.append(int(v))
check("профиль глаза: 3+ тёмных полосы (кольцо-точка-кольцо)",
      sum(1 for s in seq if s == 1) >= 3, f"({seq})")

# --- 6. Контраст ---
roi_gray = gray[int(inner_t):int(inner_b), int(inner_l):int(inner_r)]
check("контраст: чёрный < 60 / белый > 200", roi_gray.min() < 60 and roi_gray.max() > 200,
      f"(min={roi_gray.min()}, max={roi_gray.max()})")

# --- 7. Плотность чернил (модули + глаза, тихая зона включена) ---
ink = float(bw.mean())
check("плотность чернил 8-60%", 0.08 <= ink <= 0.60, f"({ink:.1%})")

# --- 8. Название над рамкой ---
name_band = gray[max(0, ft - int(0.12 * side_w)):max(1, ft - int(0.02 * side_w)), fl:fr]
if name_band.size:
    name_dark = (name_band < 100).mean()
    check("название над рамкой", name_dark > 0.01, f"({name_dark:.1%} тёмных пикселей в полосе названия)")
else:
    check("полоса названия найдена", False)

print()
if failures:
    print("ПРОВАЛЕНО:", failures)
    sys.exit(1)
print(f"ИТЕРАЦИЯ 1: ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ ({len(failures)} провалов)")
