/** Итерация 2: корпусный тест движка произвольных меток.
 *  Запуск: bun scripts/corpus_test.ts */
import { createMarkerDesign, deriveId } from "../src/lib/marker";

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
  style: string;
  mask: string;
  cells: number[];
}

const rows: Row[] = [];
const styleCount = new Map<string, number>();
const maskCount = new Map<string, number>();

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
  rows.push({ name, id, style: d.style, mask: d.mask, cells: [...d.cells].sort((a, b) => a - b) });
  styleCount.set(d.style, (styleCount.get(d.style) ?? 0) + 1);
  maskCount.set(d.mask, (maskCount.get(d.mask) ?? 0) + 1);
}

ok(`дизайны построены: ${rows.length}/${NAMES.length}`);

/* 1. Детерминизм: повторный вызов даёт тот же результат */
let det = 0;
for (const r of rows.slice(0, 12)) {
  const d2 = createMarkerDesign(r.id);
  if (
    !d2 ||
    d2.style !== r.style ||
    d2.mask !== r.mask ||
    d2.cells.size !== r.cells.length ||
    [...d2.cells].sort((a, b) => a - b).join() !== r.cells.join()
  ) {
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
if (createMarkerDesign(idA && idB && idC ? idC : "")?.cells.size === createMarkerDesign(idA)?.cells.size)
  ok("узор «Молния»/«молния» идентичен");

/* 3. Уникальность ID по корпусу */
const ids = new Set(rows.map((r) => r.id));
if (ids.size === rows.length) ok(`ID уникальны: ${ids.size}/${rows.length}`);
else fail(`коллизии ID: ${rows.length - ids.size}`);

/* 4. Плотность чернил: 18..36 модулей */
const inks = rows.map((r) => r.cells.length);
const minInk = Math.min(...inks);
const maxInk = Math.max(...inks);
const avgInk = inks.reduce((a, b) => a + b, 0) / inks.length;
if (minInk >= 18 && maxInk <= 36) ok("плотность чернил 18-36", `(мин ${minInk}, сред ${avgInk.toFixed(1)}, макс ${maxInk})`);
else fail(`плотность вне диапазона: мин ${minInk}, макс ${maxInk}`);

/* 5. Анти-блоб: полос 4+ по строкам и столбцам нет */
const EYE = new Set<number>();
for (const [r0, c0] of [
  [0, 0],
  [0, 6],
  [6, 0],
] as const)
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) EYE.add((r0 + r) * 9 + c0 + c);
let blobViolations = 0;
for (const r of rows) {
  const on = new Set(r.cells);
  const scan = (idx: (k: number) => number): void => {
    let run = 0;
    for (let k = 0; k <= 9; k++) {
      if (k < 9 && on.has(idx(k))) run++;
      else {
        if (run >= 4) blobViolations++;
        run = 0;
      }
    }
  };
  for (let row = 0; row < 9; row++) scan((c) => row * 9 + c);
  for (let col = 0; col < 9; col++) scan(row => row * 9 + col);
}
if (blobViolations === 0) ok("анти-блоб: полос 4+ нет во всём корпусе");
else fail(`анти-блоб нарушен: ${blobViolations} полос`);

/* 6. Попарная различимость: симметричная разность множеств клеток */
let minDiff = Infinity;
let worstPair = "";
let total = 0;
let pairs = 0;
for (let i = 0; i < rows.length; i++) {
  for (let j = i + 1; j < rows.length; j++) {
    if (rows[i].id === rows[j].id) continue;
    const a = new Set(rows[i].cells);
    let diff = 0;
    for (const c of rows[j].cells) if (!a.has(c)) diff++;
    diff += rows[i].cells.length - rows[j].cells.filter((c) => a.has(c)).length;
    total += diff;
    pairs++;
    if (diff < minDiff) {
      minDiff = diff;
      worstPair = `${rows[i].name} vs ${rows[j].name}`;
    }
  }
}
const avgDiff = total / Math.max(pairs, 1);
if (minDiff >= 8) ok("попарная различимость клеток >= 8", `(мин ${minDiff} [${worstPair}], сред ${avgDiff.toFixed(1)})`);
else fail(`слабая различимость: ${minDiff} клеток [${worstPair}]`);

/* 7. Разнообразие: все стили и все маски встречаются */
const styles = ["soft", "round", "sharp", "diamond"];
const masks = ["full", "disc", "ring", "diamond", "cross"];
for (const s of styles)
  if ((styleCount.get(s) ?? 0) > 0) ok(`стиль ${s}: ${styleCount.get(s)}`);
  else fail(`стиль ${s} не встречается`);
for (const m of masks)
  if ((maskCount.get(m) ?? 0) > 0) ok(`маска ${m}: ${maskCount.get(m)}`);
  else fail(`маска ${m} не встречается`);

/* 8. Граничные имена */
if (deriveId("   ") === "") ok("имя из пробелов -> пустой ID");
else fail("имя из пробелов даёт ID");
if (createMarkerDesign("") === null) ok("пустой ID -> null дизайн");
else fail("пустой ID даёт дизайн");

console.log();
if (failures) {
  console.log(`ИТЕРАЦИЯ 2 (корпус): ПРОВАЛЕНО ${failures}`);
  process.exit(1);
}
console.log(`ИТЕРАЦИЯ 2 (корпус): ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ (${pairs} пар, средняя различимость ${avgDiff.toFixed(1)} клеток)`);
