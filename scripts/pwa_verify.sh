#!/bin/bash
# Верификация PWA-итерации через прокси 81: манифест, иконки, SW, кеш, консоль
set -e
cd /home/z/my-project
B="agent-browser"

echo "=== 1. Статика PWA (curl через прокси) ==="
for u in /manifest.webmanifest /sw.js /icons/favicon.svg /icons/favicon-32.png /icons/icon-192.png /icons/icon-512.png /icons/maskable-192.png /icons/maskable-512.png /icons/apple-touch-icon.png; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:81$u")
  echo "$code  $u"
done
echo "sw version: $(curl -s http://localhost:81/sw.js | grep -oP "CACHE = .*" | head -1)"
echo "manifest name: $(curl -s http://localhost:81/manifest.webmanifest | python3 -c "import json,sys; print(json.load(sys.stdin)['name'], '| icons:', len(json.load(open('/dev/null')) if False else json.loads(open('/home/z/my-project/public/manifest.webmanifest').read())['icons']))" 2>/dev/null || curl -s http://localhost:81/manifest.webmanifest | head -c 120)"

echo "=== 2. Первая загрузка: SW регистрируется ==="
$B open http://localhost:81/ > /dev/null
$B wait --load networkidle > /dev/null
$B set viewport 1440 900 > /dev/null
sleep 3
REG=$($B eval "JSON.stringify({
  swSupported: 'serviceWorker' in navigator,
  registrations: (await navigator.serviceWorker.getRegistrations()).length,
  manifestLink: !!document.querySelector('link[rel=manifest]'),
  manifestHref: document.querySelector('link[rel=manifest]')?.href,
  themeColor: document.querySelector('meta[name=theme-color]')?.content,
  appleIcon: document.querySelector('link[rel=apple-touch-icon]')?.href,
  faviconSvg: document.querySelector('link[rel=icon][type=\"image/svg+xml\"]')?.href
})" --json 2>/dev/null || true)
echo "$REG" | python3 -c "
import json,sys
try:
    d = json.load(sys.stdin)
    print('RESULT:', d.get('data',{}).get('result'))
except Exception as e:
    print('parse fail:', e)"

echo "=== 3. Reload: контроллер SW + кеш оболочки ==="
$B open http://localhost:81/ > /dev/null
$B wait --load networkidle > /dev/null
sleep 3
SW=$($B eval "JSON.stringify({
  controlled: !!navigator.serviceWorker.controller,
  cacheNames: await (async () => (await caches.keys()).join(','))(),
  shellCached: await (async () => {
    const keys = await caches.keys();
    if (!keys.length) return 'no-caches';
    const c = await caches.open(keys[0]);
    const hit = await c.match('/');
    return hit ? (hit.status + ' ' + (hit.headers.get('content-type')||'')) : 'no-shell';
  })()
})" --json 2>/dev/null || true)
echo "$SW" | python3 -c "
import json,sys
try:
    d = json.load(sys.stdin)
    print('RESULT:', d.get('data',{}).get('result'))
except Exception as e:
    print('parse fail:', e)"

echo "=== 4. Консоль ==="
$B errors --json 2>/dev/null | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('errors:', json.dumps(d.get('data',{}).get('errors', []), ensure_ascii=False)[:500])"

$B screenshot scripts/out/pwa-1-desktop.png > /dev/null
echo "DONE"
