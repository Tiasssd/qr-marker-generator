"""Итерация 1: проверка декодируемости и геометрии новой метки."""
import sys
from PIL import Image
from pyzbar.pyzbar import decode as zbar_decode

PNG = "/home/z/my-project/scripts/it1-marker.png"

img = Image.open(PNG).convert("L")
W, H = img.size
results = zbar_decode(img)
if not results:
    print("FAIL: QR не декодируется")
    sys.exit(1)
data = results[0].data.decode()
print(f"decode OK: {data}")

# Геометрия: ищем верхнюю и нижнюю строку чёрных пикселей QR-блока (рамка-трекер)
px = img.load()
rows = [y for y in range(H) if any(px[x, y] < 128 for x in range(W))]
# рамка QR: ищем длинные горизонтальные тёмные линии (>= 60% ширины)
frame_rows = []
for y in range(H):
    dark = sum(1 for x in range(0, W, 4) if px[x, y] < 128)
    if dark > (W // 4) * 0.55:
        frame_rows.append(y)
top, bottom = frame_rows[0], frame_rows[-1]
frame_side = bottom - top
print(f"canvas: {W}x{H}, QR-рамка: ~{frame_side}px ({frame_side/W:.3f} ширины)")

# Тихая зона внутри рамки: от рамки до первых модулей
# Модуль: 21 модуль + 8 тихих = 29 клеток во внутренней области
inner = frame_side * (1 - 2 * 0.026)  # рамка 2.6%
cell = inner / 29
print(f"размер модуля: ~{cell:.1f}px ({cell/W:.4f} ширины карточки, было 0.0281)")
print(f"проверка: 21*cell + 8*cell = {(cell*29):.0f} vs inner {inner:.0f}")
assert data == "RJT73P2BA3", f"ID не совпал: {data}"
print("ITERATION 1 QR CHECK: OK")
