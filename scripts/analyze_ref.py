"""Точный разбор референса 20260911_120511.jpg: геометрия ArUco-подобной метки."""
import cv2
import numpy as np

img = cv2.imread('/home/z/my-project/upload/20260911_120511.jpg')
h, w = img.shape[:2]
print(f'image: {w}x{h}')

gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

# Найдём самый крупный тёмный контур = внешняя рамка метки
th = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
c = max(contours, key=cv2.contourArea)
x, y, bw, bh = cv2.boundingRect(c)
print(f'marker bbox: x={x} y={y} w={bw} h={bh}  aspect={bw/bh:.3f}')

# Апроксимация квадрата
peri = cv2.arcLength(c, True)
approx = cv2.approxPolyDP(c, 0.02 * peri, True)
print(f'approx corners: {len(approx)}')

# Проверка заливки рамки: профиль средних яркостей вдоль центральных линий
cx, cy = x + bw // 2, y + bh // 2
row = gray[cy, x:x + bw]
col = gray[y:y + bh, cx]

def runs(line, dark_thresh=128):
    """Серия тёмных/светлых отрезков вдоль линии."""
    out = []
    cur = line[0] <= dark_thresh
    n = 0
    for v in line:
        d = v <= dark_thresh
        if d == cur:
            n += 1
        else:
            out.append(('D' if cur else 'L', n))
            cur, n = d, 1
    out.append(('D' if cur else 'L', n))
    return out

print('\ncentral row runs (D=dark, L=light):')
for t, n in runs(row):
    print('  %s %4dpx' % (t, n))
print('\ncentral col runs (D=dark, L=light):')
for t, n in runs(col):
    print('  %s %4dpx' % (t, n))

# Оценка: рамка толщиной b, тихая зона q, сетка n x n модулей
# По горизонтальному профилю: D(border) L(quiet) D/L modules... L(quiet) D(border)
row_runs = runs(row)
if row_runs[0][0] == 'D':
    b = row_runs[0][1]
    q = row_runs[1][1] if len(row_runs) > 1 and row_runs[1][0] == 'L' else 0
    inner = bw - 2 * b - 2 * q
    print(f'\nborder={b}px ({b/bw*100:.1f}% of marker width)')
    print(f'quiet={q}px ({q/bw*100:.1f}%)')
    print(f'inner area={inner}px ({inner/bw*100:.1f}%)')

# Сканирование сетки: бинуризуем внутреннюю область и считаем переходы по строкам
if row_runs[0][0] == 'D' and row_runs[-1][0] == 'D':
    b = row_runs[0][1]
    inner_x0, inner_x1 = x + b, x + bw - b
    inner_y0, inner_y1 = y + b, y + bh - b
    inner_img = gray[inner_y0:inner_y1, inner_x0:inner_x1]
    # Тихая зона: найдём строки/столбцы, где всё белое
    dark_rows = (inner_img <= 128).sum(axis=1)
    dark_cols = (inner_img <= 128).sum(axis=0)
    ih, iw = inner_img.shape
    # Первые/последние полностью светлые строки = тихая зона
    light_rows = np.where(dark_rows == 0)[0]
    light_cols = np.where(dark_cols == 0)[0]
    if len(light_rows):
        qy = light_rows[light_rows < ih // 2].max() + 1 if (light_rows < ih // 2).any() else 0
        print(f'\nquiet zone vertical (top): {qy}px')
    if len(light_cols):
        qx = light_cols[light_cols < iw // 2].max() + 1 if (light_cols < iw // 2).any() else 0
        print(f'quiet zone horizontal (left): {qx}px')

    # Чистое поле данных (без тихой зоны)
    grid_img = inner_img[qy:ih - qy, qx:iw - qx]
    gh, gw = grid_img.shape
    print(f'data field: {gw}x{gh}px')
    # Оценка числа модулей: автокорреляция по профилю яркости центральной строки
    profile = (grid_img[gh // 2] <= 128).astype(np.int8)
    # считаем серии
    segs = []
    cur, n = profile[0], 1
    for v in profile[1:]:
        if v == cur:
            n += 1
        else:
            segs.append((int(cur), n)); cur, n = v, 1
    segs.append((int(cur), n))
    print(f'central row segments in data field: {segs}')
    med = int(np.median([n for _, n in segs])) if segs else 0
    print(f'median segment length: {med}px -> estimated cols = {gw / med:.2f}')
    # Вертикаль
    profilev = (grid_img[:, gw // 2] <= 128).astype(np.int8)
    segsv = []
    cur, n = profilev[0], 1
    for v in profilev[1:]:
        if v == cur:
            n += 1
        else:
            segsv.append((int(cur), n)); cur, n = v, 1
    segsv.append((int(cur), n))
    print(f'central col segments in data field: {segsv}')
    medv = int(np.median([n for _, n in segsv])) if segsv else 0
    print(f'median segment length: {medv}px -> estimated rows = {gh / medv:.2f}')

    # Реконструкция битов для 6x6, 5x5, 7x7 — какая сетка даёт чёткие клетки
    for N in (4, 5, 6, 7):
        cell = gw / N
        if cell < 2: continue
        bits = []
        ok = 0
        for r in range(N):
            line = []
            for c_ in range(N):
                y0, y1 = int(r * gh / N), int((r + 1) * gh / N)
                x0, x1 = int(c_ * gw / N), int((c_ + 1) * gw / N)
                cell_img = grid_img[y0:y1, x0:x1]
                frac = (cell_img <= 128).mean()
                line.append(1 if frac > 0.5 else 0)
                ok += 1
            bits.append(line)
        print(f'\n{N}x{N} reconstruction:')
        for line in bits:
            print('   ', ' '.join(str(v) for v in line))
