"""Референс: точная реконструкция 5x5 (гипотеза) с проверкой по нескольким скан-линиям."""
import cv2
import numpy as np

sq = cv2.imread('/home/z/my-project/scripts/ref-straight.png', cv2.IMREAD_GRAYSCALE)
side = sq.shape[0]
print(f'side={side}')

# Гипотеза: border=1.4m, quiet=1m, grid=5m, quiet=1m, border=1.4m  ->  9.8 модулей
# Подбор: прогоняем разные структуры, ищем ту, где клетки "чистые" (внутри клетки нет переходов)
def test_structure(border_m, quiet_m, N, tol=0.35):
    total = 2*border_m + 2*quiet_m + N
    m = side / total
    x0 = (border_m + quiet_m) * m
    g0 = int(round(x0))
    cell = m
    # Считаем "чистоту": доля пикселей, попавших в ожидаемый цвет по центру клетки
    clean, total_cells = 0, 0
    bits = []
    for r in range(N):
        line = []
        for c in range(N):
            cy = int(g0 + (r + 0.5) * cell)
            cx = int(g0 + (c + 0.5) * cell)
            # окно 30% клетки
            w = max(3, int(cell * 0.3))
            win = sq[cy-w:cy+w, cx-w:cx+w]
            if win.size == 0:
                continue
            dark = (win <= 128).mean()
            v = 1 if dark > 0.5 else 0
            line.append(v)
            total_cells += 1
            if dark > 0.98 or dark < 0.02:
                clean += 1
        bits.append(line)
    return bits, clean / total_cells

best = None
for N in (4, 5, 6):
    for border_m in (1.0, 1.2, 1.4, 1.5, 1.75):
        for quiet_m in (0.5, 0.75, 1.0, 1.25):
            bits, purity = test_structure(border_m, quiet_m, N)
            if best is None or purity > best[0]:
                best = (purity, N, border_m, quiet_m, bits)
purity, N, bm, qm, bits = best
print(f'\nBEST: grid={N}x{N}, border={bm}m, quiet={qm}m -> purity {purity*100:.1f}%')
for line in bits:
    print('   ', ' '.join(str(v) for v in line))

# Проверка симметрии/асимметрии битов
arr = np.array(bits)
for k in range(1, 4):
    rot = np.rot90(arr, k)
    same = np.array_equal(arr, rot)
    print(f'rot90 x{k}: {"СИММЕТРИЧНО (плохо для ориентации)" if same else "асимметрично (ок)"}')
