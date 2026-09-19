/// <reference types="bun-types" />
/**
 * Мок Supabase (PostgREST-совместимый) для локальной проверки облачной
 * синхронизации БЕЗ реального аккаунта: GET/POST /rest/v1/markers,
 * CORS для кросс-доменных запросов из браузера, персистентность в JSON.
 *
 * Запуск: bun scripts/mock-supabase.ts   (порт 8787)
 * Сборка клиента на мок:
 *   NEXT_PUBLIC_SUPABASE_URL=http://localhost:8787 \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=test-key bash scripts/deploy.sh
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const PORT = 8787;
const DATA_FILE = "scripts/out/mock-supabase.json";

interface Row {
  name: string;
  created_at: string;
}

function load(): Row[] {
  try {
    if (existsSync(DATA_FILE)) {
      const parsed = JSON.parse(readFileSync(DATA_FILE, "utf8"));
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    // битый файл — начинаем с пустого списка
  }
  return [];
}

function save(items: Row[]): void {
  mkdirSync("scripts/out", { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
}

let items: Row[] = load();

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,HEAD,OPTIONS",
  "Access-Control-Allow-Headers": "apikey,authorization,content-type,prefer,accept",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const server = Bun.serve({
  port: PORT,
  async fetch(req): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (req.method === "HEAD") {
      return new Response(null, { status: 200, headers: CORS });
    }

    if (url.pathname === "/rest/v1/markers") {
      if (req.method === "GET") {
        const rows = items.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
        console.log(`[mock] GET markers → ${rows.length} шт.`);
        return json(rows);
      }
      if (req.method === "POST") {
        const body = (await req.json()) as { name?: string }[];
        const rows = Array.isArray(body) ? body : [];
        let upserted = 0;
        for (const row of rows) {
          const clean = (row?.name ?? "").trim().replace(/\s+/g, " ");
          if (!clean) continue;
          const existing = items.find((it) => it.name === clean);
          if (existing) continue; // upsert: дубль не создаём, created_at не трогаем
          items.push({ name: clean, created_at: new Date().toISOString() });
          upserted++;
        }
        save(items);
        console.log(`[mock] POST markers: +${upserted} (всего ${items.length})`);
        return new Response(null, { status: 201, headers: CORS });
      }
    }

    if (url.pathname === "/health") return json({ ok: true });
    return json({ error: "not found", path: url.pathname }, 404);
  },
});

console.log(`[mock-supabase] слушает http://localhost:${PORT}, данные: ${DATA_FILE} (${items.length} меток)`);
