/** Итерация 5: корпусный тест движка меток «ArUco-bold» (матрица 5×5).
 *  Запуск: bun scripts/corpus_test.ts */
import { createMarkerDesign, deriveId, GRID } from "../src/lib/marker";

const NAMES = [
  "Камри", "Молния", "Такси 1", "Такси 2", "Красная спортивная", "Синий седан",
  "ГАЗ-21", "BMW M5", "Булыжник", "Комбайн", "Волга", "Победа", "Запорожец",
  "Лада Гранта", "Нива", "УАЗ Патриот", "Крузак", "Джигит", "Метеор", "А",
  "Я", "Ёжик", "Т1", "X9", "Машина времени", "Гроза", "Вихрь", "Сокол",
  "Беркут", "Стрела", "Феникс", "Тайфун", "Циклон", "Самум", "Сирокко",
  "Пассат", "Боре", "Гепард", "Пантера", "Барс",
];

let failures = 0;
const fail = (msg: string): void => {
  console.log(`FAIL  ${msg}`);
  failures++;
};
const ok = (msg: string, extra = ""): void => console.log(`OK   ${msg} ${extra}`);

interface Row {
  name: string;
  id: string;
  bits: boolean[]; // 25 клеток
}

const rows: Row[] = [];

for (const name of NAMES) {
  const id = deriveId(name);
  if (!id) {
    fail(`пустой ID: ${name}`);
    continue;
  }
  const d = createMarkerDesign(id);
  if (!d) {
    fail(`пустой дизайн: ${name}`);
    continue;
  }
  if (d.grid !== GRID) {
    fail(`сетка != 5: ${name}`);
  }
  const bits = new Array<boolean>(GRID * GRID).fill(false);
  for (const i of d.cells) {
    if (i < 0 || i >= GRID * GRID) fail(`индекс клетки вне сетки: ${name} (${i})`);
    else bits[i] = true;
  }
  rows.push({ name, id, bits });
}

ok(`дизайны построены: ${rows.length}/${NAMES.length}`);

/* 1. Детерминизм: повторный вызов даёт тот же результат */
let det = 0;
for (const r of rows.slice(0, 12)) {
  const d2 = createMarkerDesign(r.id);
  if (!d2 || d2.cells.size !== r.bits.filter(Boolean).length || [...d2.cells].sort((a, b) => a - b).join() !== r.bits.map((b, i) => (b ? i : -1)).filter((i) => i >= 0).sort((a, b) => a - b).join()) {
    fail(`недетерминизм: ${r.name}`);
    det++;
  }
}
if (det === 0) ok("детерминизм: 12 повторных построений идентичны");

/* 2. Регистр и пробелы: «Молния»/«молния»/« МОЛНИЯ » — одна метка */
const idA = deriveId("Молния");
const idB = deriveId("молния");
const idC = deriveId("  Молния  ");
if (idA === idB && idB === idC) ok("регистр/пробелы не меняют ID", `(${idA})`);
else fail(`регистр/пробелы меняют ID: ${idA} / ${idB} / ${idC}`);
const samePattern =
  [...(createMarkerDesign(idC)?.cells ?? [])].sort((a, b) => a - b).join() ===
  [...(createMarkerDesign(idA)?.cells ?? [])].sort((a, b) => a - b).join();
if (samePattern) ok("узор «Молния»/«молния» идентичен");
else fail("узор меняется от регистра");

/* 3. Уникальность ID и узоров по корпусу */
const ids = new Set(rows.map((r) => r.id));
if (ids.size === rows.length) ok(`ID уникальны: ${ids.size}/${rows.length}`);
else fail(`коллизии ID: ${rows.length - ids.size}`);
const patterns = new Set(rows.map((r) => r.bits.map((b) => (b ? "1" : "0")).join("")));
if (patterns.size === rows.length) ok(`узоры уникальны: ${patterns.size}/${rows.length}`);
else fail(`коллизии узоров: ${rows.length - patterns.size}`);

