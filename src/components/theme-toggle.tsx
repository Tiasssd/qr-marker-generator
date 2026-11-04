"use client";

import { Moon, Sun } from "lucide-react";

const THEME_KEY = "ar-theme";

/**
 * Переключатель светлая/тёмная тема.
 *
 * Иконки рендерятся обе сразу и переключаются CSS-классом (dark:hidden /
 * hidden dark:block) — серверный HTML не зависит от темы, гидрация
 * детерминирована. Класс .dark на <html> ставит до первой отрисовки
 * инлайн-скрипт в layout.tsx (по localStorage или системной теме).
 */
export function ThemeToggle() {
  const toggle = (): void => {
    const root = document.documentElement;
    const next = !root.classList.contains("dark");
    root.classList.toggle("dark", next);
    try {
      window.localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // Приватный режим — тема живёт только в этой сессии
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Переключить светлую и тёмную тему"
      title="Светлая / тёмная тема"
      className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-card text-ink-soft transition-colors hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/30"
    >
      <Sun className="size-[18px] dark:hidden" aria-hidden="true" />
      <Moon className="hidden size-[18px] dark:block" aria-hidden="true" />
    </button>
  );
}
