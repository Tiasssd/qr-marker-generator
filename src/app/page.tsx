import { MarkerStudioLoader } from "@/components/marker/marker-studio-loader";
import { ThemeToggle } from "@/components/theme-toggle";
import { ScanLine } from "lucide-react";

/**
 * Страница полностью статическая — это требование GitHub Pages.
 * Ссылки «Поделиться» (?name=...&size=...) обрабатываются уже в браузере:
 * студия читает параметры при монтировании и обновляет заголовок вкладки.
 */
export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground">
      {/* Шапка */}
      <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-background/85 backdrop-blur-md dark:border-stone-800/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3.5 px-4 sm:px-6">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-stone-900 shadow-soft-sm dark:bg-stone-100">
            <ScanLine className="size-5 text-white dark:text-stone-900" strokeWidth={2.2} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold tracking-tight text-stone-900 dark:text-stone-100">
              Генератор AR-меток
            </h1>
            <div className="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">
              Трекер-метки для спавна 3D-машинок
            </div>
          </div>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:py-12">
        <MarkerStudioLoader />
      </main>

      {/* Подвал */}
      <footer className="mt-auto border-t border-stone-200/70 dark:border-stone-800/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-1.5 px-4 py-6 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6 dark:text-stone-400">
          <span>Метки генерируются локально, история — в браузерной БД.</span>
          <span className="shrink-0">JPG без названия — для Vuforia, PDF — для печати</span>
        </div>
      </footer>
    </div>
  );
}
