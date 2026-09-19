"""Референс: перспектива-выпрямление и точная реконструкция сетки."""
import cv2
import numpy as np

img = cv2.imread('/home/z/my-project/upload/20260911_120511.jpg')
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

th = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
c = max(contours, key=cv2.contourArea)
peri = cv2.arcLength(c, True)
approx = cv2.approxPolyDP(c, 0.02 * peri, True)
assert len(approx) == 4, f'corners={len(approx)}'

pts = approx.reshape(4, 2).astype(np.float32)
# порядок: top-left, top-right, bottom-right, bottom-left
s = pts.sum(axis=1)
d = np.diff(pts, axis=1).ravel()
tl = pts[np.argmin(s)]
br = pts[np.argmax(s)]
tr = pts[np.argmin(d)]
bl = pts[np.argmax(d)]

side = int(max(np.linalg.norm(br - tl), np.linalg.norm(tr - bl)))
M = cv2.getPerspectiveTransform(np.array([tl, tr, br, bl], dtype=np.float32),
                                np.array([[0, 0], [side, 0], [side, side], [0, side]], dtype=np.float32))
sq = cv2.warpPerspective(gray, M, (side, side))
cv2.imwrite('/home/z/my-project/scripts/ref-straight.png', sq)
print(f'straightened: {side}x{side}')

def runs(line, dark_thresh=128):
    out, cur, n = [], line[0] <= dark_thresh, 0
    for v in line:
        d = v <= dark_thresh
        if d == cur:
            n += 1
        else:
            out.append(('D' if cur else 'L', n))
            cur, n = d, 1
    out.append(('D' if cur else 'L', n))
    return out

mid = side // 2
row = sq[mid, :]
col = sq[:, mid]
print('\ncentral row:')
for t, n in runs(row):
    print('  %s %4dpx  (%.1f%% of side)' % (t, n, n / side * 100))
print('central col:')
for t, n in runs(col):
    print('  %s %4dpx  (%.1f%% of side)' % (t, n, n / side * 100))

# Толщина рамки: усреднённая по 4 сторонам
edges = []
edges.append(runs(sq[mid, :])[0][1])          # left border по центр. строке
edges.append(runs(sq[mid, :])[-1][1])         # right
edges.append(runs(sq[:, mid])[0][1])          # top
edges.append(runs(sq[:, mid])[-1][1])         # bottom
b = int(np.median(edges))
print(f'\nborder thickness ~{b}px = {b/side*100:.1f}% of side')

# Тихая зона внутри рамки
inner = sq[b:side-b, b:side-b]
ih, iw = inner.shape
dark_rows = (inner <= 128).sum(axis=1)
dark_cols = (inner <= 128).sum(axis=0)
lr = np.where(dark_rows == 0)[0]
lc = np.where(dark_cols == 0)[0]
qy = lr[lr < ih//2].max()+1 if (lr < ih//2).any() else 0
qyb = ih - lr[lr > ih//2].min() if (lr > ih//2).any() else 0
qx = lc[lc < iw//2].max()+1 if (lc < iw//2).any() else 0
qxb = iw - lc[lc > iw//2].min() if (lc > iw//2).any() else 0
print(f'quiet: top={qy}px bottom={qyb}px left={qx}px right={qxb}px  ({qy/ih*100:.1f}%..{qx/iw*100:.1f}% of inner)')

# Поле данных
grid = inner[qy:ih-qyb, qx:iw-qxb]
gh, gw = grid.shape
print(f'data field: {gw}x{gh}px')

# Профили: средняя яркость по строкам/столбцам -> найти границы модулей
prof_r = grid.mean(axis=1)
prof_c = grid.mean(axis=0)

def segments_from_profile(prof):
    """Отрезки постоянного знака (тёмный/светлый) в профиле."""
    sign = prof <= 128
    out, cur, n = [], sign[0], 1
    for v in sign[1:]:
        if v == cur:
            n += 1
        else:
            out.append(('D' if cur else 'L', n)); cur, n = v, 1
    out.append(('D' if cur else 'L', n))
    return out

segs_r = segments_from_profile(prof_r)
segs_c = segments_from_profile(prof_c)
print(f'\nrow-profile segments ({len(segs_r)}): ' + ' '.join(f'{t}{n}' for t, n in segs_r))
print(f'col-profile segments ({len(segs_c)}): ' + ' '.join(f'{t}{n}' for t, n in segs_c))
med = np.median([n for _, n in segs_r + segs_c])
print(f'median module size: {med:.0f}px -> grid ~{gw/med:.2f} x {gh/med:.2f}')

# Реконструкция битовой карты для N=4..8
for N in (4, 5, 6, 7, 8):
    bits = []
    for r in range(N):
        line = []
        for c2 in range(N):
            y0, y1 = int(r*gh/N), int((r+1)*gh/N)
            x0, x1 = int(c2*gw/N), int((c2+1)*gw/N)
            frac = (grid[y0:y1, x0:x1] <= 128).mean()
            line.append(1 if frac > 0.5 else 0)
        bits.append(line)
    # чистота реконструкции: доля граничных клеток с "серой" серединой
    corner_var = []
    for r in range(N):
        for c2 in range(N):
            y0, y1 = int(r*gh/N), int((r+1)*gh/N)
            x0, x1 = int(c2*gw/N), int((c2+1)*gw/N)
            cell = grid[y0:y1, x0:x1]
            m = cell[cell.shape[0]//4:3*cell.shape[0]//4, cell.shape[1]//4:3*cell.shape[1]//4]
            corner_var.append((m <= 128).mean())
    purity = np.mean([1 if v > 0.9 or v < 0.1 else 0 for v in corner_var])
    print(f'\n{N}x{N} (cell purity {purity*100:.0f}%):')
    for line in bits:
        print('   ', ' '.join(str(v) for v in line))
