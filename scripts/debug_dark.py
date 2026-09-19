"""Дебаг: почему чтение битов падает при затемнении 34% и 22%."""
import base64
import io
import json

import cv2
import numpy as np
from PIL import Image

OUT = "/home/z/my-project/scripts/out"

with open(f"{OUT}/it5-kamry-1.json", encoding="utf-8") as f:
    dataurl = json.load(f)["data"]["result"]
img = cv2.cvtColor(
    np.array(Image.open(io.BytesIO(base64.b64decode(dataurl.split(",", 1)[1]))).convert("RGB")),
    cv2.COLOR_RGB2BGR)


def read_bits_debug(img_bgr, label):
    g = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    print(f"\n=== {label}: min={g.min()} max={g.max()} ===")
    th = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    print(f"otsu threshold level: {cv2.threshold(g, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1:2]}")
    contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    print(f"contours: {len(contours)}")
    best = None
    for c in contours:
        area = cv2.contourArea(c)
        if area < g.size * 0.05:
            continue
        peri = cv2.arcLength(c, True)
        ap = cv2.approxPolyDP(c, 0.04 * peri, True)
        print(f"  cand area={area:.0f} ({area / g.size * 100:.1f}%) approx={len(ap)}")
        if len(ap) == 4 and (best is None or area > cv2.contourArea(best)):
            best = ap
    if best is None:
        print("  -> quad не найден")
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
    mm = side_px / 9.8
    out = []
    for r in range(5):
        line = []
        for c in range(5):
            cy = int(2.4 * mm + (r + 0.5) * mm)
            cx = int(2.4 * mm + (c + 0.5) * mm)
            w = max(1, int(mm * 0.25))
            win = sq[cy - w:cy + w, cx - w:cx + w]
            frac = (win <= 128).mean()
            line.append(1 if frac > 0.5 else 0)
        out.append(line)
    for line in out:
        print("   ", " ".join(str(v) for v in line))
    return out


expected = read_bits_debug(img, "эталон")
dark34 = (img.astype(float) * 0.34).astype(np.uint8)
got34 = read_bits_debug(dark34, "плохой свет 34%")
rng = np.random.default_rng(7)
dark22 = cv2.GaussianBlur(
    np.clip((img.astype(float) * 0.22 + rng.normal(0, 14, img.shape)), 0, 255).astype(np.uint8),
    (3, 3), 0)
got22 = read_bits_debug(dark22, "очень темно 22%+шум+блюр")

print("\nсовпадение 34%:", got34 == expected)
print("совпадение 22%:", got22 == expected)
