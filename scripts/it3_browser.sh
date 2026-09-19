#!/bin/bash
# Итерация 3: пользовательские потоки + скриншоты для VLM-ревью.
set -e
cd /home/z/my-project
OUT=scripts/out
mkdir -p "$OUT"

(setsid nohup bun run dev > /dev/null 2>&1 < /dev/null & disown)
for i in $(seq 1 40); do curl -s -o /dev/null http://localhost:3000 2>/dev/null && break; sleep 1; done
sleep 2

B="agent-browser"
$B open http://127.0.0.1:3000 > /dev/null
$B wait --load networkidle > /dev/null
$B set viewport 1440 900 > /dev/null
# чистая история для детерминированного теста
$B eval "localStorage.clear(); 'cleared'" --json > /dev/null
$B open http://127.0.0.1:3000 > /dev/null
$B wait --load networkidle > /dev/null

fill_name() {
  $B find role textbox fill "$1" --name "Название метки" > /dev/null 2>&1 || \
  $B find label "Название метки" fill "$1" > /dev/null 2>&1 || \
  $B find first "#marker-name" fill "$1" > /dev/null
  sleep 0.8
}

# --- 1. Desktop: превью ---
fill_name "Камри"
sleep 1
$B screenshot "$OUT/it3-desktop.png" --full

# --- 2. Контраст-аудит всех текстов ---
$B eval "$(cat scripts/contrast-audit.js)" --json > "$OUT/it3-contrast.json" || true

# --- 3. Скачивание: тост + история ---
$B eval "[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Скачать PNG').click(); 'clicked'" --json > /dev/null
$B wait --text "PNG сохранён" > /dev/null 2>&1 || true
sleep 0.5
$B screenshot "$OUT/it3-toast.png"
$B eval "document.querySelectorAll('article').length" --json > "$OUT/it3-hist1.json"

# --- 4. Вторая метка ---
fill_name "Молния"
$B eval "[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Скачать PNG').click(); 'clicked'" --json > /dev/null
sleep 1.5
$B eval "document.querySelectorAll('article').length" --json > "$OUT/it3-hist2.json"

# --- 5. Загрузка из истории ---
$B eval "[...document.querySelectorAll('button')].find(b => (b.title || '') === 'Загрузить в редактор').click(); 'loaded'" --json > /dev/null
sleep 0.8
$B eval "document.getElementById('marker-name').value" --json > "$OUT/it3-restored.json"

# --- 6. История: скриншот ---
$B scroll down 900 > /dev/null 2>&1 || true
sleep 0.4
$B screenshot "$OUT/it3-history.png" --full

# --- 7. Печать одной метки (print-портал + PDF через print-эмуляцию) ---
$B eval "[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Печать').click(); 'print'" --json > /dev/null
sleep 1.2
$B pdf "$OUT/it3-print.pdf" > /dev/null 2>&1 || $B pdf "$OUT/it3-print.pdf" || true

# --- 8. Mobile ---
$B set viewport 390 844 > /dev/null
$B open http://127.0.0.1:3000 > /dev/null
$B wait --load networkidle > /dev/null
fill_name "Синий седан"
sleep 1
$B screenshot "$OUT/it3-mobile.png" --full
$B eval "document.documentElement.scrollWidth <= window.innerWidth ? 'no-overflow' : 'overflow:' + document.documentElement.scrollWidth" --json > "$OUT/it3-overflow.json"

# --- 9. Ошибки ---
$B errors > "$OUT/it3-errors.txt" 2>&1 || true
$B console > "$OUT/it3-console.txt" 2>&1 || true

pkill -f "next dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
echo "IT3 BROWSER SESSION DONE"
