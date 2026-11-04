-- Общая база меток для «Генератора AR-меток».
--
-- В отличие от локального IndexedDB, эта таблица живёт на сервере Supabase
-- и видна всем устройствам. В ней хранится полная запись метки:
-- ID, название, узор (тёмные ячейки) и даты.
--
-- Куда вставить: Supabase → ваш проект → SQL Editor → New query →
-- весь этот файл → Run → должно быть «Success. No rows returned».
--
-- ВНИМАНИЕ: старый вариант таблицы (только name) удаляется.
-- Если в нём уже были названия, они пропадут — при необходимости
-- сохраните их заранее.

drop table if exists public.markers cascade;

create table public.markers (
  id          text primary key,
  name        text not null,
  cells       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index markers_updated_at_idx on public.markers (updated_at desc);

alter table public.markers enable row level security;

-- Чтение, запись, обновление и удаление с anon-ключом.
-- Это внутренний инструмент без регистрации: любой, у кого есть ссылка
-- на сайт, может менять общий список. Нужен вход — добавьте Supabase Auth
-- и замените true на проверку auth.uid() / роли.
drop policy if exists "markers: публичное чтение" on public.markers;
create policy "markers: публичное чтение"
  on public.markers for select
  to anon, authenticated
  using (true);

drop policy if exists "markers: публичное создание" on public.markers;
create policy "markers: публичное создание"
  on public.markers for insert
  to anon, authenticated
  with check (true);

drop policy if exists "markers: публичное обновление" on public.markers;
create policy "markers: публичное обновление"
  on public.markers for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "markers: публичное удаление" on public.markers;
create policy "markers: публичное удаление"
  on public.markers for delete
  to anon, authenticated
  using (true);
