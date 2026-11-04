"use client";

import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  createMarkerDesign,
  designFromCells,
  drawMarker,
  type MarkerConfig,
} from "@/lib/marker";
import { Cloud, Copy, Download, RotateCcw, Trash2 } from "lucide-react";

export interface HistoryItem extends MarkerConfig {
  /** Время последнего действия — для сортировки и подписи */
  ts: number;
  /** Когда метка создана впервые */
  createdAt?: number;
  /** Узор, сохранённый в БД (если есть) */
  cells?: number[];
}

interface HistoryCardProps {
  item: HistoryItem;
  /** Позиция в списке — для ступенчатой задержки появления */
  index?: number;
  /** Метка из облака: бейдж «Облако», без удаления (управляется синхронизацией) */
  cloud?: boolean;
  onDownload: (item: HistoryItem) => void;
  onLoad: (item: HistoryItem) => void;
  onDelete?: (item: HistoryItem) => void;
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
export function HistoryCard({ item, index = 0, cloud = false, onDownload, onLoad, onDelete }: HistoryCardProps) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /* Рисуем сохранённый в БД узор; старые/облачные записи — из ID */
  const design = useMemo(
    () => designFromCells(item.cells ?? []) ?? createMarkerDesign(item.id),
    [item.id, item.cells]
  );

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
      className="anim-rise group rounded-[24px] border border-stone-200/80 bg-white p-4 shadow-soft-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-stone-300/90 hover:shadow-soft dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-700"
      style={{ animationDelay: `${Math.min(index * 50, 350)}ms` }}
    >
      <div className="flex gap-3.5">
        <div className="w-[92px] shrink-0 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200/90 transition-transform duration-200 group-hover:scale-[1.03] dark:ring-stone-700">
          <canvas
            ref={canvasRef}
            className="block h-auto w-full"
            aria-label={`Мини-превью метки ${item.name}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-sm font-medium text-stone-900 dark:text-stone-100" title={item.name}>
              {item.name}
            </span>
            {cloud && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                <Cloud className="size-3" aria-hidden="true" />
                Облако
              </span>
            )}
          </div>
          <div className="mt-1">
            <button
              type="button"
              onClick={() => void copyId()}
              title="Скопировать ID"
              aria-label={`Скопировать ID ${item.id}`}
              className="-mx-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-xs tracking-wider text-orange-700 transition-colors hover:bg-orange-50 hover:text-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/60 dark:text-orange-400 dark:hover:bg-orange-950/50 dark:hover:text-orange-300 dark:focus-visible:ring-orange-500/40"
            >
              {item.id}
              <Copy className="size-3 opacity-60" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">{formatDate(item.ts)}</div>
        </div>
      </div>
      <div className={`mt-3.5 grid gap-1.5 ${cloud ? "grid-cols-2" : "grid-cols-3"}`}>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 rounded-full border-transparent bg-stone-100 text-xs text-stone-600 hover:bg-stone-200 hover:text-stone-900 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700 dark:hover:text-stone-100"
          onClick={() => onDownload(item)}
          title="Скачать JPG без названия — для Vuforia"
        >
          <Download className="size-3.5" aria-hidden="true" />
          JPG
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 rounded-full border-transparent bg-stone-100 text-xs text-stone-600 hover:bg-stone-200 hover:text-stone-900 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700 dark:hover:text-stone-100"
          onClick={() => onLoad(item)}
          title="Загрузить в редактор"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Открыть
        </Button>
        {!cloud && onDelete && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 rounded-full border-transparent bg-stone-100 text-xs text-stone-600 hover:bg-stone-200 hover:text-stone-900 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700 dark:hover:text-stone-100"
            onClick={() => onDelete(item)}
            title="Удалить из истории"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Удалить
          </Button>
        )}
      </div>
    </article>
  );
}
