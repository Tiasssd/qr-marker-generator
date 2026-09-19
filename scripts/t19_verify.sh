#!/bin/bash
# Верификация Task 19 (тёмная тема): светлая по умолчанию, переключение,
# персистентность после reload, консоль, мобильный 390 в тёмной, canvas живой.
set -e
cd /home/z/my-project
OUT=scripts/out
mkdir -p "$OUT"
B="agent-browser"

echo "=== 1. Светлая по умолчанию (чистый профиль) ==="
$B open "http://localhost:81/" > /dev/null
$B wait --load networkidle > /dev/null
$B set viewport 1440 900 > /dev/null
$B eval "localStorage.clear(); 'cleared'" --json > /dev/null
$B open "http://localhost:81/" > /dev/null
$B wait --load networkidle > /dev/null
sleep 2
L=$($B eval "JSON.stringify({dark: document.documentElement.classList.contains('dark'), bodyBg: getComputedStyle(document.body).backgroundColor})" --json)
echo "$L" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('data',{}).get('result'); print('light-mode:', r)"
$B screenshot "$OUT/t19-1-light.png" > /dev/null

echo "=== 2. Ввод имени + переключение в тёмную ==="
$B find first "#marker-name" fill "Камри" > /dev/null 2>&1 || true
sleep 1
$B eval "document.querySelector('button[aria-label=\"Переключить светлую и тёмную тему\"]').click(); 'toggled'" --json > /dev/null
sleep 0.5
D=$($B eval "JSON.stringify({dark: document.documentElement.classList.contains('dark'), stored: localStorage.getItem('ar-theme'), canvasLen: (document.querySelector('canvas')||{}).toDataURL ? document.querySelector('canvas').toDataURL('image/png').length : 0})" --json)
echo "$D" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('data',{}).get('result'); print('dark-mode:', r)"
$B screenshot "$OUT/t19-2-dark-filled.png" > /dev/null

echo "=== 3. Персистентность: reload держит тёмную ==="
$B open "http://localhost:81/" > /dev/null
$B wait --load networkidle > /dev/null
sleep 2
P=$($B eval "JSON.stringify({dark: document.documentElement.classList.contains('dark'), stored: localStorage.getItem('ar-theme'), inputVal: document.getElementById('marker-name') ? document.getElementById('marker-name').value : ''})" --json)
echo "$P" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('data',{}).get('result'); print('after-reload:', r)"
$B screenshot "$OUT/t19-3-dark-reload.png" > /dev/null

echo "=== 4. Ошибки консоли (тёмная, после reload) ==="
$B errors --json > "$OUT/t19-errors.json" 2>/dev/null || true
python3 -c "
import json
d = json.load(open('$OUT/t19-errors.json'))
errs = d.get('data', {}).get('errors', [])
print('console errors:', len(errs))
for e in errs[:5]: print(' -', str(e)[:200])
"

echo "=== 5. Тёмная онбординг-пустое состояние (очистить ввод) ==="
$B find first "#marker-name" fill "" > /dev/null 2>&1 || true
sleep 1
$B eval "document.querySelector('#marker-name').value=''; document.querySelector('#marker-name').dispatchEvent(new Event('input',{bubbles:true})); 'reset'" --json > /dev/null
sleep 1
$B screenshot "$OUT/t19-4-dark-empty.png" > /dev/null

echo "=== 6. Мобильный 390 тёмная ==="
$B set viewport 390 844 > /dev/null
$B eval "document.querySelector('button[aria-label=\"Переключить светлую и тёмную тему\"]').click(); 'light again'" --json > /dev/null
sleep 0.3
M=$($B eval "JSON.stringify({scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, dark: document.documentElement.classList.contains('dark')})" --json)
echo "$M" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('data',{}).get('result'); print('mobile-light:', r)"
# снова в тёмную + метка
$B eval "document.querySelector('button[aria-label=\"Переключить светлую и тёмную тему\"]').click(); 'dark'" --json > /dev/null
$B find first "#marker-name" fill "Молния" > /dev/null 2>&1 || true
sleep 1.5
M2=$($B eval "JSON.stringify({scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, dark: document.documentElement.classList.contains('dark'), sticky: !!document.querySelector('.marker-sticky-bar')})" --json)
echo "$M2" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('data',{}).get('result'); print('mobile-dark:', r)"
$B screenshot "$OUT/t19-5-mobile-dark.png" > /dev/null
$B errors --json > "$OUT/t19-errors2.json" 2>/dev/null || true
python3 -c "
import json
d = json.load(open('$OUT/t19-errors2.json'))
print('console errors mobile:', len(d.get('data', {}).get('errors', [])))
"

echo "DONE"
