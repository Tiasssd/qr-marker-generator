"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToastAction } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToast } from "@/hooks/use-toast";
import { HistoryCard, type HistoryItem } from "@/components/marker/history-card";
import {
  createMarkerDesign,
  designFromCells,
  deriveId,
  drawMarker,
  exportMarkerJpeg,
  MARKER_SIDE_RATIO,
  markerFileName,
  renderMarkerJpegDataUrl,
  type MarkerConfig,
} from "@/lib/marker";
import {
  clearMarkers,
  deleteMarker,
  loadMarkers,
  saveMarker,
  type MarkerRecord,
  type StorageMode,
} from "@/lib/marker-db";
import {
  Check,
  CloudOff,
  Copy,
  Download,
  FileDown,
  History,
  Maximize2,
  RefreshCw,
  Search,
  SearchX,
  Shapes,
  Share2,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  clearCloudMarkers,
  cloudEnabled,
  deleteCloudMarker,
  describeCloudError,
  fetchCloudMarkers,
  pushCloudMarker,
  type CloudMarker,
} from "@/lib/cloud";

const EXPORT_SIZE = 2048;
const CLOUD_MIGRATED_KEY = "ar-marker-cloud-migrated:v1";

/* Статус облачной синхронизации: off — сборка без ключей (локальный режим),
   syncing — грузим, on — работает, error — облако недоступно */
type CloudStatus = "off" | "syncing" | "on" | "error";
interface CloudState {
  status: CloudStatus;
  items: CloudMarker[];
  /** Человекочитаемая причина последнего сбоя (null — сбоя не было) */
  failReason: string | null;
}

const CLOUD_ON = cloudEnabled();

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/* Параметры ссылки «Поделиться»: имя метки и размер печати */
function readSharedConfig(): { name: string; size: number | null } {
  if (typeof window === "undefined") return { name: "", size: null };
  try {
    const params = new URLSearchParams(window.location.search);
    const name = (params.get("name") ?? "").trim().slice(0, 60);
    const rawSize = Number(params.get("size"));
    const size = rawSize === 10 || rawSize === 13 || rawSize === 16 ? rawSize : null;
    return { name, size };
  } catch {
    return { name: "", size: null };
  }
}

/* Запись из БД → элемент истории */
function toHistoryItem(record: MarkerRecord): HistoryItem {
  return {
    name: record.name,
    id: record.id,
    ts: record.updatedAt,
    createdAt: record.createdAt,
    cells: record.cells.length > 0 ? record.cells : undefined,
    synced: record.synced !== false,
  };
}

/* Запись из общей БД → элемент истории */
function fromCloudItem(record: CloudMarker): HistoryItem {
  const created = Date.parse(record.created_at) || Date.now();
  const updated = Date.parse(record.updated_at) || created;
  return {
    name: record.name,
    id: record.id,
    ts: updated,
    createdAt: created,
    cells: record.cells.length > 0 ? record.cells : undefined,
    fromCloud: true,
    synced: true,
  };
}

/* Элемент истории → запись для общей БД */
function toCloudRecord(item: HistoryItem): CloudMarker {
  const design = designFromCells(item.cells ?? []) ?? createMarkerDesign(item.id);
  const created = item.createdAt ?? item.ts;
  return {
    id: item.id,
    name: item.name,
    cells: design ? [...design.cells] : [],
    created_at: new Date(created).toISOString(),
    updated_at: new Date(item.ts).toISOString(),
  };
}

/* Человекочитаемый режим хранения для подвала истории */
function storageLabel(mode: StorageMode): string {
  if (mode === "indexeddb") return "IndexedDB";
  if (mode === "localstorage") return "localStorage";
  return "в памяти";
}

function pluralMarkers(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} метка`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} метки`;
  }
  return `${count} меток`;
}

/* Декодирование data-URL в Image — для пропорций при раскладке на листе A4 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось декодировать картинку метки"));
    img.src = url;
  });
}

/** Фоновый пример метки для пустого предпросмотра */
function SampleMarkerCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const sampleId = deriveId("Пример метки");
    const sample = sampleId ? createMarkerDesign(sampleId) : null;
    if (!sample || !ref.current) return;
    drawMarker(ref.current, sample, {
      name: "",
      id: sampleId,
      size: 660,
      dpr: 2,
    });
  }, []);
  return (
    <canvas
      ref={ref}
      className="block h-auto w-full opacity-40"
      aria-hidden="true"
    />
  );
}

