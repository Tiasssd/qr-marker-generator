#!/bin/bash
# Верификация PDF-итерации: перехват blob, %PDF-магия, страницы, тосты, консоль
set -e
cd /home/z/my-project
B="agent-browser"

$B open http://localhost:81/ > /dev/null
$B wait --load networkidy 2>/dev/null > /dev/null || $B wait --load networkidle > /dev/null
$B set viewport 1440 900 > /dev/null
sleep 2

echo "=== 1. Посев истории (3 метки) и ввод текущей ==="
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

echo "=== 2. Перехват blob + клик по PDF ==="
$B eval "
window.__blobs = [];
window.__origCreate = URL.createObjectURL.bind(URL);
URL.createObjectURL = (b) => { window.__blobs.push({size: b.size, type: b.type}); window.__lastBlob = b; return window.__origCreate(b); };
'interceptor ok'" --json > /dev/null
$B eval "[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'PDF' && !b.disabled).click(); 'clicked'" --json > /dev/null
sleep 3
# читаем голову блоба и структуру PDF (без await: через глобальный зонд)
$B eval "
window.__pdf = null;
if (window.__lastBlob) {
  window.__lastBlob.arrayBuffer().then(buf => {
    const u8 = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < Math.min(u8.length, 200000); i++) s += String.fromCharCode(u8[i]);
    window.__pdf = {
      head: s.slice(0, 8),
      size: u8.length,
      eof: s.includes('%%EOF'),
      pages: (s.match(/\/Type\s*\/Page[^s]/g) || []).length,
      mediaBox: (s.match(/MediaBox\s*\[[^\]]*\]/) || [])[0] || null
    };
  });
}
'reading'" --json > /dev/null
sleep 2
$B eval "JSON.stringify({blobCount: window.__blobs.length, blobInfo: window.__blobs, pdf: window.__pdf, toast: document.body.innerText.includes('PDF сохранён')})" --json 2>/dev/null | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('RESULT:', d.get('data',{}).get('result'))"

echo "=== 3. PDF всех (лист) ==="
$B eval "window.__blobs.length = 0; window.__pdf = null; 'reset'" --json > /dev/null
$B eval "[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'PDF всех').click(); 'clicked-all'" --json > /dev/null
sleep 4
$B eval "
window.__pdf = null;
if (window.__lastBlob) {
  window.__lastBlob.arrayBuffer().then(buf => {
    const u8 = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < Math.min(u8.length, 500000); i++) s += String.fromCharCode(u8[i]);
    window.__pdf = {
      head: s.slice(0, 8),
      size: u8.length,
      eof: s.includes('%%EOF'),
      pages: (s.match(/\/Type\s*\/Page[^s]/g) || []).length,
      mediaBox: (s.match(/MediaBox\s*\[[^\]]*\]/) || [])[0] || null
    };
  });
}
'reading'" --json > /dev/null
sleep 2
$B eval "JSON.stringify({blobCount: window.__blobs.length, pdf: window.__pdf, toast: document.body.innerText.includes('PDF со всеми метками')})" --json 2>/dev/null | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('RESULT:', d.get('data',{}).get('result'))"

echo "=== 4. Кнопки и консоль ==="
$B eval "JSON.stringify({
  pdfBtn: !![...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'PDF'),
  pdfAllBtn: !![...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'PDF всех'),
  printBtnGone: ![...document.querySelectorAll('button')].some(b => b.textContent.includes('Печать'))
})" --json 2>/dev/null | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('RESULT:', d.get('data',{}).get('result'))"
$B errors --json 2>/dev/null | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('errors:', json.dumps(d.get('data',{}).get('errors', []), ensure_ascii=False)[:400])"
$B screenshot scripts/out/pdf-1-page.png > /dev/null
echo "DONE"
