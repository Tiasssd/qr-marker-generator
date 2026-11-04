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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  markerFileName,
  PATTERN_CAPACITY,
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
import { Copy, Download, FileDown, History, Maximize2, Search, SearchX, Shapes, Share2, Trash2, TriangleAlert, Type, X, Cloud, CloudOff } from "lucide-react";
import {
  clearCloudMarkers,
  cloudEnabled,
  deleteCloudMarker,
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

/* Декодирование data-URL в Image — для пропорций при раскладке на листе A4 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось декодировать картинку метки"));
    img.src = url;
  });
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
  const [fontsReady, setFontsReady] = useState(false);
  const [cloud, setCloud] = useState<CloudState>(() => ({
    status: CLOUD_ON ? "syncing" : "off",
    items: [],
  }));

  const previewRef = useRef<HTMLCanvasElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const zoomRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<HistoryItem[]>([]);
  const cloudReadyRef = useRef(false);
  const [zoomOpen, setZoomOpen] = useState(false);

  /* ID выводится из названия: разное название — другой узор,
     то же название — та же метка (перепечатка не ломает привязку) */
  const id = useMemo(() => deriveId(name), [name]);
  const design = useMemo(() => (id ? createMarkerDesign(id) : null), [id]);

  /* Живой поиск по истории: считаем один раз на каждое изменение фильтра */
  const filteredHistory = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) return history;
    return history.filter((it) => it.name.toLowerCase().includes(q));
  }, [history, historyQuery]);

  /* Облачные метки, которых нет в локальной истории: узор восстановится
     из названия — храним только его. Показываем с бейджем «Облако». */
  const cloudOnlyItems = useMemo<HistoryItem[]>(() => {
    if (cloud.status !== "on") return [];
    const localNames = new Set(history.map((it) => normalizeName(it.name)));
    return cloud.items
      .filter((c) => !localNames.has(normalizeName(c.name)))
      .map(fromCloudItem);
  }, [cloud, history]);

  /* Поиск распространяется и на облачные метки */
  const filteredCloud = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) return cloudOnlyItems;
    return cloudOnlyItems.filter((it) => it.name.toLowerCase().includes(q));
  }, [cloudOnlyItems, historyQuery]);

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

      setCloud({ status: migrationFailed ? "error" : "on", items });
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
          setCloud({ status: "on", items });
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
    } catch {
      setCloud((prev) => ({ ...prev, status: "error" }));
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
    (config: MarkerConfig, cells?: readonly number[]): void => {
      const cleanName = config.name.trim().replace(/\s+/g, " ");
      if (!cleanName || !config.id) return;

      const patternSource =
        cells && cells.length > 0
          ? designFromCells(cells)
          : createMarkerDesign(config.id);
      const pattern = patternSource ? [...patternSource.cells] : [];

      const prev = historyRef.current;
      const existing = prev.find((it) => it.id === config.id);
      const createdAt = existing?.createdAt ?? Date.now();
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
          .catch(() => {
            setCloud((current) => ({ ...current, status: "error" }));
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
          .catch(() => {
            setCloud((current) => ({ ...current, status: "error" }));
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

  /* Липкая мобильная панель резервирует место внизу страницы (body padding),
     чтобы подвал не оказывался под ней; на десктопе и печати — без резерва */
  useEffect(() => {
    if (!design) return;
    const mq = window.matchMedia("(max-width: 1023px)");
    const apply = (): void => {
      const bar = document.querySelector<HTMLElement>(".marker-sticky-bar");
      /* плавающая капсула с отступом снизу — берём высоту + зазор */
      document.body.style.paddingBottom =
        mq.matches && bar ? `${bar.offsetHeight + 20}px` : "";
    };
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      document.body.style.paddingBottom = "";
    };
  }, [design]);

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
      const w = printSizeCm * 10;
      const h = w * (img.naturalHeight / img.naturalWidth);
      pdf.addImage(url, "JPEG", (210 - w) / 2, (297 - h) / 2, w, h);
      pdf.setProperties({ title: `AR-marker ${id}` });
      saveBlob(pdf.output("blob"), markerFileName(name, id, "pdf"));
      rememberMarker({ name, id }, [...design.cells]);
      toast({
        title: "PDF для печати сохранён",
        description: `«${name.trim()}» — ${printSizeCm} см на листе A4, с названием.`,
        variant: "success",
        duration: 3500,
      });
    } catch {
      toast({ title: "Не удалось создать PDF", variant: "destructive", duration: 3500 });
    }
  };

  /** PDF-лист A4 со всеми метками (локальные + облачные) — сетка 2 колонки по 8.5 см */
  const handlePdfAll = (): void => {
    if (history.length === 0 && cloudOnlyItems.length === 0) return;
    void (async () => {
      try {
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
        const w = 85; // 8.5 см — 4 метки на страницу A4
        const margin = 12;
        const gapY = 14;
        const xs = [margin, 210 - margin - w];
        let col = 0;
        let y = margin;
        let placed = 0;
        const all = [...history, ...cloudOnlyItems];
        for (const it of all) {
          const itemDesign =
            designFromCells(it.cells ?? []) ?? createMarkerDesign(it.id);
          if (!itemDesign) continue;
          const url = renderMarkerJpegDataUrl(itemDesign, {
            name: it.name,
            id: it.id,
            size: 1100,
            dpr: 1,
          });
          const img = await loadImage(url);
          const h = w * (img.naturalHeight / img.naturalWidth);
          /* не влезла по высоте — в соседнюю колонку, дальше на новый лист */
          if (y + h > 297 - margin) {
            if (col === 0) {
              col = 1;
              y = margin;
            } else {
              pdf.addPage();
              col = 0;
              y = margin;
            }
          }
          pdf.addImage(url, "JPEG", xs[col], y, w, h);
          y += h + gapY;
          placed++;
        }
        if (placed > 0) {
          pdf.setProperties({ title: "AR markers sheet" });
          saveBlob(pdf.output("blob"), markerFileName("Лист меток", "", "pdf"));
          toast({
            title: "PDF со всеми метками сохранён",
            description: `${placed} шт. по 8.5 см, лист A4.`,
            variant: "success",
            duration: 3000,
          });
        }
      } catch {
        toast({ title: "Не удалось создать PDF", variant: "destructive", duration: 3500 });
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
      rememberMarker({ name: item.name, id: item.id }, [...itemDesign.cells]);
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
        .catch(() => setCloud((current) => ({ ...current, status: "error" })));
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

  return (
    <>
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(340px,420px)_1fr] lg:items-start">
        {/* Панель метки (тянется на высоту своей строки — без щелей под карточкой) */}
        <Card className="anim-rise rounded-[28px] border-stone-200/80 bg-white shadow-soft lg:col-start-1 lg:row-start-1 lg:h-full dark:border-stone-800 dark:bg-stone-900">
          <CardContent className="space-y-6">
            {/* Название — единственный ввод: задаёт и подпись, и уникальный узор */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="marker-name" className="text-sm font-medium text-stone-700 dark:text-stone-300">
                  Название метки
                </Label>
                {/* Счётчик виден только у самого лимита — не захламляет обычный ввод */}
                {name.length >= 45 && (
                  <span
                    aria-live="polite"
                    className={`font-mono text-xs tabular-nums ${
                      name.length >= 58 ? "text-orange-600" : "text-stone-400"
                    }`}
                  >
                    {name.length} / 60
                  </span>
                )}
              </div>
              <div className="relative">
                <Input
                  id="marker-name"
                  ref={nameInputRef}
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleDownload();
                  }}
                  placeholder="Например: Красная спортивная"
                  className="h-14 rounded-2xl border-stone-200 bg-stone-50/80 pr-12 text-[15px] text-stone-900 caret-orange-600 placeholder:text-stone-400 focus-visible:border-stone-300 focus-visible:ring-stone-400/25 dark:border-stone-700 dark:bg-stone-800/60 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus-visible:border-stone-600 dark:focus-visible:ring-stone-500/30"
                />
                {name.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setName("");
                      nameInputRef.current?.focus();
                    }}
                    aria-label="Очистить название"
                    className="absolute inset-y-0 right-3 my-auto grid size-7 place-items-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300/50 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300 dark:focus-visible:ring-stone-600/50"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                )}
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Название печатается над меткой и задаёт её уникальный узор
              </p>
              {/* Коллизия узоров: разные названия дали один узор — камера
                  будет путать метки, предлагаем сменить название */}
              {collisionWith && (
                <p
                  role="alert"
                  className="flex items-start gap-1.5 rounded-2xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                >
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  Узор совпал с меткой «{collisionWith}» — камера будет путать их. Выберите другое название.
                </p>
              )}
            </div>

            {/* Действия */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                onClick={handleDownload}
                disabled={downloadDisabled}
                className="h-12 flex-1 rounded-full bg-stone-900 text-[15px] font-semibold text-white shadow-soft-sm transition-all hover:bg-stone-700 hover:shadow-soft active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 disabled:active:scale-100 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white dark:hover:shadow-soft"
              >
                <Download className="size-5" aria-hidden="true" />
                Скачать JPG
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handlePdf()}
                disabled={downloadDisabled}
                title="Скачать PDF для печати: лист A4, метка с названием"
                className="h-12 rounded-full border-transparent bg-stone-100 px-5 text-[15px] font-medium text-stone-700 transition-all hover:bg-stone-200 hover:text-stone-900 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 disabled:active:scale-100 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700 dark:hover:text-stone-100"
              >
                <FileDown className="size-5" aria-hidden="true" />
                PDF
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleShare()}
                disabled={downloadDisabled}
                title="Скопировать ссылку: метка откроется готовой"
                className="h-12 rounded-full border-transparent bg-stone-100 px-5 text-[15px] font-medium text-stone-700 transition-all hover:bg-stone-200 hover:text-stone-900 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 disabled:active:scale-100 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700 dark:hover:text-stone-100"
              >
                <Share2 className="size-5" aria-hidden="true" />
                Поделиться
              </Button>
            </div>

            {/* Назначение форматов — чтобы никто не перепутал */}
            <p className="rounded-2xl bg-stone-50 px-3 py-2 text-[11px] leading-relaxed text-stone-500 dark:bg-stone-800/50 dark:text-stone-400">
              <span className="font-medium text-stone-700 dark:text-stone-300">JPG</span> — без названия,
              2048×2048, для загрузки в Vuforia.{" "}
              <span className="font-medium text-stone-700 dark:text-stone-300">PDF</span> — с названием,
              для печати на A4.
            </p>

            {/* Размер печати */}
            <div className="space-y-2">
              <Label htmlFor="marker-print-size" className="text-sm font-medium text-stone-700 dark:text-stone-300">
                Размер при печати
              </Label>
              <ToggleGroup
                id="marker-print-size"
                type="single"
                value={String(printSizeCm)}
                onValueChange={(v) => {
                  if (v) setPrintSizeCm(Number(v));
                }}
                aria-label="Размер при печати"
                className="h-12 w-full gap-1 rounded-full border border-stone-200/80 bg-stone-100/70 p-1 shadow-none dark:border-stone-700/80 dark:bg-stone-800/70"
              >
                {[10, 13, 16].map((cm) => (
                  <ToggleGroupItem
                    key={cm}
                    value={String(cm)}
                    aria-label={`${cm} сантиметров`}
                    className="h-10 flex-1 rounded-full border-0 bg-transparent px-2 text-sm font-medium text-stone-500 shadow-none transition-colors hover:bg-transparent hover:text-stone-700 data-[state=on]:bg-white data-[state=on]:text-stone-900 data-[state=on]:shadow-soft-sm data-[state=on]:hover:bg-white dark:text-stone-400 dark:hover:text-stone-200 dark:data-[state=on]:bg-stone-200 dark:data-[state=on]:text-stone-900 dark:data-[state=on]:hover:bg-stone-200"
                  >
                    {cm} см
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </CardContent>
        </Card>

        {/* Предпросмотр: правая колонка на обе строки; при готовой метке
            прилипает при прокрутке истории, в пустом — тянется и центрирует онбординг */}
        <div
          className={`anim-rise anim-rise-delay-1 lg:col-start-2 lg:row-span-2 lg:row-start-1 ${
            design ? "lg:sticky lg:top-24" : "lg:self-stretch"
          }`}
        >
          <Card
            className={`rounded-[28px] border-stone-200/80 bg-white shadow-soft${
              design ? "" : " lg:h-full"
            } dark:border-stone-800 dark:bg-stone-900`}
          >
            <CardHeader>
              <CardTitle className="text-[17px] font-semibold tracking-tight text-stone-900 dark:text-stone-100">Предпросмотр</CardTitle>
              <CardAction>
                {id ? (
                  <button
                    type="button"
                    onClick={() => void copyId(id)}
                    title="Скопировать ID"
                    aria-label={`Скопировать ID ${id}`}
                    className="-mx-1 inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-xs tracking-wider text-orange-700 transition-colors hover:bg-orange-50 hover:text-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/60 dark:text-orange-400 dark:hover:bg-orange-950/50 dark:hover:text-orange-300 dark:focus-visible:ring-orange-500/40"
                  >
                    {id}
                    <Copy className="size-3.5 opacity-60" aria-hidden="true" />
                  </button>
                ) : (
                  <span className="font-mono text-xs tracking-wider text-stone-400 dark:text-stone-500">—</span>
                )}
              </CardAction>
            </CardHeader>
            <CardContent className={design ? "" : "flex flex-1 flex-col"}>
              {design ? (
                <div className="mx-auto max-w-[480px] rounded-[24px] bg-stone-100/80 p-5 dark:bg-stone-800/60">
                  <button
                    type="button"
                    onClick={() => setZoomOpen(true)}
                    title="Открыть метку крупно"
                    aria-label="Открыть метку крупно"
                    className="anim-paper group/zoom relative mx-auto block w-full cursor-zoom-in overflow-hidden rounded-[16px] bg-white shadow-soft ring-1 ring-stone-200/90 transition-shadow duration-300 hover:shadow-soft-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 dark:ring-stone-700/90 dark:focus-visible:ring-orange-400"
                  >
                    <canvas
                      ref={previewRef}
                      className="block h-auto w-full"
                      aria-label="Предпросмотр метки"
                    />
                    {/* Подсказка зума: появляется при наведении */}
                    <span className="pointer-events-none absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-white/85 text-stone-700 opacity-0 shadow-soft-sm backdrop-blur-sm transition-opacity duration-200 group-hover/zoom:opacity-100 dark:bg-stone-900/85 dark:text-stone-200">
                      <Maximize2 className="size-4" aria-hidden="true" />
                    </span>
                  </button>
                </div>
              ) : (
                /* Пустое состояние: компактный онбординг из двух шагов —
                   вместо высокой пустой заглушки */
                <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center gap-4 rounded-[24px] border-2 border-dashed border-stone-300/80 bg-stone-100/60 p-5 sm:p-6 dark:border-stone-700/80 dark:bg-stone-800/50">
                  <p className="text-center text-xs font-medium text-stone-500 dark:text-stone-400">
                    Как это работает
                  </p>
                  <ol className="grid list-none gap-2.5 sm:grid-cols-2">
                    {[
                      {
                        icon: Type,
                        title: "Введите название",
                        text: "Узор метки уникален для каждого названия",
                      },
                      {
                        icon: Download,
                        title: "Скачайте и распечатайте",
                        text: "JPG для Vuforia или PDF для печати",
                      },
                    ].map((step) => (
                      <li
                        key={step.title}
                        className="flex items-start gap-3 rounded-2xl bg-white/80 px-4 py-4 dark:bg-stone-800/70"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                          <step.icon className="size-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium leading-snug text-stone-800 break-words dark:text-stone-200">
                            {step.title}
                          </span>
                          <span className="mt-1 block text-xs leading-snug text-stone-500 break-words dark:text-stone-400">
                            {step.text}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* История — третья ячейка грида: левая колонка под панелью.
            Страница собрана без пустот: карточка заполняет строку целиком,
            длинный список прокручивается внутри */}
        <Card className="anim-rise anim-rise-delay-2 flex flex-col gap-0 rounded-[28px] border-stone-200/80 bg-white py-0 shadow-soft lg:col-start-1 lg:row-start-2 lg:h-full dark:border-stone-800 dark:bg-stone-900">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-stone-100 px-5 py-4 dark:border-stone-800/80">
            <h2
              id="history-heading"
              className="flex min-w-0 items-center gap-2 text-[15px] font-semibold tracking-tight text-stone-900 dark:text-stone-100"
            >
              <History className="size-4 shrink-0 text-stone-400 dark:text-stone-500" aria-hidden="true" />
              История меток
              <Badge variant="secondary" className="bg-stone-100 text-stone-600 tabular-nums dark:bg-stone-800 dark:text-stone-300">
                {history.length + cloudOnlyItems.length}
              </Badge>
              {/* Статус синхронизации: локально / синхронизировано / ошибка */}
              <button
                type="button"
                onClick={() => {
                  if (cloud.status === "on" || cloud.status === "error" || cloud.status === "syncing") void refreshCloud();
                }}
                aria-live="polite"
                title={
                  cloud.status === "on"
                    ? `${cloud.items.length} меток в общей БД — обновить список`
                    : cloud.status === "error"
                      ? "Общая БД недоступна — попробовать снова"
                      : "Общая БД не подключена. История хранится в этом браузере (IndexedDB). Инструкция — HOSTING.md"
                }
                className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300/50 dark:focus-visible:ring-stone-600/50"
              >
                {cloud.status === "on" && (
                  <Cloud className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                )}
                {cloud.status === "syncing" && (
                  <Cloud className="size-3.5 animate-pulse text-stone-400 dark:text-stone-500" aria-hidden="true" />
                )}
                {(cloud.status === "off" || cloud.status === "error") && (
                  <CloudOff
                    className={`size-3.5 ${cloud.status === "error" ? "text-red-500" : "text-stone-400 dark:text-stone-500"}`}
                    aria-hidden="true"
                  />
                )}
                <span
                  className={
                    cloud.status === "on"
                      ? "text-emerald-700 dark:text-emerald-400"
                      : cloud.status === "error"
                        ? "text-red-600 dark:text-red-400"
                        : "text-stone-400 dark:text-stone-500"
                  }
                >
                  {cloud.status === "on"
                    ? "Общая БД"
                    : cloud.status === "syncing"
                      ? "Синхронизация…"
                      : cloud.status === "error"
                        ? "БД недоступна"
                        : "Локально"}
                </span>
              </button>
            </h2>
            {history.length + cloudOnlyItems.length > 0 && (
              <div className="ml-auto flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePdfAll}
                  title="Скачать лист A4 со всеми метками (8.5 см)"
                  className="rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-700 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                >
                  <FileDown className="size-4" aria-hidden="true" />
                  PDF всех
                </Button>
                <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full text-stone-500 hover:bg-red-50 hover:text-red-600 dark:text-stone-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Очистить
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="rounded-[24px] border-stone-200/80 bg-white text-stone-900 shadow-soft dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-stone-900 dark:text-stone-100">
                        {CLOUD_ON ? "Очистить общую БД?" : "Очистить историю?"}
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-stone-500 dark:text-stone-400">
                        {CLOUD_ON
                          ? `Все метки (${history.length + cloudOnlyItems.length}) удалятся из общей БД у всех пользователей. Скачанные JPG и PDF это не затронет.`
                          : `Все сохранённые метки (${history.length}) пропадут из списка. Скачанные JPG и PDF это не затронет.`}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="rounded-full border-transparent bg-stone-100 text-stone-700 hover:bg-stone-200 hover:text-stone-900 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700 dark:hover:text-stone-100">
                        Отмена
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={clearHistory}
                        className="rounded-full bg-red-600 text-white hover:bg-red-500"
                      >
                        Очистить
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>

          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
            {/* Пока общая БД не подключена — честно предупреждаем */}
            {!CLOUD_ON && (
              <p className="rounded-2xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                Локальный режим: метки видны только в этом браузере. Для общей работы
                подключите Supabase — инструкция в HOSTING.md.
              </p>
            )}

            {/* Поиск по названию: появляется, когда список реально длинный */}
            {history.length + cloudOnlyItems.length >= 6 && (
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-stone-400 dark:text-stone-500"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                  placeholder="Поиск по названию"
                  aria-label="Поиск по названию метки"
                  className="h-10 w-full rounded-full border border-stone-200 bg-stone-50/80 pl-9 pr-4 text-sm text-stone-900 placeholder:text-stone-400 caret-orange-600 focus-visible:border-stone-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300/50 dark:border-stone-700 dark:bg-stone-800/60 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus-visible:border-stone-600 dark:focus-visible:ring-stone-500/30"
                />
              </div>
            )}
            {dbLoading ? (
              /* Пока IndexedDB открывается, не показываем ложное «пусто» */
              <div className="flex min-h-[140px] flex-1 flex-col items-center justify-center gap-2 rounded-[20px] border border-dashed border-stone-200 bg-stone-50/60 px-4 py-6 text-center dark:border-stone-800 dark:bg-stone-800/40">
                <Shapes className="size-6 animate-pulse text-stone-300 dark:text-stone-600" aria-hidden="true" />
                <p className="max-w-[230px] text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                  Загружаем историю из браузерной БД…
                </p>
              </div>
            ) : history.length === 0 && cloudOnlyItems.length === 0 ? (
              /* Тихая центрированная подсказка вместо большой пустой коробки */
              <div className="flex min-h-[140px] flex-1 flex-col items-center justify-center gap-2 rounded-[20px] border border-dashed border-stone-200 bg-stone-50/60 px-4 py-6 text-center dark:border-stone-800 dark:bg-stone-800/40">
                <Shapes className="size-6 text-stone-300 dark:text-stone-600" aria-hidden="true" />
                <p className="max-w-[230px] text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                  Скачайте первую метку — она появится здесь
                </p>
              </div>
            ) : filteredHistory.length === 0 && filteredCloud.length === 0 ? (
              /* Запрос ничего не нашёл — тихое состояние, без коробки-громилы */
              <div className="flex min-h-[140px] flex-1 flex-col items-center justify-center gap-2 rounded-[20px] border border-dashed border-stone-200 bg-stone-50/60 px-4 py-6 text-center dark:border-stone-800 dark:bg-stone-800/40">
                <SearchX className="size-6 text-stone-300 dark:text-stone-600" aria-hidden="true" />
                <p className="max-w-[230px] text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                  Ничего не найдено по «{historyQuery.trim()}»
                </p>
              </div>
            ) : (
              <ul className="flex list-none flex-col gap-3 lg:max-h-[65vh] lg:overflow-y-auto lg:overscroll-contain lg:pr-1.5">
                {filteredHistory.map((item, i) => (
                  <li key={item.id}>
                    <HistoryCard
                      item={item}
                      index={i}
                      onDownload={downloadItem}
                      onLoad={loadItem}
                      onDelete={deleteItem}
                    />
                  </li>
                ))}
                {filteredCloud.map((item, i) => (
                  <li key={`cloud-${item.id}`}>
                    <HistoryCard
                      item={item}
                      index={filteredHistory.length + i}
                      cloud
                      onDownload={downloadItem}
                      onLoad={loadItem}
                      onDelete={deleteItem}
                    />
                  </li>
                ))}
              </ul>
            )}

            {/* Счётчик уникальных узоров: ёмкость алфавита 5×5 (полный перебор)
                и сколько мест уже занято — локальная история + облако */}
            <div
              className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-stone-100 pt-3 text-[11px] text-stone-400 tabular-nums dark:border-stone-800/80 dark:text-stone-500"
              title="Узор метки — матрица 5×5 с правилами плотности, серий и поворотной асимметрии. Ёмкость всех допустимых узоров подсчитана полным перебором (scripts/count_patterns.ts). Занято — уникальные названия в истории и облаке."
            >
              <span>
                Уникальных узоров:{" "}
                <span className="font-medium text-stone-500 dark:text-stone-400">
                  {PATTERN_CAPACITY.toLocaleString("ru-RU")}
                </span>
              </span>
              <span aria-live="polite">Занято: {history.length + cloudOnlyItems.length}</span>
              <span
                title={
                  CLOUD_ON
                    ? "Общая БД — Supabase. IndexedDB/localStorage работают как локальный кэш и офлайн-копия"
                    : "Где сейчас хранится история: IndexedDB — основная БД браузера, localStorage — запасное хранилище, память — крайний случай"
                }
                className="text-stone-300 dark:text-stone-600"
              >
                БД:{" "}
                {dbLoading
                  ? "…"
                  : CLOUD_ON
                    ? cloud.status === "on"
                      ? "Supabase"
                      : cloud.status === "syncing"
                        ? "подключение…"
                        : "кэш"
                    : storageLabel(dbMode)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Мобильная липкая панель: скачать, не прокручивая наверх */}
      {design && (
        <div className="marker-sticky-bar fixed inset-x-3 bottom-3 z-30 rounded-[24px] border border-stone-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-soft-lg backdrop-blur-md print:hidden lg:hidden dark:border-stone-700/80 dark:bg-stone-900/95">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-stone-900 dark:text-stone-100" title={name}>
                {name}
              </div>
              <div className="font-mono text-xs tracking-wider text-orange-700 dark:text-orange-400">{id}</div>
            </div>
            <Button
              type="button"
              onClick={handleDownload}
              className="h-11 shrink-0 rounded-full bg-stone-900 px-5 font-semibold text-white shadow-soft-sm transition-all hover:bg-stone-700 active:scale-[0.98] dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
            >
              <Download className="size-5" aria-hidden="true" />
              Скачать
            </Button>
          </div>
        </div>
      )}

      {/* Крупный просмотр метки */}
      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="max-w-[min(92vw,720px)] rounded-[28px] border-stone-200/80 bg-white p-4 shadow-soft sm:p-6 dark:border-stone-800 dark:bg-stone-900">
          <DialogHeader className="sr-only">
            <DialogTitle>Метка крупно</DialogTitle>
            <DialogDescription>Увеличенный предпросмотр метки</DialogDescription>
          </DialogHeader>
          <div className="mx-auto w-full max-w-[640px] rounded-[24px] bg-stone-100/80 p-4 sm:p-5 dark:bg-stone-800/60">
            <div className="overflow-hidden rounded-[16px] bg-white shadow-soft ring-1 ring-stone-200/90 dark:ring-stone-700/90">
              <canvas
                ref={drawZoom}
                className="block h-auto w-full"
                aria-label="Увеличенный предпросмотр метки"
              />
            </div>
          </div>
          <DialogFooter className="mt-1 sm:justify-center">
            <Button
              type="button"
              onClick={handleDownload}
              disabled={downloadDisabled}
              className="h-11 rounded-full bg-stone-900 px-6 text-[15px] font-semibold text-white shadow-soft-sm transition-all hover:bg-stone-700 hover:shadow-soft active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 disabled:active:scale-100 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
            >
              <Download className="size-5" aria-hidden="true" />
              Скачать JPG
            </Button>
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
