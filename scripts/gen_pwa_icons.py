#!/usr/bin/env python3
"""Генерация PWA-иконок «Генератор AR-меток» в стиле метки «жирный ArUco».

Дизайн согласован с приложением: чернильный #1C1917 (stone-900, как логотип
в шапке), белая бумага #FFFFFF, тёплый фон #FBFAF7. Узор — референсный
паттерн движка (страховочный FALLBACK из lib/marker.ts):
10011 / 01100 / 11010 / 00101 / 11010, поворотно-асимметричный.

Наборы:
  icon-192/512 (purpose any)     — белая скруглённая карточка на прозрачном
  maskable-192/512               — full-bleed тёплый фон, метка в safe-zone
  apple-touch-icon-180           — full-bleed тёплый фон
  favicon-32                     — сама метка со скруглением на прозрачном
Все рисуются в 4x и даунскейлятся LANCZOS — гладкие углы, резкие клетки.
"""
from PIL import Image, ImageDraw
import os

INK = (28, 25, 23, 255)       # #1C1917 — чернильный (как логотип шапки)
PAPER = (255, 255, 255, 255)  # белая бумага метки
WARM = (251, 250, 247, 255)   # #FBFAF7 — тёплый фон приложения

# Референсный узор 5x5 (FALLBACK движка): 13 чернил, серии <= 2
PATTERN = [
    [1, 0, 0, 1, 1],
    [0, 1, 1, 0, 0],
    [1, 1, 0, 1, 0],
    [0, 0, 1, 0, 1],
    [1, 1, 0, 1, 0],
]

SS = 4  # supersampling


def draw_marker(d: ImageDraw.ImageDraw, x: float, y: float, side: float,
                ink=INK, paper=PAPER, corner: float = 0.0) -> None:
    """Метка «жирный ArUco» в квадрате (x, y, side): рамка 1.4u, отбивка 1u, матрица 5x5u."""
    u = side / 9.8
    if corner > 0:
        d.rounded_rectangle([x, y, x + side, y + side], radius=corner, fill=ink)
    else:
        d.rectangle([x, y, x + side, y + side], fill=ink)
    # белая внутренность от внутреннего края рамки
    b = 1.4 * u
    d.rectangle([x + b, y + b, x + side - b, y + side - b], fill=paper)
    # матрица от 2.4u
    g = 2.4 * u
    for r in range(5):
        for c in range(5):
            if PATTERN[r][c]:
                d.rectangle([x + g + c * u, y + g + r * u,
                             x + g + (c + 1) * u, y + g + (r + 1) * u], fill=ink)


def render(size: int, mode: str, out: str) -> None:
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if mode == "any":
        # белая скруглённая карточка на прозрачном, метка с полями
        cs = S * 0.9                      # сторона карточки
        off = (S - cs) / 2
        d.rounded_rectangle([off, off, off + cs, off + cs], radius=cs * 0.24, fill=PAPER)
        ms = cs - 2 * (cs * 0.15)         # метка с внутренним полем
        draw_marker(d, off + cs * 0.15, off + cs * 0.15, ms, corner=ms * 0.045)

    elif mode == "maskable":
        img.paste(WARM, (0, 0, S, S))     # full-bleed тёплый фон
        ms = S * 0.58                     # метка в центральной safe-zone
        off = (S - ms) / 2
        draw_marker(d, off, off, ms, corner=ms * 0.04)

    elif mode == "apple":
        img.paste(WARM, (0, 0, S, S))
        ms = S * 0.68
        off = (S - ms) / 2
        draw_marker(d, off, off, ms, corner=ms * 0.04)

    elif mode == "favicon":
        ms = S * 0.96                     # сама метка, лёгкое скругление
        off = (S - ms) / 2
        draw_marker(d, off, off, ms, corner=S * 0.09)

    else:
        raise ValueError(mode)

    img = img.resize((size, size), Image.LANCZOS)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out, "PNG")
    print(f"{out}: {size}x{size}")


base = "/home/z/my-project/public/icons"
render(192, "any", f"{base}/icon-192.png")
render(512, "any", f"{base}/icon-512.png")
render(192, "maskable", f"{base}/maskable-192.png")
render(512, "maskable", f"{base}/maskable-512.png")
render(180, "apple", f"{base}/apple-touch-icon.png")
render(32, "favicon", f"{base}/favicon-32.png")
print("OK")
