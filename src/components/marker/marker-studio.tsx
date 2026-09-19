"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToastAction } from "@/components/ui/toast";
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
  type MarkerDesign,
} from "@/lib/marker";
import { Download, History, Printer, Shapes, Trash2 } from "lucide-react";

const HISTORY_KEY = "ar-marker-studio:history:v2";
const EXPORT_SIZE = 2048;

/** Задание на печать: одна метка или лист со всеми метками из истории */
interface PrintJob {
  /** data-URL картинок меток */
  images: string[];
  /** Понятные подписи (названия) — для alt */
  labels: string[];
  /** Физическая ширина одной метки на бумаге, см */
  sizeCm: number;
  /** true — лист A4 со всеми метками сеткой 2 колонки */
  batch: boolean;
}

function signature(it: MarkerConfig): string {
  // ID и есть идентичность метки: «Молния» и «молния» — один и тот же узор
  return it.id;
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
  const [printJob, setPrintJob] = useState<PrintJob | null>(null);
  const [printLoaded, setPrintLoaded] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);

  const previewRef = useRef<HTMLCanvasElement>(null);

  /* ID выводится из названия: разное название — другой узор,
     то же название — та же метка (перепечатка не ломает привязку) */
  const id = useMemo(() => deriveId(name), [name]);
  const design = useMemo(() => (id ? createMarkerDesign(id) : null), [id]);

  /* Перерисовка предпросмотра после загрузки шрифтов */
  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts) return;
    fonts.ready
      .then(() => setFontsReady(true))
      .catch(() => undefined);
  }, []);

  /* Печать стартует, только когда все картинки задания декодированы */
  useEffect(() => {
    if (!printJob || printLoaded < printJob.images.length) return;
    const t = window.setTimeout(() => window.print(), 150);
    return () => window.clearTimeout(t);
  }, [printJob, printLoaded]);

  /* Страховка: если картинка не декодируется — печатаем через 2.5 с что есть */
  useEffect(() => {
    if (!printJob || printLoaded >= printJob.images.length) return;
    const total = printJob.images.length;
    const t = window.setTimeout(() => setPrintLoaded(total), 2500);
    return () => window.clearTimeout(t);
  }, [printJob, printLoaded]);

  /* После закрытия диалога печати освобождаем память (data-URL) */
  useEffect(() => {
    if (!printJob) return;
    const cleanup = (): void => {
      setPrintJob(null);
      setPrintLoaded(0);
    };
    window.addEventListener("afterprint", cleanup);
    return () => window.removeEventListener("afterprint", cleanup);
  }, [printJob]);

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
        duration: 3000,
      });
    } catch {
      toast({ title: "Не удалось создать PNG", variant: "destructive", duration: 3500 });
    }
  };

  const handlePrint = (): void => {
    if (!name.trim() || !design) {
      toast({
        title: "Введите название",
        description: "Оно напечатается над меткой и задаст уникальный узор.",
        variant: "destructive",
        duration: 3500,
      });
      return;
    }
    const url = renderMarkerDataUrl(design, { name, id, size: 1600, dpr: 1 });
    setPrintLoaded(0);
    setPrintJob({ images: [url], labels: [name.trim()], sizeCm: printSizeCm, batch: false });
  };

  /** Лист A4 со всеми метками из истории — сетка 2 колонки */
  const handlePrintAll = (): void => {
    if (history.length === 0) return;
    const jobs = history
      .map((it) => ({ it, design: createMarkerDesign(it.id) }))
      .filter((j): j is { it: HistoryItem; design: MarkerDesign } => j.design !== null);
    setPrintJob({
      images: jobs.map((j) =>
        renderMarkerDataUrl(j.design, { name: j.it.name, id: j.it.id, size: 1100, dpr: 1 })
      ),
      labels: jobs.map((j) => j.it.name),
      sizeCm: 8.5,
      batch: true,
    });
    setPrintLoaded(0);
  };

  const loadItem = (item: HistoryItem): void => {
    setName(item.name);
    toast({ title: "Метка загружена", description: `«${item.name}»`, duration: 2500 });
  };

  const downloadItem = async (item: HistoryItem): Promise<void> => {
    try {
      const itemDesign = createMarkerDesign(item.id);
      if (!itemDesign) throw new Error("Пустой ID метки");
      const blob = await exportMarkerPng(itemDesign, { name: item.name, id: item.id, size: EXPORT_SIZE, dpr: 1 });
      saveBlob(blob, markerFileName(item.name, item.id));
      toast({ title: "PNG сохранён", description: `Метка «${item.name}».`, duration: 2500 });
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

  const markImgLoaded = (): void => setPrintLoaded((n) => n + 1);

  const printSheet = printJob
    ? createPortal(
        printJob.batch ? (
          /* Лист всех меток: обычный поток — многостраничная печать работает сама */
          <div className="hidden bg-white print:block">
            <div className="mx-auto grid w-fit grid-cols-2 gap-x-[1cm] gap-y-[1cm] py-[0.5cm]">
              {printJob.images.map((url, i) => (
                <figure key={i} className="m-0 break-inside-avoid">
                  <img
                    src={url}
                    alt={`Метка ${printJob.labels[i]} для печати`}
                    style={{ width: `${printJob.sizeCm}cm`, height: "auto" }}
                    onLoad={markImgLoaded}
                    onError={markImgLoaded}
                  />
                </figure>
              ))}
            </div>
          </div>
        ) : (
          <div className="fixed inset-0 z-[100] hidden items-center justify-center bg-white print:flex">
            <img
              src={printJob.images[0]}
              alt={`Метка ${printJob.labels[0]} для печати`}
              style={{ width: `${printJob.sizeCm}cm`, height: "auto" }}
              onLoad={markImgLoaded}
              onError={markImgLoaded}
            />
          </div>
        ),
        document.body
      )
    : null;

  const downloadDisabled = !name.trim();

  return (
    <>
      {printSheet}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(320px,400px)_1fr]">
        {/* Панель метки */}
        <Card className="border-white/10 bg-neutral-900/60 backdrop-blur">
          <CardContent className="space-y-5 pt-6">
            {/* Название — единственный ввод: задаёт и подпись, и уникальный узор */}
            <div className="space-y-2">
              <Label htmlFor="marker-name" className="text-neutral-200">
                Название метки
              </Label>
              <Input
                id="marker-name"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleDownload();
                }}
                placeholder="Например: Красная спортивная"
                className="h-12 border-white/10 bg-neutral-950/70 text-neutral-100 placeholder:text-neutral-600 focus-visible:ring-amber-500/40"
              />
            </div>

            {/* Действия */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                onClick={handleDownload}
                disabled={downloadDisabled}
                className="h-12 flex-1 bg-amber-500 text-base font-semibold text-neutral-950 shadow-lg shadow-amber-500/20 hover:bg-amber-400 disabled:pointer-events-none disabled:opacity-40"
              >
                <Download className="size-5" aria-hidden="true" />
                Скачать PNG
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handlePrint}
                disabled={downloadDisabled}
                className="h-12 border-white/15 bg-transparent px-5 text-neutral-200 hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-40"
              >
                <Printer className="size-5" aria-hidden="true" />
                Печать
              </Button>
            </div>

            {/* Размер печати */}
            <div className="space-y-2">
              <Label htmlFor="marker-print-size" className="text-neutral-200">
                Размер при печати
              </Label>
              <Select value={String(printSizeCm)} onValueChange={(v) => setPrintSizeCm(Number(v))}>
                <SelectTrigger
                  id="marker-print-size"
                  className="h-11 w-full border-white/10 bg-neutral-950/70 text-neutral-100 focus-visible:ring-amber-500/40"
                  aria-label="Размер при печати"
                >
                  <SelectValue placeholder="Размер метки" />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-neutral-900 text-neutral-100">
                  <SelectItem value="10">10 см</SelectItem>
                  <SelectItem value="13">13 см</SelectItem>
                  <SelectItem value="16">16 см</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Предпросмотр */}
        <div className="lg:sticky lg:top-24">
          <Card className="border-white/10 bg-neutral-900/60 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-lg text-neutral-100">Предпросмотр</CardTitle>
              <CardAction>
                <span className="font-mono text-xs tracking-wider text-amber-400/90">
                  {id || "—"}
                </span>
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="mx-auto max-w-[440px] overflow-hidden rounded-xl bg-white shadow-2xl shadow-black/50 ring-1 ring-white/10">
                {design ? (
                  <canvas
                    ref={previewRef}
                    className="block h-auto w-full"
                    aria-label="Предпросмотр метки"
                  />
                ) : (
                  <div className="grid aspect-square place-items-center px-6 text-center text-sm text-neutral-600">
                    Введите название метки
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* История */}
      <section className="mt-10" aria-labelledby="history-heading">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
          <div className="flex items-center gap-2.5">
            <History className="size-4 text-amber-400" aria-hidden="true" />
            <h2 id="history-heading" className="text-xl font-semibold">
              История меток
            </h2>
            <Badge variant="secondary" className="bg-white/10 text-neutral-300">
              {history.length}
            </Badge>
          </div>
          {history.length > 0 && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrintAll}
                title="Распечатать лист со всеми метками"
                className="text-neutral-300 hover:bg-white/10 hover:text-white"
              >
                <Printer className="size-4" aria-hidden="true" />
                Печать всех
              </Button>
              <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-neutral-400 hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    Очистить
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-white/10 bg-neutral-900 text-neutral-100">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-neutral-100">
                      Очистить историю?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-neutral-400">
                      Все сохранённые метки ({history.length}) пропадут из списка.
                      Скачанные PNG-файлы это не затронет.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-white/10 bg-transparent text-neutral-300 hover:bg-white/10 hover:text-white">
                      Отмена
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={clearHistory}
                      className="bg-red-500 text-white hover:bg-red-400"
                    >
                      Очистить
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>

        {history.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-neutral-900/30 px-6 py-8 text-center">
            <Shapes className="mx-auto size-8 text-neutral-600" aria-hidden="true" />
            <p className="mt-3 text-sm text-neutral-400">
              Скачайте первую метку — она появится здесь.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {history.map((item) => (
              <HistoryCard
                key={item.ts}
                item={item}
                onDownload={downloadItem}
                onLoad={loadItem}
                onDelete={deleteItem}
              />
            ))}
          </div>
        )}
      </section>

      {/* Скрытая подсказка для скринридеров о назначении меток */}
      <p className="sr-only">
        Метки-трекеры для AR: камера различает узор метки и привязывает к ней
        трёхмерную модель автомобиля. У каждой метки свой уникальный узор.
      </p>
    </>
  );
}
