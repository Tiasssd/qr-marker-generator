#!/bin/bash
# Верификация Task 20 (поделиться ссылкой): deep-link заполняет форму,
# OG-мета персональная, кнопка шеринга копирует верный URL, фолбэк размера.
set -e
cd /home/z/my-project
OUT=scripts/out
B="agent-browser"

echo "=== 1. Deep-link ?name=Тайфун&size=13 ==="
$B open "http://localhost:81/?name=%D0%A2%D0%B0%D0%B9%D1%84%D1%83%D0%BD&size=13" > /dev/null
$B wait --load networkidle > /dev/null
$B set viewport 1440 900 > /dev/null
sleep 2
D=$($B eval "(() => {
  const active = document.querySelector('[data-state=on][aria-label]');
  return JSON.stringify({
    input: document.getElementById('marker-name') ? document.getElementById('marker-name').value : null,
    activeSize: active ? active.getAttribute('aria-label') : null,
    canvasLen: document.querySelector('canvas') ? document.querySelector('canvas').toDataURL('image/png').length : 0,
    docTitle: document.title,
    ogTitle: (document.querySelector('meta[property=\"og:title\"]') || {}).content || null,
    ogDesc: (document.querySelector('meta[property=\"og:description\"]') || {}).content || null,
    twCard: (document.querySelector('meta[name=\"twitter:card\"]') || {}).content || null
  });
})()" --json)
echo "$D" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('data',{}).get('result'); r=json.loads(r) if isinstance(r,str) else r; print(json.dumps(r, ensure_ascii=False, indent=1))"
$B screenshot "$OUT/t20-1-deeplink.png" > /dev/null

echo "=== 2. Кнопка «Поделиться» копирует URL (перехват буфера) ==="
S=$($B eval "(() => { return (async () => {
  let captured = null;
  const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
  navigator.clipboard.writeText = (t) => { captured = t; return Promise.resolve(); };
  const btns = [...document.querySelectorAll('button')];
  const share = btns.find(b => b.textContent.includes('Поделиться'));
  if (!share) return JSON.stringify({error: 'нет кнопки'});
  share.click();
  await new Promise(r => setTimeout(r, 600));
  navigator.clipboard.writeText = orig;
  const toast = [...document.querySelectorAll('[data-radix-toast-viewport] *, [role=status]')].map(e=>e.textContent).join(' ');
  return JSON.stringify({captured, toastShown: toast.includes('Ссылка скопирована')});
})(); })()" --json)
echo "$S" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('data',{}).get('result'); r=json.loads(r) if isinstance(r,str) else r; print(json.dumps(r, ensure_ascii=False, indent=1))"
$B screenshot "$OUT/t20-2-share-toast.png" > /dev/null

echo "=== 3. Фолбэк: некорректный size=99 → 16 см; пустой name игнорируется ==="
$B open "http://localhost:81/?name=%D0%9C%D0%BE%D0%BB%D0%BD%D0%B8%D1%8F&size=99" > /dev/null
$B wait --load networkidle > /dev/null
sleep 2
F=$($B eval "(() => {
  const active = document.querySelector('[data-state=on][aria-label]');
  return JSON.stringify({
    input: document.getElementById('marker-name').value,
    activeSize: active ? active.getAttribute('aria-label') : null
  });
})()" --json)
echo "$F" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('data',{}).get('result'); r=json.loads(r) if isinstance(r,str) else r; print(json.dumps(r, ensure_ascii=False))"
$B open "http://localhost:81/?name=&size=13" > /dev/null
$B wait --load networkidle > /dev/null
sleep 1.5
E=$($B eval "JSON.stringify({input: document.getElementById('marker-name') ? document.getElementById('marker-name').value : '?', onboarding: !!document.querySelector('ol')})" --json)
echo "$E" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('data',{}).get('result'); r=json.loads(r) if isinstance(r,str) else r; print('empty-name:', json.dumps(r, ensure_ascii=False))"

echo "=== 4. Консоль ==="
$B errors --json > "$OUT/t20-errors.json" 2>/dev/null || true
python3 -c "
import json
d = json.load(open('$OUT/t20-errors.json'))
errs = d.get('data', {}).get('errors', [])
print('console errors:', len(errs))
for e in errs[:5]: print(' -', str(e)[:200])
"

echo "DONE"
