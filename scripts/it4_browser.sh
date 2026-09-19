#!/bin/bash
# Итерация 4: экзотические вводы.
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

fill_name() {
  $B find role textbox fill "$1" --name "Название метки" > /dev/null 2>&1 || \
  $B find label "Название метки" fill "$1" > /dev/null 2>&1 || \
  $B find first "#marker-name" fill "$1" > /dev/null
  sleep 0.8
}

# --- 1. Пустое имя: кнопка заблокирована, Enter даёт предупреждение ---
fill_name ""
$B eval "[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Скачать PNG').disabled" --json > "$OUT/it4-empty-disabled.json"
$B eval "document.getElementById('marker-name').focus(); document.getElementById('marker-name').dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})); 'enter'" --json > /dev/null
$B wait --text "Введите название" > /dev/null 2>&1 || true

# --- 2. Имя из пробелов: кнопка всё ещё заблокирована ---
fill_name "   "
$B eval "[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Скачать PNG').disabled" --json > "$OUT/it4-spaces-disabled.json"

# --- 3. Односимвольное имя ---
fill_name "A"
$B eval "document.querySelector('canvas') ? document.querySelector('canvas').toDataURL('image/png').length : 0" --json > "$OUT/it4-single-char.json"

# --- 4. Максимально длинное имя (36 символов) ---
fill_name "Очень длинное название метки для проверки обрезки текста сверху"
$B eval "document.querySelector('canvas') ? document.querySelector('canvas').toDataURL('image/png').length : 0" --json > "$OUT/it4-long.json"
$B screenshot "$OUT/it4-long-name.png"

# --- 5. Спецсимволы ---
fill_name "ГАЗ-21 !!! №;%"
$B eval "document.querySelector('canvas') ? document.querySelector('canvas').toDataURL('image/png').length : 0" --json > "$OUT/it4-special.json"
$B screenshot "$OUT/it4-special-name.png"

$B errors > "$OUT/it4-errors.txt" 2>&1 || true

pkill -f "next dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
echo "IT4 EXOTIC SESSION DONE"