export function MarkerStudio() {
  const { toast } = useToast();
  const [initialShare] = useState(readSharedConfig);
  const [name, setName] = useState(initialShare.name);
  const [printSizeCm, setPrintSizeCm] = useState(initialShare.size ?? 16);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [dbMode, setDbMode] = useState<StorageMode>("memory");
  const [dbLoading, setDbLoading] = useState(true);
  const [historyQuery, setHistoryQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [pdfAllBusy, setPdfAllBusy] = useState(false);
  const [showSticky, setShowSticky] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [cloud, setCloud] = useState<CloudState>(() => ({
    status: CLOUD_ON ? "syncing" : "off",
    items: [],
    failReason: null,
  }));

  const previewRef = useRef<HTMLCanvasElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const zoomRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<HistoryItem[]>([]);
  const cloudReadyRef = useRef(false);
  const [zoomOpen, setZoomOpen] = useState(false);

  /* ID выводится из названия: разное название — другой узор,
     то же название — та же метка (перепечатка не ломает привязку) */
  const id = useMemo(() => deriveId(name), [name]);
  const design = useMemo(() => (id ? createMarkerDesign(id) : null), [id]);

  /* Облачные метки, которых нет в локальной истории: узор восстановится
     из названия — храним только его. Показываем с бейджем «Общая БД». */
  const cloudOnlyItems = useMemo<HistoryItem[]>(() => {
    if (cloud.status !== "on") return [];
    const localNames = new Set(history.map((it) => normalizeName(it.name)));
    return cloud.items
      .filter((c) => !localNames.has(normalizeName(c.name)))
      .map(fromCloudItem);
  }, [cloud, history]);

  const total = history.length + cloudOnlyItems.length;

  /* Один список для поиска и отображения: локальные + общие */
  const visibleHistory = useMemo<HistoryItem[]>(() => {
    const q = historyQuery.trim().toLowerCase();
    const local = q
      ? history.filter((it) => it.name.toLowerCase().includes(q))
      : history;
    const cloudItems = q
      ? cloudOnlyItems.filter((it) => it.name.toLowerCase().includes(q))
      : cloudOnlyItems;
    return [...local, ...cloudItems].sort(
      (a, b) => (b.createdAt ?? b.ts) - (a.createdAt ?? a.ts)
    );
  }, [history, cloudOnlyItems, historyQuery]);

  /* Защита от коллизий узоров: ёмкость алфавита конечна (10,6 млн),
     и два разных названия МОГУТ дать один узор — камера будет путать их.
     Ищем совпадение текущего узора с узорами уже созданных меток. */
  const collisionWith = useMemo<string | null>(() => {
    if (!design || !name.trim()) return null;
    const currentSig = [...design.cells].sort((a, b) => a - b).join(",");
    const others = [...history, ...cloudOnlyItems].filter((it) => it.id !== id);
    for (const it of others) {
      const other = designFromCells(it.cells ?? []) ?? createMarkerDesign(it.id);
      if (!other) continue;
      const otherSig = [...other.cells].sort((a, b) => a - b).join(",");
      if (otherSig === currentSig) return it.name;
    }
    return null;
  }, [design, id, name, history, cloudOnlyItems]);

  /* Загрузка списка из общей БД (первая + ручное обновление + автоопрос) */
  const refreshCloud = useCallback(async (showSyncing = true): Promise<void> => {
    if (!CLOUD_ON) return;
    if (showSyncing) {
      setCloud((prev) => ({
        ...prev,
        status: prev.status === "on" ? "syncing" : prev.status,
      }));
    }
    try {
      const wasReady = cloudReadyRef.current;
      let items = await fetchCloudMarkers();

      /* Первый запуск с общей БД: если она пуста, переносим туда
         локальную историю этого браузера. */
      let migrationFailed = false;
      let migrated = false;
      try {
        migrated = window.localStorage.getItem(CLOUD_MIGRATED_KEY) === "1";
      } catch {
        migrated = false;
      }
      if (!migrated) {
        const local = historyRef.current;
        if (items.length === 0 && local.length > 0) {
          const results = await Promise.allSettled(
            local.map((it) => pushCloudMarker(toCloudRecord(it)))
          );
          if (results.some((r) => r.status === "fulfilled")) {
            items = await fetchCloudMarkers();
            const syncedIds = new Set(items.map((it) => it.id));
            const next = historyRef.current.map((it) =>
              syncedIds.has(it.id) ? { ...it, synced: true } : it
            );
            historyRef.current = next;
            setHistory(next);
          } else {
            migrationFailed = true;
          }
        }
        if (!migrationFailed) {
          try {
            window.localStorage.setItem(CLOUD_MIGRATED_KEY, "1");
          } catch {
            // приватный режим — миграция просто повторится
          }
        }
      }

      setCloud({
        status: migrationFailed ? "error" : "on",
        items,
        failReason: migrationFailed ? "не удалось перенести локальную историю" : null,
      });
      if (migrationFailed) return;
      cloudReadyRef.current = true;

      /* Досылаем записи, которые не ушли в общую БД в прошлый раз */
      const pending = historyRef.current.filter((it) => it.synced === false);
      if (pending.length > 0) {
        const results = await Promise.allSettled(
          pending.map(async (it) => {
            await pushCloudMarker(toCloudRecord(it));
            return it.id;
          })
        );
        const syncedIds = new Set(
          results
            .filter(
              (r): r is PromiseFulfilledResult<string> => r.status === "fulfilled"
            )
            .map((r) => r.value)
        );
        if (syncedIds.size > 0) {
          const next = historyRef.current.map((it) =>
            syncedIds.has(it.id) ? { ...it, synced: true } : it
          );
          historyRef.current = next;
          setHistory(next);
          for (const id of syncedIds) {
            const item = next.find((it) => it.id === id);
            if (!item) continue;
            void saveMarker({
              id: item.id,
              name: item.name,
              cells: item.cells ?? [],
              createdAt: item.createdAt ?? item.ts,
              updatedAt: item.ts,
              synced: true,
            });
          }
          items = await fetchCloudMarkers();
          setCloud({ status: "on", items, failReason: null });
        }
      }

      /* Метки, удалённые в общей БД другими людьми, убираем из кэша.
         Несинхронизированные (synced: false) не трогаем — они ещё ждут отправки.
         На самом первом успешном ответе кэш не чистим, чтобы не потерять
         локальную историю до миграции. */
      if (!wasReady) return;
      const cloudIds = new Set(items.map((it) => it.id));
      const stale = historyRef.current.filter(
        (it) =>
          it.synced !== false &&
          !cloudIds.has(it.id) &&
          /* Свежая запись могла ещё не попасть в выборку — даём минуту */
          Date.now() - it.ts > 60_000
      );
      if (stale.length > 0) {
        const staleIds = new Set(stale.map((it) => it.id));
        const next = historyRef.current.filter((it) => !staleIds.has(it.id));
        historyRef.current = next;
        setHistory(next);
        void Promise.allSettled(stale.map((it) => deleteMarker(it.id)));
      }
    } catch (err) {
      setCloud((prev) => ({
        ...prev,
        status: "error",
        failReason: describeCloudError(err),
      }));
    }
  }, []);

  useEffect(() => {
    /* Ждём локальную историю, иначе миграция в общую БД увидит пустой список.
       setTimeout уводит setState из синхронного тела эффекта. */
    if (dbLoading) return;
    const timer = window.setTimeout(() => {
      void refreshCloud(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [dbLoading, refreshCloud]);

  /* Пока вкладка открыта — подтягиваем изменения других пользователей */
  useEffect(() => {
    if (!CLOUD_ON) return;
    const refresh = (): void => {
      if (!document.hidden) void refreshCloud(false);
    };
    const timer = window.setInterval(refresh, 20000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refreshCloud]);

  /* Загрузка истории из браузерной БД (IndexedDB → localStorage → память) */
  useEffect(() => {
    let cancelled = false;
    void loadMarkers()
      .then(({ items, mode }) => {
        if (cancelled) return;
        const mapped = items.map(toHistoryItem);
        /* Не затираем метку, которую пользователь успел сохранить,
           пока IndexedDB ещё открывалась */
        setHistory((prev) => {
          const prevIds = new Set(prev.map((it) => it.id));
          const merged = [
            ...prev,
            ...mapped.filter((it) => !prevIds.has(it.id)),
          ]
            .sort((a, b) => b.ts - a.ts)
            .slice(0, 500);
          historyRef.current = merged;
          return merged;
        });
        setDbMode(mode);
        setDbLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setDbLoading(false);
        setDbMode("memory");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* Актуальная история для записи в БД без лишних пересозданий колбэка */
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  /* Сохраняет метку в БД и поднимает её в начало списка.
     Вызывается при скачивании, PDF и шеринге — то есть когда метка
     реально «выпущена», а не на каждый символ в поле названия. */
  const rememberMarker = useCallback(
    (
      config: MarkerConfig,
      cells?: readonly number[],
      knownCreatedAt?: number
    ): void => {
      const cleanName = config.name.trim().replace(/\s+/g, " ");
      if (!cleanName || !config.id) return;

      const patternSource =
        cells && cells.length > 0
          ? designFromCells(cells)
          : createMarkerDesign(config.id);
      const pattern = patternSource ? [...patternSource.cells] : [];

      const prev = historyRef.current;
      const existing = prev.find((it) => it.id === config.id);
      const createdAt = knownCreatedAt ?? existing?.createdAt ?? Date.now();
      /* ts всегда растёт — без дублей ключей при быстрых нажатиях */
      const ts = Math.max(Date.now(), (prev[0]?.ts ?? 0) + 1);
      const synced = !CLOUD_ON;
      const item: HistoryItem = {
        name: cleanName,
        id: config.id,
        ts,
        createdAt,
        cells: pattern.length > 0 ? pattern : undefined,
        synced,
      };

      const next = [item, ...prev.filter((it) => it.id !== config.id)].slice(0, 500);
      historyRef.current = next;
      setHistory(next);

      const localRecord = {
        id: config.id,
        name: cleanName,
        cells: pattern,
        createdAt,
        updatedAt: ts,
        synced,
      };

      void saveMarker(localRecord)
        .then((mode) => setDbMode(mode))
        .catch(() => undefined);

      if (CLOUD_ON) {
        void pushCloudMarker(toCloudRecord(item))
          .then(() => {
            const syncedItem = { ...item, synced: true };
            setHistory((current) => {
              const updated = current.map((it) =>
                it.id === syncedItem.id ? syncedItem : it
              );
              historyRef.current = updated;
              return updated;
            });
            void saveMarker({ ...localRecord, synced: true });
            void refreshCloud(false);
          })
          .catch((err: unknown) => {
            setCloud((current) => ({
              ...current,
              status: "error",
              failReason: describeCloudError(err),
            }));
          });
      }
    },
    [refreshCloud]
  );

  /* Возврат удалённой метки (undo в тосте) */
  const restoreMarker = useCallback(
    (item: HistoryItem): void => {
      const patternSource =
        designFromCells(item.cells ?? []) ?? createMarkerDesign(item.id);
      const pattern = patternSource ? [...patternSource.cells] : [];
      const synced = !CLOUD_ON;
      const restored: HistoryItem = { ...item, cells: pattern, synced };
      const next = [
        restored,
        ...historyRef.current.filter((it) => it.id !== item.id),
      ].slice(0, 500);
      historyRef.current = next;
      setHistory(next);

      const localRecord = {
        id: item.id,
        name: item.name,
        cells: pattern,
        createdAt: item.createdAt ?? item.ts,
        updatedAt: item.ts,
        synced,
      };
      void saveMarker(localRecord)
        .then((mode) => setDbMode(mode))
        .catch(() => undefined);

      if (CLOUD_ON) {
        void pushCloudMarker(toCloudRecord(restored))
          .then(() => {
            const syncedItem = { ...restored, synced: true };
            setHistory((current) => {
              const updated = current.map((it) =>
                it.id === syncedItem.id ? syncedItem : it
              );
              historyRef.current = updated;
              return updated;
            });
            void saveMarker({ ...localRecord, synced: true });
            void refreshCloud(false);
          })
          .catch((err: unknown) => {
            setCloud((current) => ({
              ...current,
              status: "error",
              failReason: describeCloudError(err),
            }));
          });
      }
    },
    [refreshCloud]
  );

  /* Перерисовка предпросмотра после загрузки шрифтов */
  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts) return;
    fonts.ready
      .then(() => setFontsReady(true))
      .catch(() => undefined);
  }, []);

  /* Печать удалена: вместо window.print скачивается готовый PDF —
     физический размер в мм задаётся при раскладке, никакой зависимости
     от настроек диалога печати браузера */

  /* Живой предпросмотр метки */
  useEffect(() => {
    if (!design || !previewRef.current) return;
    drawMarker(previewRef.current, design, {
      name,
      id,
      size: 660,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
    });
  }, [design, name, id, fontsReady]);

  /* Заголовок вкладки отражает текущую метку.
     setTimeout — чтобы не проиграть гонку менеджеру метаданных Next
     при открытии ссылки «Поделиться», где имя задано ещё до гидрации. */
  useEffect(() => {
    const trimmed = name.trim();
    const title = trimmed
      ? `Метка «${trimmed}» — Генератор AR-меток`
      : "Генератор AR-меток — трекер-метки для 3D-машинок";
    const timer = window.setTimeout(() => {
      document.title = title;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [name]);

  /* Липкая панель появляется только когда основные действия ушли из вида */
  useEffect(() => {
    const el = actionsRef.current;
    if (!el || !design) {
      setShowSticky(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setShowSticky(!entry.isIntersecting),
      { rootMargin: "-80px 0px 0px 0px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [design]);

  /* Резерв места под липкую панель — только на мобильном и только когда она видна */
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const apply = (): void => {
      const bar = document.querySelector<HTMLElement>(".marker-sticky-bar");
      document.body.style.paddingBottom =
        mq.matches && showSticky && bar ? `${bar.offsetHeight + 20}px` : "";
    };
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      document.body.style.paddingBottom = "";
    };
  }, [showSticky]);

  /* Крупный вид в модалке. Портал диалога монтируется ПОЗЖЕ срабатывания
     эффекта с zoomOpen, поэтому рисуем прямо в ref-callback: он вызывается
     в момент реального появления канваса в DOM (и при смене названия) */
  const drawZoom = useCallback(
    (canvas: HTMLCanvasElement | null): void => {
      zoomRef.current = canvas;
      if (canvas && design) {
        drawMarker(canvas, design, {
          name,
          id,
          size: 1100,
          dpr: Math.min(window.devicePixelRatio || 1, 2),
        });
      }
    },
    [design, name, id, fontsReady]
  );

  const saveBlob = (blob: Blob, fileName: string): void => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleDownload = async (): Promise<void> => {
    if (!name.trim() || !design) {
      toast({
        title: "Введите название",
        description: "Оно напечатается над меткой и задаст уникальный узор.",
        variant: "destructive",
        duration: 3500,
      });
      return;
    }
    try {
      /* Важно: name: "" — картинка для Vuforia без подписи.
         Квадрат 2048×2048, непрозрачный JPEG, только узор и белый фон. */
      const blob = await exportMarkerJpeg(design, {
        name: "",
        id,
        size: EXPORT_SIZE,
        dpr: 1,
      });
      saveBlob(blob, markerFileName(name, id, "jpg"));
      rememberMarker({ name, id }, [...design.cells]);
      toast({
        title: "JPG для Vuforia сохранён",
        description: `«${name.trim()}» — 2048×2048 px, без названия. Готов к загрузке в Vuforia.`,
        variant: "success",
        duration: 4000,
      });
    } catch {
      toast({ title: "Не удалось создать JPG", variant: "destructive", duration: 3500 });
    }
  };

  /** PDF с одной меткой: лист A4, точный физический размер из селектора */
  const handlePdf = async (): Promise<void> => {
    if (!name.trim() || !design) {
      toast({
        title: "Введите название",
        description: "Оно напечатается над меткой и задаст уникальный узор.",
        variant: "destructive",
        duration: 3500,
      });
      return;
    }
    try {
      /* jsPDF подтягивается динамически — в основном бандле его нет */
      const { jsPDF } = await import("jspdf");
      /* Для печати — версия С названием. Внутри PDF тоже JPEG:
         без альфа-канала и с предсказуемым цветом. */
      const url = renderMarkerJpegDataUrl(design, { name, id, size: EXPORT_SIZE, dpr: 1 });
      const img = await loadImage(url);
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
      /* printSizeCm — сторона самой квадратной метки, а не всей карточки */
      const w = (printSizeCm * 10) / MARKER_SIDE_RATIO;
      const h = w * (img.naturalHeight / img.naturalWidth);
      pdf.addImage(url, "JPEG", (210 - w) / 2, (297 - h) / 2, w, h);
      pdf.setProperties({ title: `AR-marker ${id}` });
      saveBlob(pdf.output("blob"), markerFileName(name, id, "pdf"));
      rememberMarker({ name, id }, [...design.cells]);
      toast({
        title: "PDF для печати сохранён",
        description: `«${name.trim()}» — метка ${printSizeCm} см на листе A4, с названием.`,
        variant: "success",
        duration: 3500,
      });
    } catch {
      toast({ title: "Не удалось создать PDF", variant: "destructive", duration: 3500 });
    }
  };

  /** PDF: все метки по 16 см, по одной на лист A4 */
  const handlePdfAll = (): void => {
    if (pdfAllBusy) return;
    const all = [...history, ...cloudOnlyItems];
    if (all.length === 0) return;
    setPdfAllBusy(true);
    void (async () => {
      try {
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
        /* 16 см — сторона самой метки; карточка чуть шире из-за полей */
        const w = (16 * 10) / MARKER_SIDE_RATIO;
        all.sort((a, b) => (b.createdAt ?? b.ts) - (a.createdAt ?? a.ts));
        let placed = 0;
        for (const it of all) {
          const itemDesign =
            designFromCells(it.cells ?? []) ?? createMarkerDesign(it.id);
          if (!itemDesign) continue;
          const url = renderMarkerJpegDataUrl(itemDesign, {
            name: it.name,
            id: it.id,
            size: EXPORT_SIZE,
            dpr: 1,
          });
          const img = await loadImage(url);
          const h = w * (img.naturalHeight / img.naturalWidth);
          if (placed > 0) pdf.addPage();
          pdf.addImage(url, "JPEG", (210 - w) / 2, (297 - h) / 2, w, h);
          placed++;
        }
        if (placed > 0) {
          pdf.setProperties({ title: "AR markers 16 cm" });
          saveBlob(pdf.output("blob"), markerFileName("Метки 16 см", "", "pdf"));
          toast({
            title: "PDF со всеми метками сохранён",
            description: `${placed} шт. по 16 см, по одной на лист A4.`,
            variant: "success",
            duration: 3500,
          });
        }
      } catch {
        toast({ title: "Не удалось создать PDF", variant: "destructive", duration: 3500 });
      } finally {
        setPdfAllBusy(false);
      }
    })();
  };

  const loadItem = (item: HistoryItem): void => {
    setName(item.name);
    toast({ title: "Метка загружена", description: `«${item.name}»`, variant: "success", duration: 2500 });
  };

  const downloadItem = async (item: HistoryItem): Promise<void> => {
    try {
      const itemDesign =
        designFromCells(item.cells ?? []) ?? createMarkerDesign(item.id);
      if (!itemDesign) throw new Error("Пустой ID метки");
      /* Тот же Vuforia-формат, что и из основной панели: без названия */
      const blob = await exportMarkerJpeg(itemDesign, {
        name: "",
        id: item.id,
        size: EXPORT_SIZE,
        dpr: 1,
      });
      saveBlob(blob, markerFileName(item.name, item.id, "jpg"));
      rememberMarker(
        { name: item.name, id: item.id },
        [...itemDesign.cells],
        item.createdAt
      );
      toast({
        title: "JPG сохранён",
        description: `«${item.name}» — без названия, для Vuforia.`,
        variant: "success",
        duration: 2500,
      });
    } catch {
      toast({ title: "Не удалось создать JPG", variant: "destructive", duration: 3500 });
    }
  };

  const deleteItem = (item: HistoryItem): void => {
    const next = historyRef.current.filter((it) => it.id !== item.id);
    historyRef.current = next;
    setHistory(next);
    void deleteMarker(item.id).catch(() => undefined);
    if (CLOUD_ON) {
      void deleteCloudMarker(item.id)
        .then(() => refreshCloud(false))
        .catch((err: unknown) =>
          setCloud((current) => ({
            ...current,
            status: "error",
            failReason: describeCloudError(err),
          }))
        );
    }
    toast({
      title: CLOUD_ON ? "Метка удалена из общей БД" : "Метка удалена из истории",
      description: `«${item.name}»`,
      duration: 5000,
      action: (
        <ToastAction
          altText="Вернуть удалённую метку"
          onClick={() => restoreMarker(item)}
        >
          Вернуть
        </ToastAction>
      ),
    });
  };

  const clearHistory = (): void => {
    if (history.length + cloudOnlyItems.length === 0) return;
    historyRef.current = [];
    setHistory([]);
    setConfirmClear(false);
    void clearMarkers().catch(() => undefined);
    if (CLOUD_ON) {
      void clearCloudMarkers()
        .then(() => refreshCloud(false))
        .catch(() => {
          setCloud((current) => ({ ...current, status: "error" }));
          toast({
            title: "Не удалось очистить общую БД",
            description: "Локальный кэш очищен, но серверные метки остались.",
            variant: "destructive",
            duration: 4000,
          });
        });
    }
    toast({ title: "История очищена", duration: 3000 });
  };

  const copyId = async (value: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "ID скопирован", description: value, variant: "success", duration: 2000 });
    } catch {
      toast({ title: "Не удалось скопировать ID", variant: "destructive", duration: 2500 });
    }
  };

  /** Ссылка на метку: открывается готовой — с названием и размером печати.
      На телефоне — системный шеринг, на десктопе — буфер обмена. */
  const handleShare = async (): Promise<void> => {
    if (!name.trim() || !design) {
      toast({
        title: "Введите название",
        description: "Ссылка ведёт на метку с этим названием.",
        variant: "destructive",
        duration: 3500,
      });
      return;
    }
    const trimmedName = name.trim();
    /* Каталог приложения, а не текущий файл: /repo/ на GitHub Pages */
    const base = new URL(".", window.location.href);
    const url = `${base.origin}${base.pathname}?name=${encodeURIComponent(
      trimmedName
    )}&size=${printSizeCm}`;
    rememberMarker({ name: trimmedName, id }, [...design.cells]);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `Метка «${trimmedName}»`,
          text: "AR-метка: уникальный узор из названия",
          url,
        });
        return;
      } catch (err) {
        // Пользователь закрыл системный диалог — ничего не делаем;
        // остальные ошибки (нет share-хендлера) — уходим в буфер обмена
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Ссылка скопирована",
        description: `Метка «${trimmedName}» откроется готовой к печати.`,
        variant: "success",
        duration: 3000,
      });
    } catch {
      toast({ title: "Не удалось скопировать ссылку", variant: "destructive", duration: 2500 });
    }
  };

  const downloadDisabled = !name.trim();
  const cloudError = CLOUD_ON && cloud.status === "error";
  const cloudLabel = !CLOUD_ON
    ? "Локально"
    : cloud.status === "on"
      ? "Общая БД"
      : cloud.status === "syncing"
        ? "Синхронизация"
        : "Только кэш";
  const cloudDot = !CLOUD_ON
    ? "bg-ink-muted"
    : cloud.status === "on"
      ? "bg-emerald-500"
      : cloud.status === "syncing"
        ? "bg-amber-500"
        : "bg-red-500";
  const dbLabel = dbLoading
    ? "…"
    : CLOUD_ON
      ? cloud.status === "on"
        ? "Supabase"
        : "кэш"
      : storageLabel(dbMode);

  return (
    <>
      <div className="anim-rise grid gap-6 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)] lg:items-start">
        {/* 01 — создание метки */}
        <Card className="gap-0 rounded-[20px] border-line bg-card py-0 shadow-none lg:h-full">
          <CardContent className="flex h-full flex-col p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] tracking-wide text-ink-muted">
                  01 / новая метка
                </p>
                <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-ink">
                  Название
                </h2>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-ink-muted">
                {name.length}/60
              </span>
            </div>

            <div className="relative mt-4">
              <Input
                id="marker-name"
                ref={nameInputRef}
                value={name}
                maxLength={60}
                aria-label="Название метки"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleDownload();
                }}
                placeholder="Например: Красная спортивная"
                className="h-12 rounded-xl border-line bg-paper pr-11 text-[15px] text-ink caret-signal placeholder:text-ink-muted focus-visible:border-ink/30 focus-visible:ring-signal/20"
              />
              {name.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setName("");
                    nameInputRef.current?.focus();
                  }}
                  aria-label="Очистить название"
                  className="absolute inset-y-0 right-2.5 my-auto grid size-7 place-items-center rounded-md text-ink-muted transition-colors hover:bg-card hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/30"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              Одно название — один узор. Перепечатка не меняет метку.
            </p>

            {collisionWith && (
              <p
                role="alert"
                className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
              >
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Узор совпал с «{collisionWith}». Камера будет путать метки — выберите
                другое название.
              </p>
            )}

            <div ref={actionsRef} className="mt-5 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloadDisabled}
                title="Скачать JPG без названия — для Vuforia"
                className="col-span-2 flex items-center gap-3 rounded-xl bg-ink p-3.5 text-left text-paper transition-colors hover:bg-ink/90 disabled:pointer-events-none disabled:opacity-40"
              >
                <Download className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">Скачать JPG</span>
                  <span className="mt-0.5 block text-[11px] text-paper/60">
                    Для Vuforia · без названия
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => void handlePdf()}
                disabled={downloadDisabled}
                title="Скачать PDF для печати: метка с названием, A4"
                className="flex flex-col items-start gap-2 rounded-xl border border-line bg-card p-3.5 text-left transition-colors hover:bg-paper disabled:pointer-events-none disabled:opacity-40"
              >
                <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
                  <FileDown className="size-4 text-ink-soft" aria-hidden="true" />
                  PDF
                </span>
                <span className="text-[11px] text-ink-muted">Печать · A4</span>
              </button>

              <button
                type="button"
                onClick={() => void handleShare()}
                disabled={downloadDisabled}
                title="Скопировать ссылку на метку"
                className="flex flex-col items-start gap-2 rounded-xl border border-line bg-card p-3.5 text-left transition-colors hover:bg-paper disabled:pointer-events-none disabled:opacity-40"
              >
                <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
                  <Share2 className="size-4 text-ink-soft" aria-hidden="true" />
                  Поделиться
                </span>
                <span className="text-[11px] text-ink-muted">Ссылка на метку</span>
              </button>
            </div>

            <div className="mt-6">
              <div className="flex items-baseline justify-between gap-3">
                <Label
                  htmlFor="marker-print-size"
                  className="text-[13px] font-medium text-ink"
                >
                  Размер метки
                </Label>
                <span className="font-mono text-[11px] tabular-nums text-ink-muted">
                  {printSizeCm} см
                </span>
              </div>
              <ToggleGroup
                id="marker-print-size"
                type="single"
                value={String(printSizeCm)}
                onValueChange={(v) => {
                  if (v) setPrintSizeCm(Number(v));
                }}
                aria-label="Размер при печати"
                className="mt-2 h-11 w-full gap-1 rounded-xl border border-line bg-paper p-1 shadow-none"
              >
                {[10, 13, 16].map((cm) => (
                  <ToggleGroupItem
                    key={cm}
                    value={String(cm)}
                    aria-label={`${cm} сантиметров`}
                    className="h-9 min-w-0 flex-1 select-none rounded-lg border-0 bg-transparent px-2 text-[13px] font-medium text-ink-muted shadow-none hover:bg-transparent hover:text-ink data-[state=on]:bg-selected data-[state=on]:font-semibold data-[state=on]:text-selected-ink data-[state=on]:shadow-sm data-[state=on]:hover:bg-selected dark:data-[state=on]:bg-selected dark:data-[state=on]:text-selected-ink"
                  >
                    {cm} см
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                Сторона квадрата. «PDF всех» — 16 см, по одной метке на лист.
              </p>
            </div>

            <div className="mt-auto hidden border-t border-line pt-4 lg:block lg:pt-5">
              <p className="font-mono text-[10px] tracking-wide text-ink-muted">
                Перед печатью
              </p>
              <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-ink-soft">
                <li className="flex gap-2">
                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-signal" aria-hidden="true" />
                  Белая бумага, масштаб 100%
                </li>
                <li className="flex gap-2">
                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-signal" aria-hidden="true" />
                  JPG — для Vuforia, без подписи
                </li>
                <li className="flex gap-2">
                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-signal" aria-hidden="true" />
                  PDF — для печати, с названием
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* 02 — предпросмотр на тёмном столе */}
        <Card className="preview-mat gap-0 overflow-hidden rounded-[20px] border border-white/5 bg-mat p-0 shadow-none">
          <div className="p-5 sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] tracking-wide text-white/60">
                  02 / пробный оттиск
                </p>
                <h2 className="mt-1 text-[17px] font-medium text-white">
                  Предпросмотр
                </h2>
              </div>
              {id ? (
                <button
                  type="button"
                  onClick={() => void copyId(id)}
                  title="Скопировать ID"
                  aria-label={`Скопировать ID ${id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 font-mono text-[11px] tracking-wide text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
                >
                  ID {id}
                  <Copy className="size-3 opacity-60" aria-hidden="true" />
                </button>
              ) : (
                <span className="pt-1.5 font-mono text-[11px] text-white/45">ID —</span>
              )}
            </div>

            <div className="mt-6 flex justify-center sm:mt-8">
              <div className="relative w-full max-w-[440px]">
                <span
                  className="pointer-events-none absolute -left-3 -top-3 size-4 border-l border-t border-white/25"
                  aria-hidden="true"
                />
                <span
                  className="pointer-events-none absolute -right-3 -top-3 size-4 border-r border-t border-white/25"
                  aria-hidden="true"
                />
                <span
                  className="pointer-events-none absolute -bottom-2 -left-5 size-3 border-b border-l border-white/25"
                  aria-hidden="true"
                />
                <span
                  className="pointer-events-none absolute -bottom-2 -right-5 size-3 border-b border-r border-white/25"
                  aria-hidden="true"
                />

                <button
                  type="button"
                  onClick={() => setZoomOpen(true)}
                  disabled={!design}
                  title={design ? "Открыть метку крупно" : "Введите название"}
                  aria-label={design ? "Открыть метку крупно" : "Введите название метки"}
                  className={`group/zoom relative block w-full cursor-zoom-in overflow-hidden bg-white p-2 text-left shadow-[0_24px_60px_-24px_rgba(0,0,0,0.55)] ring-1 ring-black/10 disabled:cursor-default ${
                    design
                      ? ""
                      : "flex aspect-[2048/2281] items-center justify-center"
                  }`}
                >
                  {design ? (
                    <canvas
                      ref={previewRef}
                      className="anim-paper block h-auto w-full"
                      aria-label="Предпросмотр метки"
                    />
                  ) : (
                    <>
                      <SampleMarkerCanvas />
                      <span className="absolute inset-0 flex flex-col items-center justify-center bg-white/75 p-6 text-center">
                        <span className="font-mono text-[10px] tracking-wide text-print-soft">
                          Макет
                        </span>
                        <span className="mt-2 text-lg font-medium text-print-ink">
                          Введите название
                        </span>
                        <span className="mt-1 text-xs text-print-soft">
                          Узор и подпись появятся здесь
                        </span>
                      </span>
                    </>
                  )}
                  {design && (
                    <span className="pointer-events-none absolute right-4 top-4 grid size-8 place-items-center rounded-lg border border-line bg-card/90 text-ink-soft opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover/zoom:opacity-100">
                      <Maximize2 className="size-3.5" aria-hidden="true" />
                    </span>
                  )}
                </button>

                <div
                  className="ruler-ticks pointer-events-none absolute -bottom-6 left-0 right-0 h-2 text-white/25"
                  aria-hidden="true"
                />
              </div>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-white/10 pt-4 font-mono text-[10px] text-white/65">
              <span>2048 px</span>
              <span className="text-white/30">/</span>
              <span>JPEG · RGB</span>
              <span className="text-white/30">/</span>
              <span>{printSizeCm} см при печати</span>
              <span className="ml-auto inline-flex items-center gap-1.5 text-white/80">
                {design ? (
                  <>
                    <Check className="size-3 text-emerald-400" aria-hidden="true" />
                    Готово к Vuforia
                  </>
                ) : (
                  "Ожидает название"
                )}
              </span>
            </div>
          </div>
        </Card>

        {/* 03 — архив */}
        <Card className="gap-0 rounded-[20px] border-line bg-card py-0 shadow-none lg:col-span-2">
          <div className="flex flex-col gap-4 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:px-6">
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-lg border border-line bg-paper text-ink-soft">
                <History className="size-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-[15px] font-semibold tracking-tight text-ink">
                  Архив меток
                </h2>
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  {pluralMarkers(total)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              {total > 0 && (
                <div className="relative w-full min-w-0 sm:w-56 sm:flex-none">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={historyQuery}
                    onChange={(e) => setHistoryQuery(e.target.value)}
                    placeholder="Найти метку"
                    aria-label="Поиск по названию метки"
                    className="h-9 w-full rounded-lg border border-line bg-paper pl-8 pr-3 text-[13px] text-ink placeholder:text-ink-muted caret-signal focus-visible:border-ink/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/20"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  if (CLOUD_ON) void refreshCloud();
                }}
                aria-live="polite"
                title={
                  !CLOUD_ON
                    ? "Общая БД не подключена. История хранится в этом браузере (IndexedDB)"
                    : cloud.status === "on"
                      ? `${pluralMarkers(cloud.items.length)} в общей БД — обновить список`
                      : cloud.status === "error"
                        ? `Общая БД недоступна — ${cloud.failReason ?? "попробовать снова"}`
                        : "Идёт синхронизация с общей БД"
                }
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-card px-2.5 text-[11px] font-medium text-ink-soft transition-colors hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/20"
              >
                <span className={`size-1.5 rounded-full ${cloudDot}`} aria-hidden="true" />
                {cloudLabel}
                {CLOUD_ON && (
                  <RefreshCw
                    className={`size-3 ${cloud.status === "syncing" ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                )}
              </button>

              {total > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handlePdfAll}
                    disabled={pdfAllBusy}
                    title="Скачать PDF: все метки по 16 см, по одной на лист A4"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 text-[11px] font-medium text-ink-soft transition-colors hover:bg-paper disabled:pointer-events-none disabled:opacity-50"
                  >
                    <FileDown
                      className={`size-3.5 ${pdfAllBusy ? "animate-pulse" : ""}`}
                      aria-hidden="true"
                    />
                    {pdfAllBusy ? "Готовим…" : "PDF всех"}
                  </button>

                  <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
                    <AlertDialogTrigger asChild>
                      <button
                        type="button"
                        aria-label={CLOUD_ON ? "Очистить общую БД" : "Очистить архив"}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 text-[11px] font-medium text-ink-soft transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:hover:border-red-900/60 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        <span className="hidden sm:inline">Очистить</span>
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-[16px] border-line bg-card text-ink">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-ink">
                          {CLOUD_ON ? "Очистить общую БД?" : "Очистить архив?"}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-ink-soft">
                          {CLOUD_ON
                            ? `Все метки (${total}) удалятся из общей БД у всех пользователей. Скачанные JPG и PDF это не затронет.`
                            : `Все сохранённые метки (${total}) пропадут из архива. Скачанные JPG и PDF это не затронет.`}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-lg border-line bg-paper text-ink hover:bg-card">
                          Отмена
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={clearHistory}
                          className="rounded-lg bg-red-600 text-white hover:bg-red-500"
                        >
                          Очистить
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </div>
          </div>

          <div className="px-5 py-4 sm:px-6">
            {!CLOUD_ON && (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200/70 bg-amber-50/60 px-3 py-2.5 text-[11px] leading-relaxed text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-200">
                <CloudOff className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Локальный кэш: метки видны только в этом браузере.{" "}
                  <a
                    href="https://github.com/Tiasssd/qr-marker-generator/blob/main/HOSTING.md"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline underline-offset-2"
                  >
                    Как включить общую БД
                  </a>
                </span>
              </div>
            )}

            {cloudError && (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200/70 bg-red-50/60 px-3 py-2.5 text-[11px] leading-relaxed text-red-800 dark:border-red-900/40 dark:bg-red-950/25 dark:text-red-300">
                <CloudOff className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Общая БД недоступна
                  {cloud.failReason ? ` — ${cloud.failReason}` : ""}. Показан
                  локальный кэш.{" "}
                  <button
                    type="button"
                    onClick={() => void refreshCloud()}
                    className="font-medium underline underline-offset-2"
                  >
                    Повторить
                  </button>
                </span>
              </div>
            )}

            {dbLoading ? (
              <div className="space-y-2 py-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-14 animate-pulse rounded-lg bg-paper"
                  />
                ))}
              </div>
            ) : total === 0 ? (
              <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-paper/40 px-6 py-8 text-center">
                <span className="grid size-10 place-items-center rounded-lg border border-line bg-card text-ink-muted">
                  <Shapes className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[13px] font-medium text-ink">
                    Здесь появятся ваши метки
                  </p>
                  <p className="mt-1 max-w-[280px] text-[11px] leading-relaxed text-ink-muted">
                    Введите название и скачайте JPG — метка сразу попадёт в архив.
                  </p>
                </div>
              </div>
            ) : visibleHistory.length === 0 ? (
              <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-paper/40 px-6 py-8 text-center">
                <SearchX className="size-5 text-ink-muted" aria-hidden="true" />
                <p className="text-[12px] text-ink-muted">
                  Ничего не найдено по «{historyQuery.trim()}»
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {visibleHistory.map((item) => (
                  <li key={item.id}>
                    <HistoryCard
                      item={item}
                      cloud={item.fromCloud === true}
                      onDownload={downloadItem}
                      onLoad={loadItem}
                      onDelete={deleteItem}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-end border-t border-line px-5 py-3 font-mono text-[10px] text-ink-muted sm:px-6">
            <span>БД: {dbLabel}</span>
          </div>
        </Card>
      </div>

      {/* Мобильная панель — появляется, когда основные действия ушли из вида */}
      {design && showSticky && (
        <div className="marker-sticky-bar fixed inset-x-3 bottom-3 z-30 rounded-[16px] border border-line bg-card/95 p-2 shadow-lg backdrop-blur-md print:hidden lg:hidden dark:bg-card/95">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 px-1">
              <div
                className="truncate text-[13px] font-medium text-ink"
                title={name}
              >
                {name}
              </div>
              <div className="font-mono text-[10px] text-signal">{id}</div>
            </div>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12px] font-semibold text-paper transition-colors hover:bg-ink/90"
            >
              <Download className="size-4" aria-hidden="true" />
              JPG
            </button>
            <button
              type="button"
              onClick={() => void handlePdf()}
              aria-label="Скачать PDF для печати"
              title="PDF для печати"
              className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-card text-ink-soft transition-colors hover:bg-paper hover:text-ink"
            >
              <FileDown className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => void handleShare()}
              aria-label="Поделиться ссылкой"
              title="Поделиться"
              className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-card text-ink-soft transition-colors hover:bg-paper hover:text-ink"
            >
              <Share2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Крупный просмотр метки */}
      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="max-w-[min(92vw,760px)] rounded-[20px] border-line bg-card p-4 shadow-soft sm:p-6">
          <DialogHeader className="sr-only">
            <DialogTitle>Метка крупно</DialogTitle>
            <DialogDescription>Увеличенный предпросмотр метки</DialogDescription>
          </DialogHeader>
          <div className="mx-auto w-full max-w-[640px] rounded-[16px] bg-mat p-4 sm:p-6">
            <div className="overflow-hidden bg-white p-2 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.55)] ring-1 ring-black/10">
              <canvas
                ref={drawZoom}
                className="block h-auto w-full"
                aria-label="Увеличенный предпросмотр метки"
              />
            </div>
          </div>
          <DialogFooter className="mt-2 sm:justify-center">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloadDisabled}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-ink px-6 text-[14px] font-semibold text-paper transition-colors hover:bg-ink/90 disabled:pointer-events-none disabled:opacity-40"
            >
              <Download className="size-4" aria-hidden="true" />
              Скачать JPG
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Скрытая подсказка для скринридеров о назначении меток */}
      <p className="sr-only">
        Метки-трекеры для AR: камера различает узор метки и привязывает к ней
        трёхмерную модель автомобиля. У каждой метки свой уникальный узор.
      </p>
    </>
  );
}
