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
        <div className="space-y-5 rounded-[28px] border border-stone-200/80 bg-white p-6 shadow-soft">
          <div className="space-y-2">
            <div className="h-4 w-24 animate-pulse rounded-full bg-stone-100" />
            <div className="h-14 w-full animate-pulse rounded-2xl bg-stone-100" />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="h-12 flex-1 animate-pulse rounded-full bg-stone-200/80" />
            <div className="h-12 w-24 animate-pulse rounded-full bg-stone-100" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-28 animate-pulse rounded-full bg-stone-100" />
            <div className="h-12 w-full animate-pulse rounded-full bg-stone-100" />
          </div>
        </div>
        {/* Предпросмотр */}
        <div className="rounded-[28px] border border-stone-200/80 bg-white shadow-soft">
          <div className="flex items-center justify-between px-6 py-6">
            <div className="h-6 w-32 animate-pulse rounded-full bg-stone-100" />
            <div className="h-4 w-20 animate-pulse rounded-full bg-stone-100" />
          </div>
          <div className="px-6 pb-6">
            <div className="mx-auto aspect-square max-w-[440px] animate-pulse rounded-[20px] bg-stone-100" />
          </div>
        </div>
      </div>
    ),
  }
);

export function MarkerStudioLoader() {
  return <MarkerStudio />;
}
