"use client";

import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { createMarkerDesign, drawMarker, type MarkerConfig } from "@/lib/marker";
import { Copy, Download, RotateCcw, Trash2 } from "lucide-react";

export interface HistoryItem extends MarkerConfig {
  ts: number;
}

interface HistoryCardProps {
  item: HistoryItem;
  /** Позиция в списке — для ступенчатой задержки появления */
  index?: number;
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
export function HistoryCard({ item, index = 0, onDownload, onLoad, onDelete }: HistoryCardProps) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const design = useMemo(() => createMarkerDesign(item.id), [item.id]);

  const copyId = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(item.id);
      toast({ title: "ID скопирован", description: item.id, variant: "success", duration: 2000 });
    } catch {
      toast({ title: "Не удалось скопировать ID", variant: "destructive", duration: 2500 });
    }
  };

  useEffect(() => {
    if (!canvasRef.current || !design) return;
    drawMarker(canvasRef.current, design, {
      name: item.name,
      id: item.id,
      size: 220,
      dpr: 1.5,
    });
  }, [design, item]);

  return (
    <article
      className="anim-rise group rounded-[24px] border border-stone-200/80 bg-white p-4 shadow-soft-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-stone-300/90 hover:shadow-soft"
      style={{ animationDelay: `${Math.min(index * 50, 350)}ms` }}
    >
      <div className="flex gap-3.5">
        <div className="w-[92px] shrink-0 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200/90 transition-transform duration-200 group-hover:scale-[1.03]">
          <canvas
            ref={canvasRef}
            className="block h-auto w-full"
            aria-label={`Мини-превью метки ${item.name}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-stone-900" title={item.name}>
            {item.name}
          </div>
          <div className="mt-1">
            <button
              type="button"
              onClick={() => void copyId()}
              title="Скопировать ID"
              aria-label={`Скопировать ID ${item.id}`}
              className="-mx-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-xs tracking-wider text-orange-700 transition-colors hover:bg-orange-50 hover:text-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/60"
            >
              {item.id}
              <Copy className="size-3 opacity-60" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-1 text-xs text-stone-500">{formatDate(item.ts)}</div>
        </div>
      </div>
      <div className="mt-3.5 grid grid-cols-3 gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 rounded-full border-transparent bg-stone-100 text-xs text-stone-600 hover:bg-stone-200 hover:text-stone-900"
          onClick={() => onDownload(item)}
          title="Скачать PNG"
        >
          <Download className="size-3.5" aria-hidden="true" />
          Скачать
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 rounded-full border-transparent bg-stone-100 text-xs text-stone-600 hover:bg-stone-200 hover:text-stone-900"
          onClick={() => onLoad(item)}
          title="Загрузить в редактор"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Открыть
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 rounded-full border-transparent bg-stone-100 text-xs text-stone-600 hover:bg-stone-200 hover:text-stone-900"
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
