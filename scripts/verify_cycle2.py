"""Цикл 2: сканируемость всех стилей во всех разрешениях экспорта.

Метки отрендерены приложением (660 px), затем ужаты до 512/1024/2048 —
это консервативная симуляция экспорта (ресемплинг добавляет мягкость,
реальный экспорт чище). Плюс поворот, как при съёмке камеры под углом.
"""
import cv2
import numpy as np
import zxingcpp

EXPECTED = "6PJ46UXU"

FILES = [
    ("t-classic.png", "строгий + рамка"),
    ("t-rounded.png", "скруглённый + рамка"),
    ("t-dots.png", "точки + рамка"),
    ("t-dots-noframe.png", "точки без рамки"),
]

SIZES = [512, 1024, 2048]


def zxing_decode(img: np.ndarray) -> str:
    results = zxingcpp.read_barcodes(img)
    return results[0].text if results else ""


def simulate_low_light(img: np.ndarray, seed: int = 7) -> np.ndarray:
    rng = np.random.default_rng(seed)
    out = img.astype(np.float32) * 0.34 + 14.0
    out = cv2.GaussianBlur(out, (5, 5), 1.2)
    noise = rng.normal(0, 16.0, out.shape)
    return np.clip(out + noise, 0, 255).astype(np.uint8)


def simulate_very_dark(img: np.ndarray, seed: int = 11) -> np.ndarray:
    rng = np.random.default_rng(seed)
    out = img.astype(np.float32) * 0.22 + 6.0
    out = cv2.GaussianBlur(out, (7, 7), 1.8)
    noise = rng.normal(0, 22.0, out.shape)
    return np.clip(out + noise, 0, 255).astype(np.uint8)


def rotate(img: np.ndarray, deg: float) -> np.ndarray:
    h, w = img.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2, h / 2), deg, 1.0)
    return cv2.warpAffine(img, m, (w, h), flags=cv2.INTER_LINEAR,
                          borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255))


def resize(img: np.ndarray, width: int) -> np.ndarray:
    h, w = img.shape[:2]
    if w == width:
        return img
    return cv2.resize(img, (width, round(h * width / w)), interpolation=cv2.INTER_LANCZOS4)


def check(img: np.ndarray, label: str, results: list) -> None:
    z = zxing_decode(img)
    ok = z == EXPECTED
    line = f"  {label:<30} {'OK' if ok else 'FAIL'}"
    if z and not ok:
        line += f" (прочёл {z!r})"
    print(line)
    results.append(ok)


def main() -> None:
    results: list[bool] = []
    for path, label in FILES:
        src = cv2.imread(path)
        if src is None:
            print(f"{label}: ФАЙЛ НЕ НАЙДЕН — {path}")
            results.append(False)
            continue
        print(f"{label}:")
        for size in SIZES:
            img = resize(src, size)
            base = f"{size} px"
            check(img, f"{base}, нормальный свет", results)
            check(simulate_low_light(img), f"{base}, плохой свет", results)
            check(simulate_very_dark(img), f"{base}, очень темно", results)
        # поворот камеры 15° на самом рискованном размере (512)
        small = resize(src, 512)
        check(rotate(small, 15), "512 px, поворот 15°", results)
        check(simulate_low_light(rotate(small, 15)), "512 px, поворот + плохой свет", results)
    total = len(results)
    ok_count = sum(results)
    print(f"ИТОГ: {ok_count}/{total}", "— ВСЕ ЧИТАЮТСЯ" if ok_count == total else "— ЕСТЬ ПРОБЛЕМЫ")
    raise SystemExit(0 if ok_count == total else 1)


if __name__ == "__main__":
    main()
