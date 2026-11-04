/**
 * Локальная база данных меток для статического приложения (GitHub Pages).
 *
 * На GitHub Pages нет сервера и Prisma, поэтому «БД» живёт в браузере:
 * IndexedDB — основное хранилище, localStorage — запасное, память —
 * последний рубеж для приватного режима/старых браузеров.
 *
 * В записи хранится не только название, но и сам узор (тёмные ячейки):
 * историю можно отрисовать ровно такой, какой метка была сгенерирована.
 */

import { createMarkerDesign, deriveId } from "@/lib/marker";

export interface MarkerRecord {
  /** ID метки — первичный ключ (выводится из названия) */
  id: string;
  /** Название метки */
  name: string;
  /** Тёмные ячейки узора 5×5 (индексы row * 5 + col) */
  cells: number[];
  /** Когда метка впервые создана */
  createdAt: number;
  /** Когда её последний раз скачивали/печатали */
  updatedAt: number;
  /** Синхронизирована ли запись с общей БД (false — ждёт отправки) */
  synced?: boolean;
}

export type StorageMode = "indexeddb" | "localstorage" | "memory";

export interface MarkerSnapshot {
  items: MarkerRecord[];
  mode: StorageMode;
}

const DB_NAME = "qr-marker-studio";
const DB_VERSION = 1;
const STORE = "markers";
const LS_KEY = "qr-marker-studio:db:v1";
const LEGACY_KEYS = ["ar-marker-studio:history:v2", "ar-marker-studio:history:v1"];
const MAX_RECORDS = 500;

let dbPromise: Promise<IDBDatabase | null> | null = null;
let activeMode: StorageMode = "memory";
let memory: MarkerRecord[] = [];
let lsChecked = false;
let lsAvailable = false;

/* ------------------------------ IndexedDB -------------------------------- */

function localStorageAvailable(): boolean {
  if (lsChecked) return lsAvailable;
  lsChecked = true;
  try {
    const probe = "__qr_marker_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    lsAvailable = true;
  } catch {
    lsAvailable = false;
  }
  return lsAvailable;
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let settled = false;
    const done = (db: IDBDatabase | null): void => {
      if (settled) return;
      settled = true;
      resolve(db);
    };

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      done(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      done(db);
    };
    request.onerror = () => {
      dbPromise = null;
      done(null);
    };
    request.onblocked = () => {
      dbPromise = null;
      done(null);
    };
  });

  return dbPromise;
}

/** Приводит к безопасному виду всё, что пришло из хранилища */
function sanitize(value: unknown): MarkerRecord[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, MarkerRecord>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Partial<MarkerRecord>;
    if (typeof it.id !== "string" || !it.id) continue;
    if (typeof it.name !== "string") continue;
    const name = it.name.trim().replace(/\s+/g, " ");
    if (!name) continue;
    const cells = Array.isArray(it.cells)
      ? it.cells.filter(
          (n): n is number =>
            typeof n === "number" && Number.isInteger(n) && n >= 0 && n < 25
        )
      : [];
    const createdAt =
      typeof it.createdAt === "number" && Number.isFinite(it.createdAt)
        ? it.createdAt
        : Date.now();
    const updatedAt =
      typeof it.updatedAt === "number" && Number.isFinite(it.updatedAt)
        ? it.updatedAt
        : createdAt;
    const record: MarkerRecord = {
      id: it.id,
      name,
      cells,
      createdAt,
      updatedAt,
      /* Старые записи без флага считаем уже синхронизированными */
      synced: it.synced !== false,
    };
    const previous = byId.get(record.id);
    if (!previous || previous.updatedAt <= record.updatedAt) byId.set(record.id, record);
  }
  return [...byId.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_RECORDS);
}

function readFromDb(db: IDBDatabase): Promise<MarkerRecord[]> {
  return new Promise<MarkerRecord[]>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(sanitize(req.result));
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

function writeToDb(db: IDBDatabase, record: MarkerRecord): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    } catch (err) {
      reject(err);
    }
  });
}

function writeManyToDb(db: IDBDatabase, records: MarkerRecord[]): Promise<void> {
  if (records.length === 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const record of records) store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    } catch (err) {
      reject(err);
    }
  });
}

function deleteFromDb(db: IDBDatabase, id: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    } catch (err) {
      reject(err);
    }
  });
}

function clearDb(db: IDBDatabase): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    } catch (err) {
      reject(err);
    }
  });
}

/* --------------------------- localStorage -------------------------------- */

function readFromLs(): MarkerRecord[] {
  if (!localStorageAvailable()) return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? sanitize(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function writeToLs(items: MarkerRecord[]): boolean {
  if (!localStorageAvailable()) return false;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items.slice(0, MAX_RECORDS)));
    return true;
  } catch {
    return false;
  }
}

/* ----------------------------- Миграция ---------------------------------- */

/** Читает старые записи истории (v1/v2) в новый формат */
function readLegacyRecords(): MarkerRecord[] {
  if (!localStorageAvailable()) return [];
  const imported: MarkerRecord[] = [];
  const known = new Set<string>();

  for (const key of LEGACY_KEYS) {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      continue;
    }
    if (!raw) continue;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      for (const rawItem of parsed) {
        if (!rawItem || typeof rawItem !== "object") continue;
        const it = rawItem as { name?: unknown; id?: unknown; ts?: unknown };
        const name =
          typeof it.name === "string" ? it.name.trim().replace(/\s+/g, " ") : "";
        if (!name) continue;
        const id = typeof it.id === "string" && it.id ? it.id : deriveId(name);
        if (!id || known.has(id)) continue;
        const design = createMarkerDesign(id);
        const ts =
          typeof it.ts === "number" && Number.isFinite(it.ts) ? it.ts : Date.now();
        imported.push({
          id,
          name,
          cells: design ? [...design.cells] : [],
          createdAt: ts,
          updatedAt: ts,
        });
        known.add(id);
      }
    } catch {
      // Битые данные пропускаем
    }
  }
  return imported;
}

