#!/bin/bash
# Итерация 1: браузерная сессия — рендеры меток через реальный UI.
# Сервер и все шаги живут в ОДНОЙ команде (процессы между командами убиваются).
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

render_name() {
  $B find role textbox fill "$1" --name "Название метки" > /dev/null 2>&1 || \
  $B find label "Название метки" fill "$1" > /dev/null 2>&1 || \
  $B find first "#marker-name" fill "$1" > /dev/null
  sleep 1
}

get_canvas() {
  $B eval "document.querySelector('canvas') ? document.querySelector('canvas').toDataURL('image/png') : 'NO_CANVAS'" --json
}

render_name "Камри"
get_canvas > "$OUT/it1-kamry-1.json"
render_name "Камри"
get_canvas > "$OUT/it1-kamry-2.json"
render_name "Молния"
get_canvas > "$OUT/it1-molniya.json"

$B screenshot "$OUT/it1-page.png" --full
$B errors > "$OUT/it1-errors.json" 2>&1 || true
$B console > "$OUT/it1-console.txt" 2>&1 || true

pkill -f "next dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
echo "BROWSER SESSION DONE"
