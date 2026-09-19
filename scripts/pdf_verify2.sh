#!/bin/bash
# Повторная верификация PDF: размер блоба после compress:true + тост с коротким окном
set -e
cd /home/z/my-project
B="agent-browser"

$B open http://localhost:81/ > /dev/null
$B wait --load networkidle > /dev/null
$B set viewport 1440 900 > /dev/null
sleep 2

$B eval "localStorage.setItem('ar-marker-studio:history:v2', JSON.stringify([
  {name: 'Камри', id: 'x', ts: Date.now()-3000},
  {name: 'Молния', id: 'x', ts: Date.now()-2000},
  {name: 'Такси 1', id: 'x', ts: Date.now()-1000}
])); 'seeded'" --json > /dev/null
$B open http://localhost:81/ > /dev/null
$B wait --load networkidle > /dev/null
sleep 2
$B find first "#marker-name" fill "Камри" > /dev/null 2>&1 || true
sleep 1

$B eval "
window.__blobs = [];
window.__origCreate = URL.createObjectURL.bind(URL);
URL.createObjectURL = (b) => { window.__blobs.push({size: b.size, type: b.type}); window.__lastBlob = b; return window.__origCreate(b); };
'ok'" --json > /dev/null
$B eval "[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'PDF' && !b.disabled).click(); 'clicked'" --json > /dev/null
sleep 2
$B eval "JSON.stringify({blobCount: window.__blobs.length, sizes: window.__blobs.map(b => b.size), types: window.__blobs.map(b => b.type), toastShown: document.body.innerText.includes('PDF сохранён')})" --json 2>/dev/null | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('SINGLE PDF:', d.get('data',{}).get('result'))"

$B eval "window.__blobs.length = 0; 'reset'" --json > /dev/null
$B eval "[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'PDF всех').click(); 'clicked-all'" --json > /dev/null
sleep 3
$B eval "JSON.stringify({blobCount: window.__blobs.length, sizes: window.__blobs.map(b => b.size), toastShown: document.body.innerText.includes('PDF со всеми метками')})" --json 2>/dev/null | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('SHEET PDF:', d.get('data',{}).get('result'))"

# PDF всё ещё валиден (магия + A4 + страница)
$B eval "
window.__pdf = null;
if (window.__lastBlob) window.__lastBlob.arrayBuffer().then(buf => {
  const u8 = new Uint8Array(buf);
  const head = String.fromCharCode(...u8.slice(0, 8));
  let tail = '';
  for (let i = Math.max(0, u8.length - 2048); i < u8.length; i++) tail += String.fromCharCode(u8[i]);
  window.__pdf = { head, size: u8.length, eof: tail.includes('%%EOF') };
});
'reading'" --json > /dev/null
sleep 2
$B eval "JSON.stringify(window.__pdf)" --json 2>/dev/null | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('VALIDITY:', d.get('data',{}).get('result'))"

$B errors --json 2>/dev/null | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('errors:', json.dumps(d.get('data',{}).get('errors', []), ensure_ascii=False)[:300])"
echo "DONE"
