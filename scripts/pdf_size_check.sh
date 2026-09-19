#!/bin/bash
# Извлечение PDF из браузера и проверка физического размера метки в файле
set -e
cd /home/z/my-project
B="agent-browser"

$B open http://localhost:81/ > /dev/null
$B wait --load networkidle > /dev/null
$B set viewport 1440 900 > /dev/null
sleep 2
$B find first "#marker-name" fill "Камри" > /dev/null 2>&1 || true
sleep 1

$B eval "
window.__blobs = [];
window.__origCreate = URL.createObjectURL.bind(URL);
URL.createObjectURL = (b) => { window.__lastBlob = b; return window.__origCreate(b); };
'ok'" --json > /dev/null
$B eval "[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'PDF' && !b.disabled).click(); 'clicked'" --json > /dev/null
sleep 3

# blob -> base64 через FileReader (асинхронно, зондом)
$B eval "
window.__b64 = null;
const fr = new FileReader();
fr.onload = () => { window.__b64 = fr.result.split(',')[1]; };
fr.readAsDataURL(window.__lastBlob);
'reading'" --json > /dev/null
sleep 2
LEN=$($B eval "window.__b64 ? window.__b64.length : 0" --json 2>/dev/null | python3 -c "
import json,sys
d = json.load(sys.stdin)
print(d.get('data',{}).get('result'))")
echo "base64 length: $LEN"

# печать base64 в файл частями (agent-browser вывод ограничен — берём частями по 20000)
python3 - << 'PYEOF'
import subprocess, json, base64

B = "agent-browser"
def ev(expr):
    out = subprocess.run([B, "eval", expr, "--json"], capture_output=True, text=True).stdout
    d = json.loads(out)
    return d.get("data", {}).get("result")

total = int(ev("window.__b64 ? window.__b64.length : 0"))
chunks = []
CH = 20000
for i in range(0, total, CH):
    chunks.append(ev(f"window.__b64.slice({i}, {i + CH})"))
b64 = "".join(chunks)
assert len(b64) == total, f"chunk loss: {len(b64)} != {total}"
data = base64.b64decode(b64)
open("/home/z/my-project/scripts/out/pdf-marker.pdf", "wb").write(data)
print("saved", len(data), "bytes")
PYEOF

echo "=== Разбор PDF: размер метки ==="
python3 - << 'PYEOF'
import re, zlib

raw = open("/home/z/my-project/scripts/out/pdf-marker.pdf", "rb").read()
print("magic:", raw[:8])
print("eof:", b"%%EOF" in raw[-2048:])

# MediaBox
mb = re.search(rb"MediaBox\s*\[([^\]]+)\]", raw)
if mb:
    print("MediaBox:", mb.group(1).decode().strip(), "(A4 = 595.28 x 841.89 pt; 1 pt = 0.3528 мм)")

# Инфлейт всех потоков, ищем матрицу cm
found = []
for m in re.finditer(rb"stream\r?\n", raw):
    start = m.end()
    end = raw.find(b"endstream", start)
    if end < 0:
        continue
    data = raw[start:end].rstrip(b"\r\n")
    try:
        text = zlib.decompress(data)
    except Exception:
        continue
    # q w 0 0 h x y cm ... Do
    for cm in re.finditer(rb"([\d.]+) 0 0 ([\d.]+) ([\d.-]+) ([\d.-]+) cm\s*/(\S+) Do", text):
        w, h, x, y = (float(cm.group(i)) for i in range(1, 5))
        found.append((w, h, x, y, cm.group(5).decode()))
if not found:
    print("матрица не найдена (поток не zlib?)")
else:
    for w, h, x, y, name in found:
        print(f"изображение {name}: {w:.2f} x {h:.2f} pt = {w*0.3528:.1f} x {h*0.3528:.1f} мм; позиция x={x:.1f} y={y:.1f}")
        # проверка центрирования на A4 595.28x841.89 (jsPDF: x,y — левый нижний угол)
        cx = x + w / 2
        cy = y + h / 2
        print(f"  центр: ({cx:.1f}, {cy:.1f}) из (297.6, 420.9) — центрирование: {'ДА' if abs(cx-297.64) < 1 and abs(cy-420.94) < 1 else 'НЕТ'}")
PYEOF
echo "DONE"
