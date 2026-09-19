/** Дамп дизайна меток в ASCII — проверка движка без браузера.
 *  Запуск: bun scripts/design_dump.ts "Имя 1" "Имя 2" ... */
import { deriveId, createMarkerDesign, GRID } from "../src/lib/marker";

const names = process.argv.slice(2);
if (names.length === 0) names.push("Камри", "Молния", "Такси 1", "Красная спортивная", "A");

const rotCW = (bits: boolean[]): boolean[] => {
  const next = new Array<boolean>(GRID * GRID).fill(false);
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++) next[c * GRID + (GRID - 1 - r)] = bits[r * GRID + c];
  return next;
};

for (const n of names) {
  const id = deriveId(n);
  const d = id ? createMarkerDesign(id) : null;
  if (!d) {
    console.log(`\n=== ${n} -> пусто ===`);
    continue;
  }
  const g = d.grid;
  const bits = new Array<boolean>(g * g).fill(false);
  for (const i of d.cells) bits[i] = true;
  const art: string[][] = Array.from({ length: g }, () => Array<string>(g).fill("."));
  for (let i = 0; i < bits.length; i++) if (bits[i]) art[(i / g) | 0][i % g] = "#";

  // метрики: серии и поворотная асимметрия
  let runs = 0;
  for (let r = 0; r < g; r++) {
    let run = 0;
    for (let c = 0; c <= g; c++) {
      if (c < g && bits[r * g + c]) run++;
      else {
        if (run >= 4) runs++;
        run = 0;
      }
    }
  }
  let asym = true;
  let cur = bits.slice();
  for (let k = 1; k <= 3; k++) {
    cur = rotCW(cur);
    if (cur.every((v, i) => v === bits[i])) asym = false;
  }
  console.log(
    `\n=== ${n} — id=${id} ink=${d.cells.size}/${g * g} полос4+=${runs} асимметрия=${asym ? "да" : "НЕТ"} ===`
  );
  // рамка + отбивка вокруг матрицы, как на реальной метке
  const pad = "  ";
  const bar = "  " + "##".repeat(g + 4);
  console.log(pad + bar);
  for (const row of art) console.log(pad + "##" + "  " + row.map((v) => (v === "#" ? "##" : "  ")).join("") + "  ##");
  console.log(pad + bar);
}
