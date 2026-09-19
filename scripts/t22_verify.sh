#!/bin/bash
# Верификация Task 22: счётчик узоров в подвале истории (точное число),
# «Занято» растёт с историей, коллизионное предупреждение на паре
# «Машина 481» / «Машина 2785» (найдена полным перебором), консоль.
set -e
cd /home/z/my-project
OUT=scripts/out
B="agent-browser"

echo "=== 1. Счётчик: точная ёмкость + занято 0 ==="
$B open "http://localhost:81/" > /dev/null
$B wait --load networkidle > /dev/null
$B set viewport 1440 900 > /dev/null
$B eval "localStorage.clear(); 'cleared'" --json > /dev/null
$B open "http://localhost:81/" > /dev/null
$B wait --load networkidle > /dev/null
sleep 2
C=$($B eval "(() => {
  const el = [...document.querySelectorAll('div')].find(d => d.textContent.includes('Уникальных узоров'));
  return JSON.stringify({counter: el ? el.textContent.replace(/\\s+/g,' ').trim() : null});
})()" --json)
echo "$C" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('data',{}).get('result'); r=json.loads(r) if isinstance(r,str) else r; print(json.dumps(r, ensure_ascii=False))"
$B screenshot "$OUT/t22-1-counter-empty.png" > /dev/null

echo "=== 2. Занято растёт: добавляем метку в историю ==="
# инжект истории с меткой «Машина 481» напрямую в localStorage
$B eval "(() => {
  const h = [{name: 'Машина 481', id: 'X', ts: Date.now()}];
  localStorage.setItem('ar-marker-studio:history:v2', JSON.stringify(h.map(it => ({...it, id: ''}))));
  location.href = '/?name=%D0%9C%D0%B0%D1%88%D0%B8%D0%BD%D0%B0%20481';
  'goto';
})()" --json > /dev/null
sleep 2.5
$B wait --load networkidle > /dev/null 2>&1 || true
sleep 1
S=$($B eval "(() => {
  const el = [...document.querySelectorAll('div')].find(d => d.textContent.includes('Уникальных узоров'));
  const warn = document.querySelector('[role=alert]');
  return JSON.stringify({
    counter: el ? el.textContent.replace(/\\s+/g,' ').trim() : null,
    input: document.getElementById('marker-name') ? document.getElementById('marker-name').value : null,
    warnShown: !!warn, warnText: warn ? warn.textContent.trim() : null
  });
})()" --json)
echo "$S" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('data',{}).get('result'); r=json.loads(r) if isinstance(r,str) else r; print(json.dumps(r, ensure_ascii=False, indent=1))"
$B screenshot "$OUT/t22-2-self-no-collision.png" > /dev/null

echo "=== 3. Коллизия: вводим «Машина 2785» при «Машина 481» в истории ==="
$B find first "#marker-name" fill "Машина 2785" > /dev/null 2>&1 || true
sleep 1.5
W=$($B eval "(() => {
  const warn = document.querySelector('[role=alert]');
  return JSON.stringify({warnShown: !!warn, text: warn ? warn.textContent.trim() : null});
})()" --json)
echo "$W" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('data',{}).get('result'); r=json.loads(r) if isinstance(r,str) else r; print(json.dumps(r, ensure_ascii=False, indent=1))"
$B screenshot "$OUT/t22-3-collision-warning.png" > /dev/null

echo "=== 4. Неколлизионное имя — предупреждения нет ==="
$B find first "#marker-name" fill "Камри" > /dev/null 2>&1 || true
sleep 1
N=$($B eval "JSON.stringify({warnShown: !!document.querySelector('[role=alert]')})" --json)
echo "$N" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('data',{}).get('result'); r=json.loads(r) if isinstance(r,str) else r; print(json.dumps(r, ensure_ascii=False))"

echo "=== 5. Консоль ==="
$B errors --json > "$OUT/t22-errors.json" 2>/dev/null || true
python3 -c "
import json
d = json.load(open('$OUT/t22-errors.json'))
print('console errors:', len(d.get('data', {}).get('errors', [])))
for e in d.get('data', {}).get('errors', [])[:5]: print(' -', str(e)[:200])
"

echo "DONE"