/* 4. Плотность чернил: 10–15 клеток из 25 (40–60%) */
const inks = rows.map((r) => r.bits.filter(Boolean).length);
const minInk = Math.min(...inks);
const maxInk = Math.max(...inks);
const avgInk = inks.reduce((a, b) => a + b, 0) / inks.length;
if (minInk >= 10 && maxInk <= 15) ok("плотность чернил 10–15 из 25", `(мин ${minInk}, сред ${avgInk.toFixed(1)}, макс ${maxInk})`);
else fail(`плотность вне диапазона: мин ${minInk}, макс ${maxInk}`);

/* 5. Полосы: серий одинаковых клеток 4+ по строкам и столбцам нет */
let runViolations = 0;
for (const r of rows) {
  const on = r.bits;
  const scan = (idx: (k: number) => number): void => {
    let run = 0;
    for (let k = 0; k <= GRID; k++) {
      if (k < GRID && on[idx(k)]) run++;
      else {
        if (run >= 4) runViolations++;
        run = 0;
      }
    }
  };
  for (let row = 0; row < GRID; row++) scan((c) => row * GRID + c);
  for (let col = 0; col < GRID; col++) scan((row) => row * GRID + col);
}
if (runViolations === 0) ok("полос 4+ нет во всём корпусе");
else fail(`полосы нарушены: ${runViolations} шт.`);

/* 6. Поворотная асимметрия: узор не совпадает со своими поворотами */
let rotViolations = 0;
for (const r of rows) {
  const rotCW = (bits: boolean[]): boolean[] => {
    const next = new Array<boolean>(GRID * GRID).fill(false);
    for (let rr = 0; rr < GRID; rr++)
      for (let cc = 0; cc < GRID; cc++) next[cc * GRID + (GRID - 1 - rr)] = bits[rr * GRID + cc];
    return next;
  };
  let cur = r.bits.slice();
  for (let k = 1; k <= 3; k++) {
    cur = rotCW(cur);
    if (cur.every((v, i) => v === r.bits[i])) {
      rotViolations++;
      fail(`узор симметричен при повороте ${k * 90}°: ${r.name}`);
    }
  }
}
if (rotViolations === 0) ok("поворотная асимметрия: все 40 узоров");

/* 7. Попарная различимость (расстояние Хэмминга по 25 клеткам) */
let minDiff = Infinity;
let worstPair = "";
let total = 0;
let pairs = 0;
for (let i = 0; i < rows.length; i++) {
  for (let j = i + 1; j < rows.length; j++) {
    if (rows[i].id === rows[j].id) continue;
    let diff = 0;
    for (let k = 0; k < GRID * GRID; k++) if (rows[i].bits[k] !== rows[j].bits[k]) diff++;
    total += diff;
    pairs++;
    if (diff < minDiff) {
      minDiff = diff;
      worstPair = `${rows[i].name} vs ${rows[j].name}`;
    }
  }
}
const avgDiff = total / Math.max(pairs, 1);
if (minDiff >= 4) ok("попарная различимость >= 4 клеток", `(мин ${minDiff} [${worstPair}], сред ${avgDiff.toFixed(1)})`);
else fail(`слабая различимость: ${minDiff} клеток [${worstPair}]`);

/* 8. Граничные имена */
if (deriveId("   ") === "") ok("имя из пробелов -> пустой ID");
else fail("имя из пробелов даёт ID");
if (createMarkerDesign("") === null) ok("пустой ID -> null дизайн");
else fail("пустой ID даёт дизайн");

console.log();
if (failures) {
  console.log(`ИТЕРАЦИЯ 5 (корпус): ПРОВАЛЕНО ${failures}`);
  process.exit(1);
}
console.log(`ИТЕРАЦИЯ 5 (корпус): ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ (${pairs} пар, средняя различимость ${avgDiff.toFixed(1)} клеток, чернила ${minInk}–${maxInk})`);
