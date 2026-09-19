#!/bin/bash
# Верификация поиска по истории: порог 6+, фильтр, «Ничего не найдено», сброс, 5 меток без поиска, мобайл
cd /home/z/my-project
B="agent-browser"
OUT=scripts/out

$B open http://localhost:81/ > /dev/null
$B wait --load networkidle > /dev/null
$B set viewport 1440 900 > /dev/null
sleep 2

echo "=== 1. Сеем 7 меток ==="
$B eval "localStorage.setItem('ar-marker-studio:history:v2', JSON.stringify([
  {name: 'Камри', ts: 10000007},
  {name: 'Молния', ts: 10000006},
  {name: 'Такси 1', ts: 10000005},
  {name: 'Такси 2', ts: 10000004},
  {name: 'Синий седан', ts: 10000003},
  {name: 'ГАЗ-21', ts: 10000002},
  {name: 'Красная спортивная', ts: 10000001}
])); 'seeded'" --json > /dev/null
$B open http://localhost:81/ > /dev/null
$B wait --load networkidle > /dev/null
sleep 2

$B eval "JSON.stringify({
  searchVisible: !!document.querySelector('input[type=search]'),
  cardCount: document.querySelectorAll('[data-history-card], ul li').length
})" --json 2>/dev/null | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('7 меток:', d.get('data',{}).get('result'))"
$B screenshot "$OUT/hist-1-seven.png" > /dev/null

echo "=== 2. Фильтр «такс» (нативный сеттер — React видит изменение) ==="
$B eval "
const inp = document.querySelector('input[type=search]');
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
setter.call(inp, 'такс');
inp.dispatchEvent(new Event('input', { bubbles: true }));
'set'" --json > /dev/null
sleep 1
$B eval "JSON.stringify({
  cardCount: document.querySelectorAll('ul li').length,
  firstCardText: (document.querySelector('ul li')?.innerText || '').slice(0, 40),
  noResults: document.body.innerText.includes('Ничего не найдено')
})" --json 2>/dev/null | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('фильтр такс:', d.get('data',{}).get('result'))"

echo "=== 3. Фильтр без результатов ==="
$B eval "
const inp = document.querySelector('input[type=search]');
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
setter.call(inp, 'зззз');
inp.dispatchEvent(new Event('input', { bubbles: true }));
'set'" --json > /dev/null
sleep 1
$B eval "JSON.stringify({
  noResults: document.body.innerText.includes('Ничего не найдено по «зззз»'),
  listGone: document.querySelectorAll('ul li').length === 0
})" --json 2>/dev/null | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('пустой результат:', d.get('data',{}).get('result'))"
$B screenshot "$OUT/hist-2-noresults.png" > /dev/null

echo "=== 4. Сброс фильтра ==="
$B eval "
const inp = document.querySelector('input[type=search]');
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
setter.call(inp, '');
inp.dispatchEvent(new Event('input', { bubbles: true }));
'set'" --json > /dev/null
sleep 1
$B eval "JSON.stringify({cardCount: document.querySelectorAll('ul li').length})" --json 2>/dev/null | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('сброс:', d.get('data',{}).get('result'))"

echo "=== 5. Порог: 5 меток — поиска нет ==="
$B eval "localStorage.setItem('ar-marker-studio:history:v2', JSON.stringify([
  {name: 'Камри', ts: 10000005},
  {name: 'Молния', ts: 10000004},
  {name: 'Такси 1', ts: 10000003},
  {name: 'Синий седан', ts: 10000002},
  {name: 'ГАЗ-21', ts: 10000001}
])); 'seeded5'" --json > /dev/null
$B open http://localhost:81/ > /dev/null
$B wait --load networkidle > /dev/null
sleep 2
$B eval "JSON.stringify({
  searchHidden: !document.querySelector('input[type=search]'),
  cardCount: document.querySelectorAll('ul li').length
})" --json 2>/dev/null | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('5 меток:', d.get('data',{}).get('result'))"

echo "=== 6. Ошибки + мобайл ==="
$B errors --json 2>/dev/null | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('errors:', json.dumps(d.get('data',{}).get('errors', []), ensure_ascii=False)[:300])"
$B set viewport 390 844 > /dev/null
sleep 1.5
$B eval "JSON.stringify({scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth})" --json 2>/dev/null | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('mobile:', d.get('data',{}).get('result'))"
$B screenshot "$OUT/hist-3-mobile.png" > /dev/null
$B errors --json 2>/dev/null | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('errors mobile:', json.dumps(d.get('data',{}).get('errors', []), ensure_ascii=False)[:300])"
echo "DONE"
