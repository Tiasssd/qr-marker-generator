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
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(360px,440px)_1fr] xl:gap-8">
        <div className="h-[620px] animate-pulse rounded-xl border border-white/10 bg-neutral-900/60" />
        <div className="h-[620px] animate-pulse rounded-xl border border-white/10 bg-neutral-900/60" />
      </div>
    ),
  }
);

export function MarkerStudioLoader() {
  return <MarkerStudio />;
}
