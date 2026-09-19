"use client";

import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { createQrData, drawMarker, type MarkerConfig } from "@/lib/qr-marker";
import { Download, RotateCcw, Trash2 } from "lucide-react";

export interface HistoryItem extends MarkerConfig {
  ts: number;
}

interface HistoryCardProps {
  item: HistoryItem;
  onDownload: (item: HistoryItem) => void;
  onLoad: (item: HistoryItem) => void;
  onDelete: (item: HistoryItem) => void;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Карточка сохранённой метки из истории с мини-превью */
export function HistoryCard({ item, onDownload, onLoad, onDelete }: HistoryCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const qr = useMemo(() => createQrData(item.id), [item.id]);

  useEffect(() => {
    if (!canvasRef.current || !qr) return;
    drawMarker(canvasRef.current, qr, {
      name: item.name,
      id: item.id,
      size: 220,
      dpr: 1.5,
    });
  }, [qr, item]);

  return (
    <article className="group rounded-xl border border-white/10 bg-neutral-900/60 p-3 transition-colors hover:border-white/20">
      <div className="flex gap-3">
        <div className="w-[92px] shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-black/10">
          <canvas
            ref={canvasRef}
            className="block h-auto w-full"
            aria-label={`Мини-превью метки ${item.name}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-neutral-100" title={item.name}>
            {item.name}
          </div>
          <div className="mt-1 font-mono text-xs tracking-wider text-amber-400/90">{item.id}</div>
          <div className="mt-1 text-xs text-neutral-500">{formatDate(item.ts)}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5 opacity-70 transition-opacity group-hover:opacity-100">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 border-white/10 bg-transparent text-[11px] text-neutral-200 hover:bg-white/10 hover:text-white"
          onClick={() => onDownload(item)}
          title="Скачать PNG"
        >
          <Download className="size-3.5" aria-hidden="true" />
          Скачать
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 border-white/10 bg-transparent text-[11px] text-neutral-200 hover:bg-white/10 hover:text-white"
          onClick={() => onLoad(item)}
          title="Загрузить в редактор"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Открыть
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 border-white/10 bg-transparent text-[11px] text-neutral-400 hover:bg-red-500/10 hover:text-red-400"
          onClick={() => onDelete(item)}
          title="Удалить из истории"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          Удалить
        </Button>
      </div>
    </article>
  );
}
