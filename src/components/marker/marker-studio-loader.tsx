"use client";

import { useSyncExternalStore } from "react";
import dynamic from "next/dynamic";

/**
 * Студия работает только в браузере (canvas, localStorage, crypto),
 * поэтому подключаем её без SSR — до загрузки показываем каркас.
 */

/* Гейт «мы уже на клиенте»: во время SSR и во время гидрации возвращает
   false (getServerSnapshot), а после монтирования — true. Так рендер
   гидрации ВСЕГДА совпадает с серверным HTML (скелет), и никакая скорость
   загрузки чанка next/dynamic не может устроить рассинхрон: реальный
   компонент появляется только ПОСЛЕ гидрации. */
const emptySubscribe = (): (() => void) => (): void => {};

function useIsClient(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    (): boolean => true,
    (): boolean => false
  );
}

/* Каркас повторяет реальную сетку студии (те же колонки, строки и gap) —
   без прыжка вёрстки при подмене скелета на живой компонент:
   панель — слева сверху, предпросмотр — справа на две строки,
   история — слева под панелью.
   Один и тот же JSX и для loading у dynamic(), и для гейта гидрации —
   серверный HTML и первый клиентский рендер идентичны. */
function StudioSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(340px,420px)_1fr] lg:items-start"
    >
      {/* Панель метки */}
      <div className="space-y-5 rounded-[28px] border border-stone-200/80 bg-white p-6 shadow-soft lg:col-start-1 lg:row-start-1">
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
      <div className="rounded-[28px] border border-stone-200/80 bg-white shadow-soft lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <div className="flex items-center justify-between px-6 py-6">
          <div className="h-6 w-32 animate-pulse rounded-full bg-stone-100" />
          <div className="h-4 w-20 animate-pulse rounded-full bg-stone-100" />
        </div>
        <div className="px-6 pb-6">
          <div className="mx-auto aspect-square max-w-[440px] animate-pulse rounded-[20px] bg-stone-100" />
        </div>
      </div>
      {/* История */}
      <div className="rounded-[28px] border border-stone-200/80 bg-white shadow-soft lg:col-start-1 lg:row-start-2">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <div className="h-4 w-36 animate-pulse rounded-full bg-stone-100" />
        </div>
        <div className="px-5 py-4">
          <div className="h-24 animate-pulse rounded-[20px] bg-stone-100/70" />
        </div>
      </div>
    </div>
  );
}

const MarkerStudio = dynamic(
  () => import("./marker-studio").then((mod) => mod.MarkerStudio),
  {
    ssr: false,
    loading: () => <StudioSkeleton />,
  }
);

export function MarkerStudioLoader() {
  if (!useIsClient()) return <StudioSkeleton />;
  return <MarkerStudio />;
}
