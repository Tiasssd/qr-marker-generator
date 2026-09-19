#!/bin/bash
# Фикс упавшего сервера: верификация через прокси (путь превью) на production-сборке.
set -e
cd /home/z/my-project
OUT=scripts/out
mkdir -p "$OUT"

B="agent-browser"

# 1) Открываем через Caddy-прокси (порт 81) — тот же путь, что проходит превью-ссылка
$B open http://localhost:81/ > /dev/null
$B wait --load networkidle > /dev/null
$B set viewport 1440 900 > /dev/null

# 2) Проверяем, что страница живая: заголовок
TITLE=$($B eval "document.title" --json | head -c 300)
echo "TITLE: $TITLE"

# 3) Проверяем наличие canvas и ввода названия
STATS=$($B eval "JSON.stringify({
  canvases: document.querySelectorAll('canvas').length,
  textbox: !!document.querySelector('input'),
  bodyText: document.body.innerText.includes('Генератор') || document.body.innerText.includes('метк')
})" --json | head -c 300)
echo "STATS: $STATS"

# 4) Вводим название и ждём отрисовку метки
$B find first "#marker-name" fill "Камри" > /dev/null 2>&1 || \
$B find role textbox fill "Камри" --name "Название метки" > /dev/null 2>&1 || true
sleep 1

CANVAS=$($B eval "document.querySelector('canvas') ? document.querySelector('canvas').toDataURL('image/png').length : 'NO_CANVAS'" --json | head -c 200)
echo "CANVAS_PNG_LEN: $CANVAS"

# 5) Ошибки консоли и страницы
ERRORS=$($B errors --json 2>/dev/null | head -c 500)
echo "ERRORS: $ERRORS"

# 6) Скриншот страницы через прокси
$B screenshot "$OUT/fix-server-page.png" > /dev/null
echo "SCREENSHOT saved"

# 7) Мобильная вёрстка через прокси
$B set viewport 390 844 > /dev/null
sleep 1
OVERFLOW=$($B eval "JSON.stringify({scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth})" --json | head -c 200)
echo "MOBILE: $OVERFLOW"
$B screenshot "$OUT/fix-server-mobile.png" > /dev/null

echo "DONE"
