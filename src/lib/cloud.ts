/**
 * Облачная синхронизация меток (Supabase, бесплатный тариф).
 *
 * Зачем: история меток живёт в localStorage одного браузера. С облаком
 * список меток виден с любого устройства — телефон, планшет, компьютер.
 *
 * Как устроено: у метки всё равно детерминированный узор из названия,
 * поэтому в облаке храним ТОЛЬКО названия — узор восстановится сам.
 * Ключи NEXT_PUBLIC_* публичны по дизайну Supabase (anon-ключ),
 * записи охраняет Row Level Security (см. scripts/supabase-schema.sql).
 *
 * Без ключей приложение честно работает в локальном режиме.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Включено ли облако в этой сборке (ключи заданы при деплое) */
export function cloudEnabled(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export interface CloudMarker {
  name: string;
  created_at: string;
}

const REST = "/rest/v1/markers";
const TIMEOUT_MS = 8000;

function headers(extra?: Record<string, string>): HeadersInit {
  return {
    apikey: SUPABASE_ANON_KEY ?? "",
    Authorization: `Bearer ${SUPABASE_ANON_KEY ?? ""}`,
    ...extra,
  };
}

/** Список меток из облака (новые сверху, разумный лимит) */
export async function fetchCloudMarkers(limit = 500): Promise<CloudMarker[]> {
  const url = `${SUPABASE_URL}${REST}?select=name,created_at&order=created_at.desc&limit=${limit}`;
  const res = await fetch(url, {
    headers: headers({ Accept: "application/json" }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Облако ответило ${res.status}`);
  const data: unknown = await res.json();
  if (!Array.isArray(data)) return [];
  return data
    .filter(
      (it): it is CloudMarker =>
        Boolean(it) &&
        typeof it === "object" &&
        typeof (it as CloudMarker).name === "string" &&
        (it as CloudMarker).name.trim().length > 0
    )
    .map((it) => ({ name: it.name, created_at: it.created_at ?? "" }));
}

/** Сохраняет метку в облако (upsert по названию — повтор не создаёт дубль) */
export async function pushCloudMarker(name: string): Promise<void> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) return;
  const url = `${SUPABASE_URL}${REST}?on_conflict=name`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers({
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    }),
    body: JSON.stringify([{ name: clean }]),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok && res.status !== 201 && res.status !== 200) {
    throw new Error(`Облако не приняло метку (${res.status})`);
  }
}
