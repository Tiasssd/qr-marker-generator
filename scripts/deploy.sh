#!/bin/bash
# Деплой: сборка → чистый снапшот в scripts/prod-deploy → рестарт сервера + watchdog
set -e
cd /home/z/my-project

echo "=== 1. Сборка ==="
bun run build 2>&1 | tail -12

echo "=== 2. Чистый снапшот ==="
rm -rf scripts/prod-deploy/standalone
mkdir -p scripts/prod-deploy
cp -r .next/standalone scripts/prod-deploy/standalone
rm -rf scripts/prod-deploy/standalone/.next/static
cp -r .next/static scripts/prod-deploy/standalone/.next/static
# public НЕ полагаемся на содержимое standalone — синкаем свежим целиком
# (иконки/манифест/sw.js появляются без пересборки HTML)
rm -rf scripts/prod-deploy/standalone/public
cp -r public scripts/prod-deploy/standalone/public
# версия кеша SW = BUILD_ID: каждый деплой открывает свежий кеш, старый подчищается
BID=$(cat .next/BUILD_ID)
sed -i "s/__BUILD_ID__/$BID/" scripts/prod-deploy/standalone/public/sw.js
echo "snapshot ok: $(ls scripts/prod-deploy/standalone | tr '\n' ' ') + public($(ls public | wc -l)) + sw-version:$BID"

echo "=== 3. Рестарт сервера ==="
# pid по слушателю порта 3000 (не по cmdline — урок Task 15)
PID=$(ss -ltnp 2>/dev/null | grep ':3000' | grep -oP 'pid=\K[0-9]+' | head -1 || true)
if [ -n "$PID" ]; then
  echo "убиваю старый сервер pid=$PID"
  kill "$PID" || true
  sleep 3
fi
setsid --fork env NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 \
  bun scripts/prod-deploy/standalone/server.js \
  >> scripts/prod-deploy/server.log 2>&1

# ждём ответа
for i in $(seq 1 20); do
  if curl -s -o /dev/null --max-time 3 http://localhost:3000/; then
    echo "сервер отвечает (попытка $i)"
    break
  fi
  sleep 1
done
curl -s -o /dev/null -w "port3000: %{http_code}\n" http://localhost:3000/
curl -s -o /dev/null -w "proxy81:  %{http_code}\n" http://localhost:81/

echo "=== 4. Watchdog ==="
# watchdog умер при перезапуске окружения — поднимаем заново (если уже жив, не дублируем)
if ! pgrep -f "scripts/watchdog.sh" > /dev/null 2>&1; then
  setsid --fork bash scripts/watchdog.sh
  echo "watchdog запущен"
else
  echo "watchdog уже жив: $(pgrep -f 'scripts/watchdog.sh' | head -1)"
fi

echo "DONE"
