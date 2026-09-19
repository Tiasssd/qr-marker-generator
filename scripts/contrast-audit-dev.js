// WCAG-контраст-аудит v2: lab/oklab нормализуются через canvas.fillStyle
(() => {
  const cv = document.createElement("canvas");
  cv.width = 1;
  cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const norm = (color) => {
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = "#f00";
    try {
      cx.fillStyle = color;
    } catch {
      return [255, 255, 255, 1];
    }
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const mix = (fg, bg) => fg.map((c, i) => (i < 3 ? c * fg[3] + bg[i] * (1 - fg[3]) : 1));
  const lum = (rgb) => {
    const f = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  };
  const bgOf = (el) => {
    let n = el;
    while (n && n instanceof Element) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && bg !== "transparent" && !/rgba?\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(bg)) {
        const c = norm(bg);
        if (c[3] >= 0.9) return c;
      }
      n = n.parentElement;
    }
    return [250, 250, 248, 1];
  };
  const out = [];
  document.querySelectorAll("body *").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const own = [...el.childNodes].filter(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0
    );
    if (!own.length) return;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || parseFloat(st.opacity) === 0) return;
    const fg = mix(norm(st.color), bgOf(el));
    const bg = bgOf(el);
    const l1 = lum(fg);
    const l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = parseFloat(st.fontSize);
    const weight = parseInt(st.fontWeight);
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    out.push({
      t: own.map((n) => n.textContent.trim()).join(" ").slice(0, 44),
      ratio: +ratio.toFixed(2),
      need,
      size: +size.toFixed(0),
      pass: ratio >= need,
    });
  });
  const fails = out.filter((o) => !o.pass);
  return JSON.stringify({ total: out.length, failCount: fails.length, fails });
})()
