"use client";

import dynamic from "next/dynamic";

/**
 * Студия работает только в браузере (canvas, localStorage, crypto),
 * поэтому подключаем её без SSR — до загрузки показываем каркас.
 */
const MarkerStudio = dynamic(
  () => import("./marker-studio").then((mod) => mod.MarkerStudio),
  {
    ssr: false,
    loading: () => (
      /* Каркас повторяет реальную сетку студии (те же колонки и gap) —
         без прыжка вёрстки при подмене скелета на живой компонент */
      <div
        aria-hidden="true"
        className="grid items-start gap-6 lg:grid-cols-[minmax(320px,400px)_1fr]"
      >
        {/* Панель метки */}
        <div className="space-y-5 rounded-xl border border-white/10 bg-neutral-900/60 p-6">
          <div className="space-y-2">
            <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
            <div className="h-12 w-full animate-pulse rounded-md bg-white/10" />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="h-12 flex-1 animate-pulse rounded-md bg-amber-500/15" />
            <div className="h-12 w-24 animate-pulse rounded-md bg-white/10" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-28 animate-pulse rounded bg-white/10" />
            <div className="h-11 w-full animate-pulse rounded-md bg-white/10" />
          </div>
        </div>
        {/* Предпросмотр */}
        <div className="rounded-xl border border-white/10 bg-neutral-900/60">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-6">
            <div className="h-6 w-32 animate-pulse rounded bg-white/10" />
            <div className="h-4 w-20 animate-pulse rounded bg-white/10" />
          </div>
          <div className="p-6">
            <div className="mx-auto aspect-square max-w-[440px] animate-pulse rounded-xl bg-white/10" />
          </div>
        </div>
      </div>
    ),
  }
);

export function MarkerStudioLoader() {
  return <MarkerStudio />;
}
