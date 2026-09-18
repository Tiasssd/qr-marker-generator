// Аудит контраста v3: ручная конвертация lab/oklab/oklch/lch/hsl/hex/rgb → sRGB.
(() => {
  const xyzD65ToSrgb = (X, Y, Z) => {
    let r = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
    let g = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
    let b = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
    const f = (c) => {
      c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, c)) * 255);
    };
    return { r: f(r), g: f(g), b: f(b), a: 1 };
  };
  const labToRgb = (L, a, b) => {
    const fy = (L + 16) / 116, fx = a / 500 + fy, fz = fy - b / 200;
    const eps = 216 / 24389, kap = 24389 / 27;
    const inv = (t) => (t > eps ? t * t * t : (116 * t - 16) / kap);
    const X = inv(fx) * 0.3457 / 0.3585, Y = L > 8 ? Math.pow(fy, 3) : L / kap, Z = inv(fz) * 1.0 / 0.3585;
    // Брэдфорд D50 → D65
    const Xd = 0.9555766 * X - 0.0230393 * Y + 0.0631636 * Z;
    const Yd = -0.0282895 * X + 1.0099416 * Y + 0.0210077 * Z;
    const Zd = 0.0122982 * X - 0.020483 * Y + 1.3299098 * Z;
    return xyzD65ToSrgb(Xd, Yd, Zd);
  };
  const oklabToRgb = (L, a, b) => {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    return xyzD65ToSrgb(
      1.2270138511 * l - 0.5577999807 * m + 0.281256149 * s,
      -0.0405751788 * l + 1.1122568696 * m - 0.0716766787 * s,
      -0.076372949 * l - 0.4214949782 * m + 1.5861632204 * s
    );
  };
  const nums = (s) => s.match(/-?[\d.]+(e-?\d+)?/g).map(Number);
  const alphaOf = (inner) => {
    const m = inner.match(/\/\s*([\d.]+)\s*$/);
    return m ? +m[1] : 1;
  };
  const parse = (s) => {
    s = s.trim();
    let m;
    if ((m = s.match(/^rgba?\(([^)]+)\)$/))) {
      const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] === undefined ? 1 : parts[3] };
    }
    if (/^#[0-9a-f]{6}$/i.test(s)) return { r: parseInt(s.slice(1, 3), 16), g: parseInt(s.slice(3, 5), 16), b: parseInt(s.slice(5, 7), 16), a: 1 };
    if (/^#[0-9a-f]{3}$/i.test(s)) return { r: parseInt(s[1] + s[1], 16), g: parseInt(s[2] + s[2], 16), b: parseInt(s[3] + s[3], 16), a: 1 };
    if ((m = s.match(/^lab\(([^)]+)\)$/))) { const v = nums(m[1]); return { ...labToRgb(v[0], v[1], v[2]), a: alphaOf(m[1]) }; }
    if ((m = s.match(/^oklab\(([^)]+)\)$/))) { const v = nums(m[1]); const L = m[1].includes("%") ? v[0] / 100 : v[0]; return { ...oklabToRgb(L, v[1], v[2]), a: alphaOf(m[1]) }; }
    if ((m = s.match(/^oklch\(([^)]+)\)$/))) {
      const v = nums(m[1]); const L = m[1].includes("%") ? v[0] / 100 : v[0]; const h = (v[2] * Math.PI) / 180;
      return { ...oklabToRgb(L, Math.cos(h) * v[1], Math.sin(h) * v[1]), a: alphaOf(m[1]) };
    }
    if ((m = s.match(/^lch\(([^)]+)\)$/))) { const v = nums(m[1]); const h = (v[2] * Math.PI) / 180; return { ...labToRgb(v[0], Math.cos(h) * v[1], Math.sin(h) * v[1]), a: alphaOf(m[1]) }; }
    if ((m = s.match(/^hsla?\(([^)]+)\)$/))) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean);
      const h = parseFloat(p[0]) / 360, sat = parseFloat(p[1]) / 100, li = parseFloat(p[2]) / 100;
      const q = li < 0.5 ? li * (1 + sat) : li + sat - li * sat, p2 = 2 * li - q;
      const f = (t) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p2 + (q - p2) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p2 + (q - p2) * (2 / 3 - t) * 6;
        return p2;
      };
      return { r: Math.round(f(h + 1 / 3) * 255), g: Math.round(f(h) * 255), b: Math.round(f(h - 1 / 3) * 255), a: p[3] === undefined ? 1 : parseFloat(p[3]) };
    }
    return null;
  };
  const blend = (top, bottom) => {
    const a = top.a + bottom.a * (1 - top.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a,
      g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a,
      b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a, a,
    };
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const bgOf = (el) => {
    let acc = null, node = el;
    while (node && node instanceof Element) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c.a >= 1) { acc = c; break; }
      if (c && c.a > 0) acc = acc ? blend(c, acc) : c;
      node = node.parentElement;
    }
    const bodyC = parse(getComputedStyle(document.body).backgroundColor) || { r: 0, g: 0, b: 0, a: 1 };
    return acc ? blend(acc, bodyC) : bodyC;
  };

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const bad = [], unparsed = new Set(), seen = new Set();
  let total = 0;
  while (walker.nextNode()) {
    const t = walker.currentNode;
    if (!t.textContent.trim()) continue;
    const el = t.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || +st.opacity === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const fg = parse(st.color);
    if (!fg) { unparsed.add(st.color); continue; }
    const bg = bgOf(el);
    if (!bg) { unparsed.add("bg?"); continue; }
    const fgb = fg.a >= 1 ? fg : blend(fg, bg);
    const L1 = lum(fgb), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    total++;
    const size = parseFloat(st.fontSize);
    const bold = +st.fontWeight >= 700;
    const need = size >= 24 || (bold && size >= 18.66) ? 3.0 : 4.5;
    if (ratio < need) {
      bad.push({
        text: t.textContent.trim().slice(0, 36),
        ratio: +ratio.toFixed(2), need,
        fg: st.color, bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`,
      });
    }
  }
  return JSON.stringify({ total, bad, unparsed: [...unparsed] }, null, 1);
})()
