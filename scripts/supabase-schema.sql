-- Таблица меток для облачной синхронизации «Генератора AR-меток».
--
-- Храним ТОЛЬКО названия: узор метки детерминированно восстанавливается
-- из названия на клиенте (deriveId → createMarkerDesign), приватных
-- данных в облаке нет. Ключи anon публичны по дизайну Supabase,
-- записи охраняет Row Level Security.
--
-- Куда вставить: Supabase → ваш проект → SQL Editor → New query →
-- весь этот файл → Run → должно быть «Success. No rows returned».

create table if not exists public.markers (
  name        text primary key,
  created_at  timestamptz not null default now()
);

alter table public.markers enable row level security;

-- Читать может каждый с anon-ключом — это и есть «список меток
-- с любого устройства».
drop policy if exists "markers: публичное чтение" on public.markers;
create policy "markers: публичное чтение"
  on public.markers for select
  to anon, authenticated
  using (true);

-- Запись и upsert (по названию, дублей не создаётся) — сайт без
-- регистрации. Хотите строже — замените true на свою проверку.
drop policy if exists "markers: публичная запись" on public.markers;
create policy "markers: публичная запись"
  on public.markers for insert
  to anon, authenticated
  with check (true);

drop policy if exists "markers: публичное обновление" on public.markers;
create policy "markers: публичное обновление"
  on public.markers for update
  to anon, authenticated
  using (true)
  with check (true);

-- Индексы не нужны: primary key на name уже покрывает upsert-конфликт
-- и поиск; сортировка по created_at на таких объёмах мгновенна.
