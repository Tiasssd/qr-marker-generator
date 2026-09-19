#!/bin/bash
# Диагностика: ошибка гидрации + текущее состояние онбординга «Как это работает»
set -e
cd /home/z/my-project
OUT=scripts/out
mkdir -p "$OUT"
B="agent-browser"

$B open http://localhost:81/ > /dev/null
$B wait --load networkidle > /dev/null
$B set viewport 1440 900 > /dev/null
sleep 2

# 1) Все ошибки консоли/страницы (полный JSON)
$B errors --json > "$OUT/hydr-1-errors.json" 2>/dev/null || true
echo "--- ERRORS (первый визит) ---"
head -c 3000 "$OUT/hydr-1-errors.json"

# 2) Перезагрузка страницы — гидрация случается и при повторном заходе
$B open http://localhost:81/ > /dev/null
$B wait --load networkidle > /dev/null
sleep 2
$B errors --json > "$OUT/hydr-2-errors.json" 2>/dev/null || true
echo ""
echo "--- ERRORS (после reload) ---"
head -c 4000 "$OUT/hydr-2-errors.json"

# 3) Скриншот пустого состояния (онбординг с 3 шагами, узкие колонки)
$B screenshot "$OUT/hydr-3-onboarding.png" > /dev/null

# 4) Геометрия шага 2 «Скачайте и распечатайте»: не вылезает ли текст за карточку
GEO=$($B eval "
(() => {
  const lis = [...document.querySelectorAll('ol li')];
  return JSON.stringify(lis.map(li => {
    const r = li.getBoundingClientRect();
    const title = li.querySelector('span span');
    const tr = title ? title.getBoundingClientRect() : null;
    return {
      title: title ? title.textContent : null,
      liW: Math.round(r.width),
      textRight: tr ? Math.round(tr.right) : null,
      liRight: Math.round(r.right),
      overflowPx: tr ? Math.round(tr.right - r.right) : null
    };
  }));
})()" --json | head -c 1200)
echo ""
echo "--- ONBOARDING GEO ---"
echo "$GEO"
echo "DONE"
