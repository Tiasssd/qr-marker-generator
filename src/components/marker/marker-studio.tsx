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
  deriveId,
  drawMarker,
  exportMarkerPng,
  markerFileName,
  renderMarkerDataUrl,
  type MarkerConfig,
} from "@/lib/marker";
import { Copy, Download, FileDown, History, Maximize2, Search, SearchX, Shapes, Trash2, Type, X } from "lucide-react";

const HISTORY_KEY = "ar-marker-studio:history:v2";
const EXPORT_SIZE = 2048;

function signature(it: MarkerConfig): string {
  // ID и есть идентичность метки: «Молния» и «молния» — один и тот же узор
  return it.id;
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

/* История: v2 (ID выводится из названия) с миграцией из v1 */
function loadHistory(): HistoryItem[] {
  try {
    const raw =
      window.localStorage.getItem(HISTORY_KEY) ??
      window.localStorage.getItem("ar-marker-studio:history:v1");
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const items = parsed
      .filter(
        (it): it is HistoryItem =>
          Boolean(it) &&
          typeof it === "object" &&
          typeof (it as HistoryItem).name === "string"
      )
      // Название — теперь идентичность метки: ID пересчитываем из него
      .map((it) => {
        const name = it.name.trim().replace(/\s+/g, " ");
        return { name, id: deriveId(name), ts: typeof it.ts === "number" ? it.ts : Date.now() };
      })
      .filter((it) => it.name.length > 0);
    return items.slice(0, 40);
  } catch {
    return [];
  }
}

export function MarkerStudio() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [printSizeCm, setPrintSizeCm] = useState(16);
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());
  const [historyQuery, setHistoryQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);

  const previewRef = useRef<HTMLCanvasElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const zoomRef = useRef<HTMLCanvasElement>(null);
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

  /* Сохранение истории между сессиями */
  useEffect(() => {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // Хранилище недоступно — история живёт только в памяти сессии
    }
  }, [history]);

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

  /* Заголовок вкладки отражает текущую метку */
  useEffect(() => {
    const trimmed = name.trim();
    document.title = trimmed
      ? `Метка «${trimmed}» — Генератор AR-меток`
      : "Генератор AR-меток — трекер-метки для 3D-машинок";
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

  const addToHistory = (config: MarkerConfig): void => {
    setHistory((prev) => {
      const sig = signature(config);
      const rest = prev.filter((it) => signature(it) !== sig);
      // ts всегда больше предыдущего — уникальные ключи и корректное удаление
      const ts = Math.max(Date.now(), (rest[0]?.ts ?? 0) + 1);
      return [{ ...config, ts }, ...rest].slice(0, 40);
    });
  };

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
      const blob = await exportMarkerPng(design, { name, id, size: EXPORT_SIZE, dpr: 1 });
      saveBlob(blob, markerFileName(name, id));
      addToHistory({ name, id });
      toast({
        title: "PNG сохранён",
        description: `Метка «${name.trim()}» — 2048 px по ширине.`,
        variant: "success",
        duration: 3000,
      });
    } catch {
      toast({ title: "Не удалось создать PNG", variant: "destructive", duration: 3500 });
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
      const url = renderMarkerDataUrl(design, { name, id, size: EXPORT_SIZE, dpr: 1 });
      const img = await loadImage(url);
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
      const w = printSizeCm * 10;
      const h = w * (img.naturalHeight / img.naturalWidth);
      pdf.addImage(url, "PNG", (210 - w) / 2, (297 - h) / 2, w, h);
      pdf.setProperties({ title: `AR-marker ${id}` });
      saveBlob(pdf.output("blob"), markerFileName(name, id, "pdf"));
      toast({
        title: "PDF сохранён",
        description: `Метка «${name.trim()}» — ${printSizeCm} см на листе A4.`,
        variant: "success",
        duration: 3000,
      });
    } catch {
      toast({ title: "Не удалось создать PDF", variant: "destructive", duration: 3500 });
    }
  };

  /** PDF-лист A4 со всеми метками из истории — сетка 2 колонки по 8.5 см */
  const handlePdfAll = (): void => {
    if (history.length === 0) return;
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
        for (const it of history) {
          const itemDesign = createMarkerDesign(it.id);
          if (!itemDesign) continue;
          const url = renderMarkerDataUrl(itemDesign, {
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
          pdf.addImage(url, "PNG", xs[col], y, w, h);
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
      const itemDesign = createMarkerDesign(item.id);
      if (!itemDesign) throw new Error("Пустой ID метки");
      const blob = await exportMarkerPng(itemDesign, { name: item.name, id: item.id, size: EXPORT_SIZE, dpr: 1 });
      saveBlob(blob, markerFileName(item.name, item.id));
      toast({ title: "PNG сохранён", description: `Метка «${item.name}».`, variant: "success", duration: 2500 });
    } catch {
      toast({ title: "Не удалось создать PNG", variant: "destructive", duration: 3500 });
    }
  };

  const deleteItem = (item: HistoryItem): void => {
    setHistory((prev) => prev.filter((it) => it.ts !== item.ts));
    toast({
      title: "Метка удалена из истории",
      description: `«${item.name}»`,
      duration: 5000,
      action: (
        <ToastAction
          altText="Вернуть удалённую метку"
          onClick={() => setHistory((prev) => [item, ...prev])}
        >
          Вернуть
        </ToastAction>
      ),
    });
  };

  const clearHistory = (): void => {
    if (history.length === 0) return;
    setHistory([]);
    setConfirmClear(false);
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

  const downloadDisabled = !name.trim();

  return (
    <>
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(340px,420px)_1fr] lg:items-start">
        {/* Панель метки (тянется на высоту своей строки — без щелей под карточкой) */}
        <Card className="anim-rise rounded-[28px] border-stone-200/80 bg-white shadow-soft lg:col-start-1 lg:row-start-1 lg:h-full">
          <CardContent className="space-y-6">
            {/* Название — единственный ввод: задаёт и подпись, и уникальный узор */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="marker-name" className="text-sm font-medium text-stone-700">
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
                  className="h-14 rounded-2xl border-stone-200 bg-stone-50/80 pr-12 text-[15px] text-stone-900 caret-orange-600 placeholder:text-stone-400 focus-visible:border-stone-300 focus-visible:ring-stone-400/25"
                />
                {name.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setName("");
                      nameInputRef.current?.focus();
                    }}
                    aria-label="Очистить название"
                    className="absolute inset-y-0 right-3 my-auto grid size-7 place-items-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300/50"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                )}
              </div>
              <p className="text-xs text-stone-500">
                Название печатается над меткой и задаёт её уникальный узор
              </p>
            </div>

            {/* Действия */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                onClick={handleDownload}
                disabled={downloadDisabled}
                className="h-12 flex-1 rounded-full bg-stone-900 text-[15px] font-semibold text-white shadow-soft-sm transition-all hover:bg-stone-700 hover:shadow-soft active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 disabled:active:scale-100"
              >
                <Download className="size-5" aria-hidden="true" />
                Скачать PNG
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handlePdf()}
                disabled={downloadDisabled}
                title="Скачать PDF: лист A4 с точным размером метки"
                className="h-12 rounded-full border-transparent bg-stone-100 px-5 text-[15px] font-medium text-stone-700 transition-all hover:bg-stone-200 hover:text-stone-900 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 disabled:active:scale-100"
              >
                <FileDown className="size-5" aria-hidden="true" />
                PDF
              </Button>
            </div>

            {/* Размер печати */}
            <div className="space-y-2">
              <Label htmlFor="marker-print-size" className="text-sm font-medium text-stone-700">
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
                className="h-12 w-full gap-1 rounded-full border border-stone-200/80 bg-stone-100/70 p-1 shadow-none"
              >
                {[10, 13, 16].map((cm) => (
                  <ToggleGroupItem
                    key={cm}
                    value={String(cm)}
                    aria-label={`${cm} сантиметров`}
                    className="h-10 flex-1 rounded-full border-0 bg-transparent px-2 text-sm font-medium text-stone-500 shadow-none transition-colors hover:bg-transparent hover:text-stone-700 data-[state=on]:bg-white data-[state=on]:text-stone-900 data-[state=on]:shadow-soft-sm data-[state=on]:hover:bg-white"
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
            }`}
          >
            <CardHeader>
              <CardTitle className="text-[17px] font-semibold tracking-tight text-stone-900">Предпросмотр</CardTitle>
              <CardAction>
                {id ? (
                  <button
                    type="button"
                    onClick={() => void copyId(id)}
                    title="Скопировать ID"
                    aria-label={`Скопировать ID ${id}`}
                    className="-mx-1 inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-xs tracking-wider text-orange-700 transition-colors hover:bg-orange-50 hover:text-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/60"
                  >
                    {id}
                    <Copy className="size-3.5 opacity-60" aria-hidden="true" />
                  </button>
                ) : (
                  <span className="font-mono text-xs tracking-wider text-stone-400">—</span>
                )}
              </CardAction>
            </CardHeader>
            <CardContent className={design ? "" : "flex flex-1 flex-col"}>
              {design ? (
                <div className="mx-auto max-w-[480px] rounded-[24px] bg-stone-100/80 p-5">
                  <button
                    type="button"
                    onClick={() => setZoomOpen(true)}
                    title="Открыть метку крупно"
                    aria-label="Открыть метку крупно"
                    className="anim-paper group/zoom relative mx-auto block w-full cursor-zoom-in overflow-hidden rounded-[16px] bg-white shadow-soft ring-1 ring-stone-200/90 transition-shadow duration-300 hover:shadow-soft-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
                  >
                    <canvas
                      ref={previewRef}
                      className="block h-auto w-full"
                      aria-label="Предпросмотр метки"
                    />
                    {/* Подсказка зума: появляется при наведении */}
                    <span className="pointer-events-none absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-white/85 text-stone-700 opacity-0 shadow-soft-sm backdrop-blur-sm transition-opacity duration-200 group-hover/zoom:opacity-100">
                      <Maximize2 className="size-4" aria-hidden="true" />
                    </span>
                  </button>
                </div>
              ) : (
                /* Пустое состояние: компактный онбординг из двух шагов —
                   вместо высокой пустой заглушки */
                <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center gap-4 rounded-[24px] border-2 border-dashed border-stone-300/80 bg-stone-100/60 p-5 sm:p-6">
                  <p className="text-center text-xs font-medium text-stone-500">
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
                        text: "PNG или печать на белой бумаге",
                      },
                    ].map((step) => (
                      <li
                        key={step.title}
                        className="flex items-start gap-3 rounded-2xl bg-white/80 px-4 py-4"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-700">
                          <step.icon className="size-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium leading-snug text-stone-800 break-words">
                            {step.title}
                          </span>
                          <span className="mt-1 block text-xs leading-snug text-stone-500 break-words">
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
        <Card className="anim-rise anim-rise-delay-2 flex flex-col gap-0 rounded-[28px] border-stone-200/80 bg-white py-0 shadow-soft lg:col-start-1 lg:row-start-2 lg:h-full">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-stone-100 px-5 py-4">
            <h2
              id="history-heading"
              className="flex min-w-0 items-center gap-2 text-[15px] font-semibold tracking-tight text-stone-900"
            >
              <History className="size-4 shrink-0 text-stone-400" aria-hidden="true" />
              История меток
              <Badge variant="secondary" className="bg-stone-100 text-stone-600 tabular-nums">
                {history.length}
              </Badge>
            </h2>
            {history.length > 0 && (
              <div className="ml-auto flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePdfAll}
                  title="Скачать лист A4 со всеми метками (8.5 см)"
                  className="rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-700"
                >
                  <FileDown className="size-4" aria-hidden="true" />
                  PDF всех
                </Button>
                <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full text-stone-500 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Очистить
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="rounded-[24px] border-stone-200/80 bg-white text-stone-900 shadow-soft">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-stone-900">
                        Очистить историю?
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-stone-500">
                        Все сохранённые метки ({history.length}) пропадут из списка.
                        Скачанные PNG-файлы это не затронет.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="rounded-full border-transparent bg-stone-100 text-stone-700 hover:bg-stone-200 hover:text-stone-900">
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
            {/* Поиск по названию: появляется, когда список реально длинный */}
            {history.length >= 6 && (
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-stone-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                  placeholder="Поиск по названию"
                  aria-label="Поиск по названию метки"
                  className="h-10 w-full rounded-full border border-stone-200 bg-stone-50/80 pl-9 pr-4 text-sm text-stone-900 placeholder:text-stone-400 caret-orange-600 focus-visible:border-stone-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300/50"
                />
              </div>
            )}
            {history.length === 0 ? (
              /* Тихая центрированная подсказка вместо большой пустой коробки */
              <div className="flex min-h-[140px] flex-1 flex-col items-center justify-center gap-2 rounded-[20px] border border-dashed border-stone-200 bg-stone-50/60 px-4 py-6 text-center">
                <Shapes className="size-6 text-stone-300" aria-hidden="true" />
                <p className="max-w-[230px] text-xs leading-relaxed text-stone-500">
                  Скачайте первую метку — она появится здесь
                </p>
              </div>
            ) : filteredHistory.length === 0 ? (
              /* Запрос ничего не нашёл — тихое состояние, без коробки-громилы */
              <div className="flex min-h-[140px] flex-1 flex-col items-center justify-center gap-2 rounded-[20px] border border-dashed border-stone-200 bg-stone-50/60 px-4 py-6 text-center">
                <SearchX className="size-6 text-stone-300" aria-hidden="true" />
                <p className="max-w-[230px] text-xs leading-relaxed text-stone-500">
                  Ничего не найдено по «{historyQuery.trim()}»
                </p>
              </div>
            ) : (
              <ul className="flex list-none flex-col gap-3 lg:max-h-[65vh] lg:overflow-y-auto lg:overscroll-contain lg:pr-1.5">
                {filteredHistory.map((item, i) => (
                  <li key={item.ts}>
                    <HistoryCard
                      item={item}
                      index={i}
                      onDownload={downloadItem}
                      onLoad={loadItem}
                      onDelete={deleteItem}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Мобильная липкая панель: скачать, не прокручивая наверх */}
      {design && (
        <div className="marker-sticky-bar fixed inset-x-3 bottom-3 z-30 rounded-[24px] border border-stone-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-soft-lg backdrop-blur-md print:hidden lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-stone-900" title={name}>
                {name}
              </div>
              <div className="font-mono text-xs tracking-wider text-orange-700">{id}</div>
            </div>
            <Button
              type="button"
              onClick={handleDownload}
              className="h-11 shrink-0 rounded-full bg-stone-900 px-5 font-semibold text-white shadow-soft-sm transition-all hover:bg-stone-700 active:scale-[0.98]"
            >
              <Download className="size-5" aria-hidden="true" />
              Скачать
            </Button>
          </div>
        </div>
      )}

      {/* Крупный просмотр метки */}
      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="max-w-[min(92vw,720px)] rounded-[28px] border-stone-200/80 bg-white p-4 shadow-soft sm:p-6">
          <DialogHeader className="sr-only">
            <DialogTitle>Метка крупно</DialogTitle>
            <DialogDescription>Увеличенный предпросмотр метки</DialogDescription>
          </DialogHeader>
          <div className="mx-auto w-full max-w-[640px] rounded-[24px] bg-stone-100/80 p-4 sm:p-5">
            <div className="overflow-hidden rounded-[16px] bg-white shadow-soft ring-1 ring-stone-200/90">
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
              className="h-11 rounded-full bg-stone-900 px-6 text-[15px] font-semibold text-white shadow-soft-sm transition-all hover:bg-stone-700 hover:shadow-soft active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 disabled:active:scale-100"
            >
              <Download className="size-5" aria-hidden="true" />
              Скачать PNG
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
