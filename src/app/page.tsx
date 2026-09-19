import { MarkerStudioLoader } from "@/components/marker/marker-studio-loader";
import { ScanLine } from "lucide-react";

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col bg-neutral-950 text-neutral-100 print:hidden">
      {/* Фоновая подсветка и сетка */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
        <div className="app-glow absolute inset-0" />
        <div className="app-grid absolute inset-0" />
      </div>

      {/* Шапка */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-neutral-950/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 shadow-lg shadow-amber-500/20">
            <ScanLine className="size-5 text-neutral-950" strokeWidth={2.5} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold uppercase tracking-widest">
              Генератор AR-меток
            </h1>
            <div className="mt-0.5 truncate text-xs text-neutral-300">
              Трекер-метки для спавна 3D-машинок
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-10">
        <MarkerStudioLoader />
      </main>

      {/* Подвал */}
      <footer className="relative z-10 mt-auto border-t border-white/10 bg-neutral-950/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-neutral-300 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>Метки генерируются локально в браузере.</span>
          <span className="shrink-0">У каждой метки — уникальный узор из названия</span>
        </div>
      </footer>
    </div>
  );
}
