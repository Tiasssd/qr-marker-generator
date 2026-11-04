/**
 * Общая база меток на Supabase (PostgreSQL + REST).
 *
 * GitHub Pages не умеет серверную БД, поэтому общее хранилище живёт
 * во внешнем сервисе. Ключи NEXT_PUBLIC_* публичны по дизайну Supabase
 * (anon-ключ), доступ ограничивается RLS-политиками из
 * scripts/supabase-schema.sql.
 *
 * Без ключей приложение честно работает на локальной IndexedDB.
 */

/* Принимаем и Project URL, и полный REST-адрес из дашборда:
   https://xxx.supabase.co и https://xxx.supabase.co/rest/v1/ */
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/rest\/v1$/i, "");
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

/** Включена ли общая БД в этой сборке (ключи заданы при деплое) */
export function cloudEnabled(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/** Полная запись метки в общей БД */
export interface CloudMarker {
  id: string;
  name: string;
  cells: number[];
  created_at: string;
  updated_at: string;
}

const REST = "/rest/v1/markers";
const TIMEOUT_MS = 10000;

function headers(extra?: Record<string, string>): HeadersInit {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...extra,
  };
}

/* Таймаут запроса. AbortSignal.timeout появился только в Safari 16.4 /
   iOS 16.4: на более старых телефонах вызов бросает TypeError мгновенно,
   и общая БД «недоступна» навсегда. Поэтому — три ступени:
   есть AbortSignal.timeout → используем; иначе ручной AbortController;
   нет и его → запрос вовсе без таймаута (лучше медленно, чем никогда). */
function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    try {
      return AbortSignal.timeout(ms);
    } catch {
      /* неожиданно сломался — падаем в фолбэк */
    }
  }
  if (typeof AbortController !== "undefined") {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  }
  return undefined;
}

/** Короткая причина сбоя для баннера «Общая БД недоступна» —
    сразу видно, сеть это, таймаут или сервер */
export function describeCloudError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return "таймаут запроса (10 с)";
    }
  }
  /* fetch бросает TypeError при любой сетевой неудаче: нет DNS/TLS,
     соединение оборвано или заблокировано оператором/файрволом */
  if (err instanceof TypeError) {
    return "нет сети или соединение блокируется";
  }
  if (err instanceof Error) {
    const code = /(\d{3})/.exec(err.message)?.[1];
    if (code) return `сервер ответил ${code}`;
  }
  return "ошибка синхронизации";
}

function sanitize(value: unknown): CloudMarker[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, CloudMarker>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Partial<CloudMarker>;
    if (typeof it.id !== "string" || !it.id) continue;
    if (typeof it.name !== "string" || !it.name.trim()) continue;
    const cells = Array.isArray(it.cells)
      ? it.cells.filter(
          (n): n is number =>
            typeof n === "number" && Number.isInteger(n) && n >= 0 && n < 25
        )
      : [];
    const createdAt =
      typeof it.created_at === "string" && it.created_at
        ? it.created_at
        : new Date().toISOString();
    const updatedAt =
      typeof it.updated_at === "string" && it.updated_at
        ? it.updated_at
        : createdAt;
    const record: CloudMarker = {
      id: it.id,
      name: it.name.trim().replace(/\s+/g, " "),
      cells,
      created_at: createdAt,
      updated_at: updatedAt,
    };
    const previous = byId.get(record.id);
    if (!previous || previous.updated_at <= record.updated_at) {
      byId.set(record.id, record);
    }
  }
  return [...byId.values()].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at)
  );
}

/** Список меток из общей БД (новые сверху, разумный лимит) */
export async function fetchCloudMarkers(limit = 500): Promise<CloudMarker[]> {
  const url = `${SUPABASE_URL}${REST}?select=id,name,cells,created_at,updated_at&order=updated_at.desc&limit=${limit}`;
  const res = await fetch(url, {
    headers: headers({ Accept: "application/json" }),
    signal: timeoutSignal(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Общая БД ответила ${res.status}`);
  return sanitize(await res.json());
}

/** Создаёт или обновляет метку в общей БД (upsert по ID) */
export async function pushCloudMarker(record: CloudMarker): Promise<void> {
  const clean = sanitize([record])[0];
  if (!clean) return;
  const url = `${SUPABASE_URL}${REST}?on_conflict=id`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers({
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify([clean]),
    signal: timeoutSignal(TIMEOUT_MS),
  });
  if (!res.ok && res.status !== 201 && res.status !== 200) {
    throw new Error(`Общая БД не приняла метку (${res.status})`);
  }
}

/** Удаляет метку из общей БД по ID */
export async function deleteCloudMarker(id: string): Promise<void> {
  if (!id) return;
  const url = `${SUPABASE_URL}${REST}?id=eq.${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: headers({ Prefer: "return=minimal" }),
    signal: timeoutSignal(TIMEOUT_MS),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Общая БД не удалила метку (${res.status})`);
  }
}

/** Полностью очищает общую БД (используется кнопкой «Очистить») */
export async function clearCloudMarkers(): Promise<void> {
  const url = `${SUPABASE_URL}${REST}?id=not.is.null`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: headers({ Prefer: "return=minimal" }),
    signal: timeoutSignal(TIMEOUT_MS),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Общая БД не очистилась (${res.status})`);
  }
}
