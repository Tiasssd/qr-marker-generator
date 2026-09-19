/// <reference types="bun-types" />
/**
 * Подсчёт ёмкости алфавита узоров: полный перебор 2^25 матриц 5×5
 * по правилам генератора меток (lib/marker.ts):
 *   - чернила 10..15 из 25;
 *   - максимальная серия одинаковых клеток (строки/столбцы) <= 3;
 *   - поворотная асимметрия (узор != любому из своих поворотов на 90/180/270).
 * Результат — константа PATTERN_CAPACITY в lib/marker.ts.
 *
 * Дополнительно: поиск пары названий с одинаковым узором (для теста
 * коллизионного предупреждения) — birthday-поиск по случайным именам.
 */
const N = 5;
const FULL = 1 << (N * N);

function popcount(x: number): number {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

function maxRun(mask: number): number {
  let m = 0;
  for (let r = 0; r < N; r++) {
    let run = 0;
    for (let c = 0; c < N; c++) {
      if (mask & (1 << (r * N + c))) {
        run++;
        if (run > m) m = run;
      } else run = 0;
    }
  }
  for (let c = 0; c < N; c++) {
    let run = 0;
    for (let r = 0; r < N; r++) {
      if (mask & (1 << (r * N + c))) {
        run++;
        if (run > m) m = run;
      } else run = 0;
    }
  }
  return m;
}

function rot90(mask: number): number {
  let out = 0;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (mask & (1 << (r * N + c))) out |= 1 << (c * N + (N - 1 - r));
    }
  }
  return out;
}

const t0 = Date.now();
let count = 0;
for (let mask = 0; mask < FULL; mask++) {
  const ink = popcount(mask);
  if (ink < 10 || ink > 15) continue;
  if (maxRun(mask) > 3) continue;
  const r1 = rot90(mask);
  if (r1 === mask) continue;
  const r2 = rot90(r1);
  if (r2 === mask) continue;
  const r3 = rot90(r2);
  if (r3 === mask) continue;
  count++;
}
console.log(`Валидных узоров 5×5: ${count} (${(count / 1e6).toFixed(2)} млн) за ${((Date.now() - t0) / 1000).toFixed(1)} с`);
console.log(`Birthday-порог 50%: ~${Math.round(Math.sqrt(2 * count * Math.LN2))} меток`);

/* --- поиск коллизионной пары названий (для теста UI-предупреждения) --- */
import { deriveId, createMarkerDesign } from "../src/lib/marker";

const sig = (id: string): string => {
  const d = createMarkerDesign(id);
  return d ? [...d.cells].sort((a, b) => a - b).join(",") : "";
};

const seen = new Map<string, string>(); // signature -> name
let pair: [string, string] | null = null;
const names: string[] = [];
for (let i = 1; i <= 60000 && !pair; i++) {
  const nm = `Машина ${i}`;
  names.push(nm);
  const s = sig(deriveId(nm));
  if (s) {
    const prev = seen.get(s);
    if (prev) pair = [prev, nm];
    else seen.set(s, nm);
  }
}
if (pair) {
  console.log(`Коллизия найдена: «${pair[0]}» и «${pair[1]}» дают один узор (проверено ${names.length} имён)`);
} else {
  console.log(`Коллизия НЕ найдена среди ${names.length} имён`);
}
