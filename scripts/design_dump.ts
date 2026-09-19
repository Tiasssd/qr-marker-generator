/** Дамп дизайна меток в ASCII — проверка движка без браузера.
 *  Запуск: bun scripts/design_dump.ts "Имя 1" "Имя 2" ... */
import { deriveId, createMarkerDesign } from "../src/lib/marker";

const names = process.argv.slice(2);
if (names.length === 0) names.push("Камри", "Молния", "Такси 1", "Красная спортивная", "A");

for (const n of names) {
  const id = deriveId(n);
  const d = id ? createMarkerDesign(id) : null;
  if (!d) {
    console.log(`\n=== ${n} -> пусто ===`);
    continue;
  }
  const g = d.grid;
  const art: string[][] = Array.from({ length: g }, () => Array<string>(g).fill("."));
  for (const i of d.cells) {
    const r = (i / g) | 0;
    const c = i % g;
    art[r][c] = "#";
  }
  const eyes: Array<[number, number]> = [
    [0, 0],
    [0, g - 3],
    [g - 3, 0],
  ];
  for (const [r0, c0] of eyes)
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) art[r0 + r][c0 + c] = "O";

  // плотность и метрики
  let runs = 0;
  for (let r = 0; r < g; r++) {
    let run = 0;
    for (let c = 0; c <= g; c++) {
      if (c < g && art[r][c] === "#") run++;
      else {
        if (run >= 4) runs++;
        run = 0;
      }
    }
  }
  console.log(`\n=== ${n} — id=${id} style=${d.style} mask=${d.mask} ink=${d.cells.size}/${g * g - 27} полос4+=${runs} ===`);
  console.log(art.map((row) => row.join("")).join("\n"));
}
