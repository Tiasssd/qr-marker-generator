# Генератор AR-меток

Статическое веб-приложение для генерации трекер-меток: уникальный чёрно-белый узор выводится из названия, история хранится в браузерной БД, а метки можно скачать для Vuforia или распечатать.

**Живая версия:** https://tiasssd.github.io/qr-marker-generator/

## Возможности

- **Узор из названия** — одно название всегда даёт одну и ту же метку, разные названия — разные узоры.
- **JPG для Vuforia** — 2048×2048, без названия, RGB без альфа-канала. Vuforia принимает файл сразу, без ручной конвертации.
- **PDF для печати** — A4, метка с названием, размер 10/13/16 см.
- **История в IndexedDB** — метки и их узоры сохраняются в браузере; есть поиск, удаление с отменой и очистка.
- **Офлайн-режим** — service worker кеширует оболочку и статику.
- **Необязательная синхронизация** — Supabase, если заданы ключи при сборке.

## Быстрый запуск

```bash
npm install
npm run dev
```

Production-сборка:

```bash
npm run build
npm run preview
```

## Деплой на GitHub Pages

Проект уже настроен: `output: "export"`, базовый путь из `NEXT_PUBLIC_BASE_PATH`, workflow в `.github/workflows/deploy.yml`.

1. Запушьте репозиторий в GitHub.
2. **Settings → Pages → Source → GitHub Actions**.
3. Дождитесь окончания workflow.

Подробности, настройка своего домена и Supabase — в [HOSTING.md](./HOSTING.md).

## Стек

Next.js 16 (App Router, static export), React 19, TypeScript, Tailwind CSS, shadcn/ui, jsPDF. Серверная часть не требуется.