/**
 * Переносит историю из старого localStorage-формата в IndexedDB.
 * Старые ключи удаляются только после успешной записи.
 */
async function migrateLegacy(db: IDBDatabase, existing: MarkerRecord[]): Promise<void> {
  if (!localStorageAvailable()) return;
  const known = new Set(existing.map((it) => it.id));

  for (const key of LEGACY_KEYS) {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      continue;
    }
    if (!raw) continue;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        localStorage.removeItem(key);
        continue;
      }

      const imported: MarkerRecord[] = [];
      for (const rawItem of parsed) {
        if (!rawItem || typeof rawItem !== "object") continue;
        const it = rawItem as { name?: unknown; id?: unknown; ts?: unknown };
        const name =
          typeof it.name === "string" ? it.name.trim().replace(/\s+/g, " ") : "";
        if (!name) continue;
        const id =
          typeof it.id === "string" && it.id
            ? it.id
            : deriveId(name);
        if (!id || known.has(id)) continue;
        const design = createMarkerDesign(id);
        const ts =
          typeof it.ts === "number" && Number.isFinite(it.ts) ? it.ts : Date.now();
        imported.push({
          id,
          name,
          cells: design ? [...design.cells] : [],
          createdAt: ts,
          updatedAt: ts,
        });
        known.add(id);
      }

      if (imported.length > 0) await writeManyToDb(db, imported);
      localStorage.removeItem(key);
    } catch {
      // Битые данные не должны блокировать запуск — ключ оставляем как есть
    }
  }
}

/* ------------------------------- Публичный API --------------------------- */

function mergeRecord(items: MarkerRecord[], record: MarkerRecord): MarkerRecord[] {
  const next = items.filter((it) => it.id !== record.id);
  next.unshift(record);
  return next.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_RECORDS);
}

/** Загружает все метки; попутно мигрирует старую историю и выбирает режим */
export async function loadMarkers(): Promise<MarkerSnapshot> {
  const db = await openDb();
  if (db) {
    try {
      const existing = await readFromDb(db);
      await migrateLegacy(db, existing);

      /* Если когда-то IndexedDB была недоступна и записи ушли в localStorage,
         при возврате к основной БД переносим их, чтобы история не пропала. */
      const current = await readFromDb(db);
      const fromLs = readFromLs();
      const byId = new Map(current.map((it) => [it.id, it]));
      /* Берём из localStorage всё, чего нет в БД, и более свежие версии */
      const toUpsert = fromLs.filter((it) => {
        const existing = byId.get(it.id);
        return !existing || it.updatedAt > existing.updatedAt;
      });
      if (toUpsert.length > 0) {
        await writeManyToDb(db, toUpsert);
      }
      if (fromLs.length > 0) {
        try {
          localStorage.removeItem(LS_KEY);
        } catch {
          // не критично
        }
      }

      const items = await readFromDb(db);
      activeMode = "indexeddb";
      memory = items;
      /* Зеркало для аварийного перехода на localStorage */
      writeToLs(items);
      return { items, mode: activeMode };
    } catch {
      // IndexedDB открылась, но транзакция не удалась — уходим в localStorage
    }
  }

  let fromLs = readFromLs();
  if (fromLs.length === 0) {
    /* IndexedDB недоступна, но история из старой версии лежит в localStorage */
    const legacy = readLegacyRecords();
    if (legacy.length > 0 && writeToLs(legacy)) {
      fromLs = legacy;
      for (const key of LEGACY_KEYS) {
        try {
          localStorage.removeItem(key);
        } catch {
          // не критично
        }
      }
    }
  }
  if (localStorageAvailable()) {
    activeMode = "localstorage";
    memory = fromLs;
    return { items: fromLs, mode: activeMode };
  }

  activeMode = "memory";
  memory = [];
  return { items: [], mode: activeMode };
}

/** Сохраняет (или обновляет) метку. Ошибки хранилища не пробрасываются. */
export async function saveMarker(record: MarkerRecord): Promise<StorageMode> {
  const clean = sanitize([record])[0];
  if (!clean) return activeMode;

  const db = await openDb();
  if (db) {
    try {
      await writeToDb(db, clean);
      activeMode = "indexeddb";
      memory = mergeRecord(memory, clean);
      writeToLs(memory);
      return activeMode;
    } catch {
      // Ниже — запасные варианты
    }
  }

  memory = mergeRecord(memory, clean);
  if (writeToLs(memory)) {
    activeMode = "localstorage";
  } else {
    activeMode = "memory";
  }
  return activeMode;
}

/** Удаляет метку по ID. */
export async function deleteMarker(id: string): Promise<void> {
  const db = await openDb();
  if (db) {
    try {
      await deleteFromDb(db, id);
      memory = memory.filter((it) => it.id !== id);
      writeToLs(memory);
      return;
    } catch {
      // Удаляем из запасного хранилища
    }
  }
  memory = memory.filter((it) => it.id !== id);
  writeToLs(memory);
}

/** Полностью очищает историю. */
export async function clearMarkers(): Promise<void> {
  const db = await openDb();
  if (db) {
    try {
      await clearDb(db);
      memory = [];
      writeToLs([]);
      return;
    } catch {
      // Чистим запасное хранилище
    }
  }
  memory = [];
  writeToLs(memory);
}

/** Текущий режим хранения — для индикатора в интерфейсе. */
export function storageMode(): StorageMode {
  return activeMode;
}
