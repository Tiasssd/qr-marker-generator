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

/* Каркас повторяет новую сетку студии: панель слева, предпросмотр
   справа, архив — во всю ширину под ними. */
function StudioSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid gap-6 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)] lg:items-start"
    >
      {/* Панель метки */}
      <div className="flex flex-col gap-5 rounded-[20px] border border-line bg-card p-5 sm:p-6">
        <div className="space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-paper" />
          <div className="h-5 w-32 animate-pulse rounded bg-paper" />
          <div className="h-12 w-full animate-pulse rounded-xl bg-paper" />
        </div>
        <div className="h-14 w-full animate-pulse rounded-xl bg-paper" />
        <div className="grid grid-cols-2 gap-2.5">
          <div className="col-span-2 h-14 animate-pulse rounded-xl bg-paper" />
          <div className="h-20 animate-pulse rounded-xl bg-paper" />
          <div className="h-20 animate-pulse rounded-xl bg-paper" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-28 animate-pulse rounded bg-paper" />
          <div className="h-11 w-full animate-pulse rounded-xl bg-paper" />
          <div className="h-3 w-44 animate-pulse rounded bg-paper" />
        </div>
      </div>

      {/* Предпросмотр */}
      <div className="rounded-[20px] border border-line bg-card p-5 sm:p-7">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-3 w-28 animate-pulse rounded bg-paper" />
            <div className="h-5 w-36 animate-pulse rounded bg-paper" />
          </div>
          <div className="h-8 w-28 animate-pulse rounded-lg bg-paper" />
        </div>
        <div className="mx-auto mt-7 aspect-[0.86] w-full max-w-[440px] animate-pulse rounded-sm bg-paper" />
        <div className="mt-7 flex gap-4 border-t border-line pt-4">
          <div className="h-3 w-16 animate-pulse rounded bg-paper" />
          <div className="h-3 w-20 animate-pulse rounded bg-paper" />
          <div className="h-3 w-24 animate-pulse rounded bg-paper" />
        </div>
      </div>

      {/* Архив */}
      <div className="rounded-[20px] border border-line bg-card lg:col-span-2">
        <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="size-8 animate-pulse rounded-lg bg-paper" />
            <div className="space-y-1.5">
              <div className="h-4 w-32 animate-pulse rounded bg-paper" />
              <div className="h-3 w-24 animate-pulse rounded bg-paper" />
            </div>
          </div>
          <div className="h-9 w-56 animate-pulse rounded-lg bg-paper" />
        </div>
        <div className="space-y-3 px-5 py-4 sm:px-6">
          <div className="h-16 animate-pulse rounded-lg bg-paper" />
          <div className="h-16 animate-pulse rounded-lg bg-paper" />
          <div className="h-16 animate-pulse rounded-lg bg-paper" />
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
