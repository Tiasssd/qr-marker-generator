"""Проверка сканируемости AR-метки: оригинал + симуляция плохого освещения.

Декодеры:
  zxing-cpp  — порт ZXing, уровень обычных камер-сканеров
  OpenCV     — консервативный детектор (запасной)

Сценарии:
  1. Полная карточка (название + рамка + QR + ID) как есть
  2. Обрезанная зона QR без рамки
  3. Плохое освещение: затемнение 34%, блюр, шум сенсора
"""
import cv2
import numpy as np
import zxingcpp

IMG = "/home/z/my-project/scripts/marker-export.png"
EXPECTED = "HFJ33FBJ"  # ID из браузерного теста


def zxing_decode(img: np.ndarray) -> str:
    results = zxingcpp.read_barcodes(img)
    return results[0].text if results else ""


def opencv_decode(img: np.ndarray) -> str:
    return cv2.QRCodeDetector().detectAndDecode(img)[0]


def report(img: np.ndarray, label: str) -> bool:
    z = zxing_decode(img)
    o = opencv_decode(img)
    z_ok, o_ok = z == EXPECTED, o == EXPECTED
    print(f"  {label:<38} zxing={'OK' if z_ok else 'fail':<4} opencv={'OK' if o_ok else 'fail'}")
    if not z_ok and z:
        print(f"      zxing прочёл: {z!r}")
    return z_ok


def simulate_low_light(img: np.ndarray, seed: int = 7) -> np.ndarray:
    """Тёмная сцена: падение яркости, потеря контраста, размытие, шум камеры."""
    rng = np.random.default_rng(seed)
    out = img.astype(np.float32)
    out = out * 0.34 + 14.0                     # затемнение сцены
    out = cv2.GaussianBlur(out, (5, 5), 1.2)    # расфокус/смаз
    noise = rng.normal(0, 16.0, out.shape)      # шум сенсора в темноте
    return np.clip(out + noise, 0, 255).astype(np.uint8)


def main() -> None:
    img = cv2.imread(IMG)
    if img is None:
        raise SystemExit(f"не удалось открыть {IMG}")
    h, w = img.shape[:2]
    print(f"изображение: {w}x{h} px, ожидаемый ID: {EXPECTED}")

    ok = True
    ok &= report(img, "1. полная карточка, как есть")
    ok &= report(simulate_low_light(img), "3. полная карточка, плохой свет")

    # Зона QR: примерно 19%..80% высоты карточки, без текста и внешних полей
    crop = img[int(h * 0.19) : int(h * 0.80), int(w * 0.14) : int(w * 0.86)]
    ok &= report(crop, "2. обрезка зоны QR без рамки")
    ok &= report(simulate_low_light(crop), "4. обрезка QR, плохой свет")

    print("ИТОГ:", "ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ" if ok else "ЕСТЬ ПРОБЛЕМЫ")
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
