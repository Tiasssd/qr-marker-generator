#!/bin/bash
# Верификация фиксов: гидрация (2 загрузки + reload), онбординг 2 шага без оверфлоу,
# функциональность (ввод → canvas), мобильный 390. Всё через прокси 81.
set -e
cd /home/z/my-project
OUT=scripts/out
mkdir -p "$OUT"
B="agent-browser"

echo "=== 1. Первая загрузка + гидрация ==="
$B open http://localhost:81/ > /dev/null
$B wait --load networkidle > /dev/null
$B set viewport 1440 900 > /dev/null
sleep 2
$B errors --json > "$OUT/fix17-1-errors.json" 2>/dev/null || true
python3 -c "
import json
d = json.load(open('$OUT/fix17-1-errors.json'))
print('errors:', json.dumps(d.get('data', {}).get('errors', []), ensure_ascii=False)[:600])
"

echo "=== 2. Reload (повторная гидрация) ==="
$B open http://localhost:81/ > /dev/null
$B wait --load networkidle > /dev/null
sleep 2
$B errors --json > "$OUT/fix17-2-errors.json" 2>/dev/null || true
python3 -c "
import json
d = json.load(open('$OUT/fix17-2-errors.json'))
print('errors:', json.dumps(d.get('data', {}).get('errors', []), ensure_ascii=False)[:600])
"

echo "=== 3. Онбординг: число шагов и видимые границы текста (Range) ==="
GEO=$($B eval "
(() => {
  const box = document.querySelector('ol');
  const lis = [...document.querySelectorAll('ol li')];
  const boxR = box ? box.getBoundingClientRect() : null;
  return JSON.stringify({
    steps: lis.length,
    titles: lis.map(li => li.querySelector('span span').textContent),
    items: lis.map(li => {
      const r = li.getBoundingClientRect();
      const title = li.querySelectorAll('span span')[0];
      const text = li.querySelectorAll('span span')[1];
      const range = document.createRange();
      const measure = (el) => {
        if (!el) return null;
        range.selectNodeContents(el);
        const tr = range.getBoundingClientRect();
        return Math.round(tr.right);
      };
      return {
        liRight: Math.round(r.right),
        titleTextRight: measure(title),
        descTextRight: measure(text),
        titleOver: measure(title) > Math.round(r.right),
        descOver: measure(text) > Math.round(r.right)
      };
    }),
    olRight: boxR ? Math.round(boxR.right) : null
  });
})()" --json)
echo "$GEO" | python3 -c "
import json,sys
d = json.load(sys.stdin)
r = d['data']['result'] if 'result' in d.get('data',{}) else d.get('result')
r = json.loads(r) if isinstance(r, str) else r
print('шагов:', r['steps'], '| названия:', r['titles'])
ok = True
for it in r['items']:
    print('li right:', it['liRight'], '| title text right:', it['titleTextRight'], '| desc right:', it['descTextRight'])
    if it['titleOver'] or it['descOver']:
        ok = False
print('OVERFLOW:', 'НЕТ — текст внутри карточек' if ok else 'ЕСТЬ!')
"

$B screenshot "$OUT/fix17-3-onboarding.png" > /dev/null

echo "=== 4. Функциональность: ввод имени → canvas + заголовок ==="
$B find first "#marker-name" fill "Камри" > /dev/null 2>&1 || true
sleep 1.5
STATS=$($B eval "JSON.stringify({
  canvasLen: document.querySelector('canvas') ? document.querySelector('canvas').toDataURL('image/png').length : 0,
  title: document.title,
  stickyBar: !!document.querySelector('.marker-sticky-bar')
})" --json)
echo "$STATS" | head -c 300
echo ""
$B errors --json > "$OUT/fix17-4-errors.json" 2>/dev/null || true
python3 -c "
import json
d = json.load(open('$OUT/fix17-4-errors.json'))
print('errors после ввода:', json.dumps(d.get('data', {}).get('errors', []), ensure_ascii=False)[:600])
"
$B screenshot "$OUT/fix17-4-filled.png" > /dev/null

echo "=== 5. Мобильный 390 ==="
$B open http://localhost:81/ > /dev/null
$B wait --load networkidle > /dev/null
$B set viewport 390 844 > /dev/null
sleep 2
MOB=$($B eval "JSON.stringify({
  scrollW: document.documentElement.scrollWidth,
  clientW: document.documentElement.clientWidth,
  steps: document.querySelectorAll('ol li').length
})" --json)
echo "$MOB" | head -c 200
echo ""
# видимые границы текста на мобильном (одна колонка)
MGEO=$($B eval "
(() => {
  const lis = [...document.querySelectorAll('ol li')];
  const range = document.createRange();
  return JSON.stringify(lis.map(li => {
    const r = li.getBoundingClientRect();
    const title = li.querySelectorAll('span span')[0];
    range.selectNodeContents(title);
    const tr = range.getBoundingClientRect();
    return { liRight: Math.round(r.right), textRight: Math.round(tr.right) };
  }));
})()" --json)
echo "$MGEO" | head -c 400
echo ""
$B errors --json > "$OUT/fix17-5-mobile-errors.json" 2>/dev/null || true
python3 -c "
import json
d = json.load(open('$OUT/fix17-5-mobile-errors.json'))
print('errors мобильный:', json.dumps(d.get('data', {}).get('errors', []), ensure_ascii=False)[:400])
"
$B screenshot "$OUT/fix17-5-mobile.png" > /dev/null

echo "DONE"
