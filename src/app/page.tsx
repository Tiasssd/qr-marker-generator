import { MarkerStudioLoader } from "@/components/marker/marker-studio-loader";
import { Badge } from "@/components/ui/badge";
import { ScanLine, ShieldCheck } from "lucide-react";

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
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 shadow-lg shadow-amber-500/20">
            <ScanLine className="size-5 text-neutral-950" strokeWidth={2.5} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold uppercase tracking-widest">
              Генератор AR-меток
            </div>
            <div className="mt-0.5 text-xs text-neutral-400">
              Трекерные QR для спавна 3D-машинок
            </div>
          </div>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-400">
              <ShieldCheck className="size-3" aria-hidden="true" />
              Коррекция H · 30%
            </Badge>
            <Badge variant="outline" className="border-white/15 bg-white/5 text-neutral-300">
              Локальная генерация
            </Badge>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:py-12">
        {/* Вводная часть */}
        <section className="mb-8 max-w-3xl lg:mb-10">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            QR-метки, на которых оживают машинки
          </h1>
          <p className="mt-4 text-base leading-relaxed text-neutral-400">
            Придумайте название — оно напечатается над кодом. Внутри QR только уникальный ID,
            без ссылок: ваша AR-сцена считает его камерой и привяжет к метке 3D-модель машины.
            Чистый чёрный на белом, коррекция ошибок уровня H и рамка-трекер — метка уверенно
            читается даже при слабом освещении.
          </p>
        </section>

        <MarkerStudioLoader />
      </main>

      {/* Подвал */}
      <footer className="relative z-10 mt-auto border-t border-white/10 bg-neutral-950/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-neutral-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>
            Метки генерируются локально в браузере — данные не покидают устройство.
          </span>
          <span className="shrink-0">
            QR Code — зарегистрированный товарный знак DENSO WAVE INCORPORATED
          </span>
        </div>
      </footer>
    </div>
  );
}
