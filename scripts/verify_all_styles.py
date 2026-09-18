"""Проверка всех вариантов метки: стили и рамка, свет и тьма."""
import cv2
import numpy as np
import zxingcpp

EXPECTED = "HFJ33FBJ"

FILES = [
    ("/home/z/my-project/scripts/marker-classic.png", "строгий + рамка (по умолчанию)"),
    ("/home/z/my-project/scripts/marker-noframe.png", "строгий без рамки"),
    ("/home/z/my-project/scripts/marker-dots.png", "точки + рамка"),
    ("/home/z/my-project/scripts/marker-export.png", "скруглённый + рамка"),
]


def zxing_decode(img: np.ndarray) -> str:
    results = zxingcpp.read_barcodes(img)
    return results[0].text if results else ""


def opencv_decode(img: np.ndarray) -> str:
    return cv2.QRCodeDetector().detectAndDecode(img)[0]


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


def check(img: np.ndarray, label: str, all_ok: list) -> None:
    z, o = zxing_decode(img), opencv_decode(img)
    line = f"  {label:<34} zxing={'OK' if z == EXPECTED else 'FAIL'}"
    if z and z != EXPECTED:
        line += f" (прочёл {z!r})"
    print(line)
    all_ok.append(z == EXPECTED)


def main() -> None:
    results: list[bool] = []
    for path, label in FILES:
        img = cv2.imread(path)
        if img is None:
            print(f"[пропуск] {label}: файл не найден")
            results.append(False)
            continue
        print(f"{label}:")
        check(img, "нормальный свет", results)
        check(simulate_low_light(img), "плохой свет", results)
        check(simulate_very_dark(img), "очень темно", results)
    print("ИТОГ:", "ВСЕ ВАРИАНТЫ ЧИТАЮТСЯ" if all(results) else "ЕСТЬ ПРОБЛЕМЫ")
    raise SystemExit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
