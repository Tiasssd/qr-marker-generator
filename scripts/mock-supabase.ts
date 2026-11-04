/**
 * Мок Supabase (PostgREST-совместимый) для локальной проверки облачной
 * синхронизации БЕЗ реального аккаунта: /rest/v1/markers GET/POST/DELETE,
 * CORS для кросс-доменных запросов из браузера, персистентность в JSON.
 *
 * Запуск: node scripts/mock-supabase.ts            (порт 8787)
 *         MOCK_DELAY_MS=15000 node …  — все ответы с задержкой (тест таймаута)
 *
 * Сборка клиента на мок:
 *   NEXT_PUBLIC_SUPABASE_URL=http://localhost:8787 \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=test-key bash scripts/deploy.sh
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";

const PORT = 8787;
const DATA_FILE = "scripts/out/mock-supabase.json";
/** Искусственная задержка каждого ответа (мс) — для проверки таймаутов */
const DELAY_MS = Number(process.env.MOCK_DELAY_MS ?? 0);

interface Row {
  id: string;
  name: string;
  cells: number[];
  created_at: string;
  updated_at: string;
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
  "Access-Control-Allow-Methods": "GET,POST,DELETE,HEAD,OPTIONS",
  "Access-Control-Allow-Headers": "apikey,authorization,content-type,prefer,accept",
};

function json(data: unknown, status = 200): [string, number, typeof CORS] {
  return [JSON.stringify(data), status, CORS];
}

function empty(status: number): [null, number, typeof CORS] {
  return [null, status, CORS];
}

const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const headers = { ...CORS, "Content-Type": "application/json" };
    const finish = ([body, status, extra]: [string | null, number, Record<string, string>]) => {
      const h = { ...extra, "Content-Type": "application/json" };
      if (body === null) delete h["Content-Type"];
      setTimeout(() => {
        res.writeHead(status, h);
        res.end(body);
      }, DELAY_MS);
    };

    if (req.method === "OPTIONS") return finish(empty(204));
    if (req.method === "HEAD") return finish(empty(200));

    if (url.pathname === "/rest/v1/markers") {
      if (req.method === "GET") {
        const rows = items
          .slice()
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
        console.log(`[mock] GET markers → ${rows.length} шт.`);
        return finish(json(rows));
      }
      if (req.method === "POST") {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "[]");
        const rows: Partial<Row>[] = Array.isArray(body) ? body : [];
        let upserted = 0;
        for (const row of rows) {
          if (!row?.id || typeof row.name !== "string" || !row.name.trim()) continue;
          const clean: Row = {
            id: row.id,
            name: row.name.trim().replace(/\s+/g, " "),
            cells: Array.isArray(row.cells) ? row.cells : [],
            created_at: row.created_at ?? new Date().toISOString(),
            updated_at: row.updated_at ?? new Date().toISOString(),
          };
          const i = items.findIndex((it) => it.id === clean.id);
          if (i >= 0) items[i] = clean; // upsert по id
          else items.push(clean);
          upserted++;
        }
        save(items);
        console.log(`[mock] POST markers: ${upserted} шт. (всего ${items.length})`);
        return finish(empty(201));
      }
      if (req.method === "DELETE") {
        /* PostgREST-фильтры, которые шлёт приложение:
           ?id=eq.X — удалить одну; ?id=not.is.null — очистить всё */
        if (url.searchParams.get("id") === "not.is.null") {
          console.log(`[mock] DELETE все (${items.length} шт.)`);
          items = [];
          save(items);
          return finish(empty(204));
        }
        const eq = /^eq\.(.+)$/.exec(url.searchParams.get("id") ?? "")?.[1];
        if (eq) {
          const before = items.length;
          items = items.filter((it) => it.id !== decodeURIComponent(eq));
          save(items);
          console.log(`[mock] DELETE ${eq}: ${before - items.length} шт.`);
          return finish(empty(204));
        }
        return finish(json({ error: "unsupported filter" }, 404));
      }
    }

    if (url.pathname === "/health") return finish(json({ ok: true }));
    return finish(json({ error: "not found", path: url.pathname }, 404));
  });
});

server.listen(PORT, () => {
  console.log(
    `[mock-supabase] слушает http://localhost:${PORT}, данные: ${DATA_FILE} (${items.length} меток)` +
      (DELAY_MS ? `, задержка ${DELAY_MS} мс` : "")
  );
});
