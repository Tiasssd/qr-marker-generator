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
      <header className="sticky top-0 z-40 border-b border-line/80 bg-background">
        <div className="mx-auto flex h-[72px] max-w-[1240px] items-center gap-3 px-5 sm:px-8">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink text-paper shadow-sm">
            <ScanLine className="size-5" strokeWidth={1.8} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold tracking-tight text-ink">
              Генератор AR-меток
            </h1>
            <p className="mt-0.5 truncate text-[11px] text-ink-muted">
              Трекер-метки для 3D-машинок
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center rounded-lg border border-line bg-card px-2.5 py-1.5 font-mono text-[10px] text-ink-muted sm:inline-flex">
              Vuforia · A4
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1240px] flex-1 px-5 py-7 sm:px-8 lg:py-10">
        <MarkerStudioLoader />
      </main>

      <footer className="mt-auto border-t border-line/80">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-1.5 px-5 py-6 text-[11px] text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-8">
          <span>Метки генерируются в браузере.</span>
          <span className="shrink-0">JPG для Vuforia · PDF для печати</span>
        </div>
      </footer>
    </div>
  );
}
