#!/bin/bash
# Watchdog: держит production-сервер «Генератор AR-меток» живым.
# Запускается через setsid --fork (переживает границы Bash-команд).
# Логика: раз в 30 сек проверяем ответ http://localhost:3000;
# если соединения нет — перезапускаем standalone-сервер Next.js.

while true; do
  if ! curl -s -o /dev/null --max-time 5 http://localhost:3000/ 2>/dev/null; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') watchdog: сервер не отвечает, перезапускаю" >> /home/z/my-project/scripts/watchdog.log
    cd /home/z/my-project/scripts/prod-deploy
    setsid --fork env NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 bun standalone/server.js >> /home/z/my-project/scripts/prod-deploy/server.log 2>&1
    sleep 8
  fi
  sleep 30
done
