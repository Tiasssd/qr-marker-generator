"use client";

import type { MarkerStyle } from "@/lib/qr-marker";
import { cn } from "@/lib/utils";

/** Мини-пиктограмма стиля модулей для карточек выбора */
export function StyleGlyph({ style, active }: { style: MarkerStyle; active: boolean }) {
  const shape =
    style === "dots" ? "rounded-full" : style === "rounded" ? "rounded-[2.5px]" : "rounded-none";
  // Упрощённый узор «глаза» QR 5×5
  const cells = [
    1, 1, 1, 1, 1,
    1, 0, 0, 0, 1,
    1, 0, 1, 0, 1,
    1, 0, 0, 0, 1,
    1, 1, 1, 1, 1,
  ];
  return (
    <div className="grid grid-cols-5 gap-[2px]" aria-hidden="true">
      {cells.map((filled, i) => (
        <span
          key={i}
          className={cn(
            "size-[5px]",
            filled ? (active ? "bg-amber-400" : "bg-neutral-500") : "bg-transparent",
            filled ? shape : ""
          )}
        />
      ))}
    </div>
  );
}
