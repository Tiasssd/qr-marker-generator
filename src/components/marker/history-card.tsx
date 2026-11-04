"use client";

import { useEffect, useMemo, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  createMarkerDesign,
  designFromCells,
  drawMarker,
  type MarkerConfig,
} from "@/lib/marker";
import { Cloud, CloudOff, Copy, Download, Pencil, Trash2 } from "lucide-react";

export interface HistoryItem extends MarkerConfig {
  /** Время последнего действия — для сортировки и подписи */
  ts: number;
  /** Когда метка создана впервые */
  createdAt?: number;
  /** Узор, сохранённый в БД (если есть) */
  cells?: number[];
  /** Запись пришла из общей БД */
  fromCloud?: boolean;
  /** Синхронизирована ли запись с общей БД */
  synced?: boolean;
}

interface HistoryCardProps {
  item: HistoryItem;
  /** Метка из общей БД: бейдж «Общая БД» */
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

const rowButton =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-2.5 text-[11px] font-medium text-ink-soft transition-colors hover:border-ink/20 hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/30 disabled:pointer-events-none disabled:opacity-40";

/** Строка архива меток: миниатюра, название, ID и действия */
export function HistoryCard({
  item,
  cloud = false,
  onDownload,
  onLoad,
  onDelete,
}: HistoryCardProps) {
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
      toast({
        title: "ID скопирован",
        description: item.id,
        variant: "success",
        duration: 2000,
      });
    } catch {
      toast({
        title: "Не удалось скопировать ID",
        variant: "destructive",
        duration: 2500,
      });
    }
  };

  useEffect(() => {
    if (!canvasRef.current || !design) return;
    drawMarker(canvasRef.current, design, {
      /* В миниатюре название не нужно — оно уже есть в строке */
      name: "",
      id: item.id,
      size: 220,
      dpr: 1.5,
    });
  }, [design, item]);

  return (
    <article className="group flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <div className="w-14 shrink-0 overflow-hidden rounded-md bg-white ring-1 ring-line sm:w-16">
          <canvas
            ref={canvasRef}
            className="block h-auto w-full"
            aria-label={`Мини-превью метки ${item.name}`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="min-w-0 truncate text-[13px] font-medium text-ink"
              title={item.name}
            >
              {item.name}
            </span>
            {cloud && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line bg-paper px-1.5 py-0.5 text-[10px] font-medium text-ink-soft">
                <Cloud className="size-2.5" aria-hidden="true" />
                Общая БД
              </span>
            )}
            {item.synced === false && (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
                title="Метка сохранена локально и ждёт отправки в общую БД"
              >
                <CloudOff className="size-2.5" aria-hidden="true" />
                Не отправлено
              </span>
            )}
          </div>

          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <button
              type="button"
              onClick={() => void copyId()}
              title="Скопировать ID"
              aria-label={`Скопировать ID ${item.id}`}
              className="-mx-1 inline-flex items-center gap-1 rounded px-1 font-mono text-[11px] tracking-wide text-signal transition-colors hover:text-signal-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/30"
            >
              {item.id}
              <Copy className="size-3 opacity-60" aria-hidden="true" />
            </button>
            <span className="text-[11px] text-ink-muted">·</span>
            <span className="text-[11px] text-ink-muted">
              {formatDate(item.createdAt ?? item.ts)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 sm:ml-auto sm:flex sm:items-center">
        <button
          type="button"
          onClick={() => onDownload(item)}
          title="Скачать JPG без названия — для Vuforia"
          className={rowButton}
        >
          <Download className="size-3.5" aria-hidden="true" />
          JPG
        </button>
        <button
          type="button"
          onClick={() => onLoad(item)}
          title="Открыть в редакторе"
          className={rowButton}
        >
          <Pencil className="size-3.5" aria-hidden="true" />
          Открыть
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(item)}
            title={cloud ? "Удалить из общей БД" : "Удалить из архива"}
            className={`${rowButton} hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:hover:border-red-900/60 dark:hover:bg-red-950/40 dark:hover:text-red-300`}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Удалить
          </button>
        )}
      </div>
    </article>
  );
}
