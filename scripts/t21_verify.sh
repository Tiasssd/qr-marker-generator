#!/bin/bash
# Верификация Task 21 (облако, мок-режим): чип статуса, пуш при коммите,
# появление облачной метки после reload, бейдж «Облако», консоль.
set -e
cd /home/z/my-project
OUT=scripts/out
B="agent-browser"
rm -f "$OUT/mock-supabase.json"
# перезапуск мока с чистыми данными
pkill -f "mock-supabase" 2>/dev/null || true
sleep 0.5
setsid --fork bun scripts/mock-supabase.ts > "$OUT/mock.log" 2>&1
sleep 1

echo "=== 1. Чип статуса: «Синхронизировано» после загрузки ==="
$B open "http://localhost:81/" > /dev/null
$B wait --load networkidle > /dev/null
$B set viewport 1440 900 > /dev/null
$B eval "localStorage.clear(); 'cleared'" --json > /dev/null
$B open "http://localhost:81/" > /dev/null
$B wait --load networkidle > /dev/null
sleep 2
C=$($B eval "(() => {
  const chip = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Синхронизировано') || b.textContent.includes('Локально') || b.textContent.includes('Облако недоступно'));
  return JSON.stringify({chip: chip ? chip.textContent.trim() : null, title: chip ? chip.title : null});
})()" --json)
echo "$C" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('data',{}).get('result'); r=json.loads(r) if isinstance(r,str) else r; print(json.dumps(r, ensure_ascii=False))"

echo "=== 2. Коммит метки (шеринг) → POST в мок ==="
$B find first "#marker-name" fill "Облачный тест" > /dev/null 2>&1 || true
sleep 1
# шеринг копирует ссылку И пушит в облако (перехват буфера)
$B eval "(() => { return (async () => {
  navigator.clipboard.writeText = () => Promise.resolve();
  const share = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Поделиться'));
  share.click();
  await new Promise(r => setTimeout(r, 1200));
  return 'clicked';
})(); })()" --json > /dev/null
sleep 1
echo "мок-файл:"; cat "$OUT/mock-supabase.json" 2>/dev/null || echo "(пусто)"

echo "=== 3. Reload: облачная метка с бейджем (история localStorage пуста) ==="
$B open "http://localhost:81/" > /dev/null
$B wait --load networkidle > /dev/null
sleep 2
R=$($B eval "(() => {
  const cards = [...document.querySelectorAll('article')];
  const cloudCards = cards.filter(c => c.textContent.includes('Облако'));
  const chip = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Синхронизировано'));
  return JSON.stringify({
    totalCards: cards.length,
    cloudCards: cloudCards.length,
    cloudNames: cloudCards.map(c => (c.querySelector('span[title]')||{}).title),
    cloudCanvas: cloudCards.length > 0 && cloudCards[0].querySelector('canvas') ? true : false,
    chip: chip ? chip.title : null,
    localBadge: (document.querySelector('h2 span') || {}).textContent
  });
})()" --json)
echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('data',{}).get('result'); r=json.loads(r) if isinstance(r,str) else r; print(json.dumps(r, ensure_ascii=False, indent=1))"
$B screenshot "$OUT/t21-1-cloud-badge.png" > /dev/null

echo "=== 4. Скачивание облачной метки работает (PNG) ==="
$B eval "(() => { return (async () => {
  const cards = [...document.querySelectorAll('article')].filter(c => c.textContent.includes('Облако'));
  if (!cards.length) return 'нет облачных карточек';
  const btn = [...cards[0].querySelectorAll('button')].find(b => b.textContent.includes('Скачать'));
  btn.click();
  await new Promise(r => setTimeout(r, 800));
  const toasts = [...document.querySelectorAll('[role]')].map(e => e.textContent).join(' ');
  return JSON.stringify({toast: toasts.includes('PNG сохранён')});
})(); })()" --json | python3 -c "import json,sys; d=json.load(sys.stdin); print('download:', d.get('data',{}).get('result'))"

echo "=== 5. Консоль ==="
$B errors --json > "$OUT/t21-errors.json" 2>/dev/null || true
python3 -c "
import json
d = json.load(open('$OUT/t21-errors.json'))
errs = d.get('data', {}).get('errors', [])
print('console errors:', len(errs))
for e in errs[:5]: print(' -', str(e)[:200])
"

echo "=== 6. Оффлайн-режим облака (мок выключен → error-статус, приложение живо) ==="
pkill -f "mock-supabase" 2>/dev/null || true
sleep 0.5
$B eval "location.reload(); 'reload'" --json > /dev/null
sleep 3
O=$($B eval "(() => {
  const chip = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Облако недоступно'));
  return JSON.stringify({errorChip: chip ? true : false, inputAlive: !!document.getElementById('marker-name')});
})()" --json)
echo "$O" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('data',{}).get('result'); r=json.loads(r) if isinstance(r,str) else r; print(json.dumps(r, ensure_ascii=False))"
$B screenshot "$OUT/t21-2-cloud-error.png" > /dev/null
$B errors --json > "$OUT/t21-errors2.json" 2>/dev/null || true
python3 -c "
import json
d = json.load(open('$OUT/t21-errors2.json'))
print('console errors (cloud error state):', len(d.get('data', {}).get('errors', [])))
"
echo "DONE"
