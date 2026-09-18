"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
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
  CardDescription,
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
import { Switch } from "@/components/ui/switch";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { HistoryCard, type HistoryItem } from "@/components/marker/history-card";
import { StyleGlyph } from "@/components/marker/style-glyph";
import {
  createQrData,
  drawMarker,
  exportMarkerPng,
  generateId,
  markerFileName,
  renderMarkerDataUrl,
  type MarkerConfig,
  type MarkerStyle,
} from "@/lib/qr-marker";
import { cn } from "@/lib/utils";
import {
  Copy,
  Download,
  Frame,
  History,
  Lightbulb,
  Printer,
  QrCode,
  RefreshCw,
  Ruler,
  ShieldCheck,
  Trash2,
} from "lucide-react";

const HISTORY_KEY = "ar-marker-studio:history:v1";

const STYLE_OPTIONS: { value: MarkerStyle; title: string; hint: string }[] = [
  { value: "classic", title: "Строгий", hint: "максимальная надёжность" },
  { value: "rounded", title: "Скруглённый", hint: "стиль без потери чёткости" },
  { value: "dots", title: "Точки", hint: "декоративный, для света" },
];

/** Задание на печать: одна метка или лист со всеми метками из истории */
interface PrintJob {
  /** data-URL картинок меток */
  images: string[];
  /** Понятные подписи (название или ID) — для alt */
  labels: string[];
  /** Физическая ширина одной метки на бумаге, см */
  sizeCm: number;
  /** true — лист A4 со всеми метками сеткой 2 колонки */
  batch: boolean;
}

function signature(it: MarkerConfig): string {
  return `${it.id}|${it.name}|${it.style}|${it.frame}|${it.showId}`;
}

/* Загрузка истории из localStorage — только на клиенте (студия без SSR) */
function loadHistory(): HistoryItem[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const items = parsed.filter(
      (it): it is HistoryItem =>
        Boolean(it) &&
        typeof it === "object" &&
        typeof (it as HistoryItem).id === "string" &&
        (it as HistoryItem).id.length > 0 &&
        typeof (it as HistoryItem).name === "string" &&
        typeof (it as HistoryItem).ts === "number" &&
        typeof (it as HistoryItem).frame === "boolean" &&
        typeof (it as HistoryItem).showId === "boolean" &&
        ["classic", "rounded", "dots"].includes((it as HistoryItem).style)
    );
    return items.slice(0, 40);
  } catch {
    return [];
  }
}

export function MarkerStudio() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [id, setId] = useState(() => generateId());
  const [style, setStyle] = useState<MarkerStyle>("classic");
  const [frame, setFrame] = useState(true);
  const [showId, setShowId] = useState(true);
  const [exportSize, setExportSize] = useState(1024);
  const [printSizeCm, setPrintSizeCm] = useState(16);
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());
  const [printJob, setPrintJob] = useState<PrintJob | null>(null);
  const [printLoaded, setPrintLoaded] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);

  const previewRef = useRef<HTMLCanvasElement>(null);
  const styleGroupRef = useRef<HTMLDivElement>(null);

  const qr = useMemo(() => (id ? createQrData(id) : null), [id]);

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
    if (!qr || !previewRef.current) return;
    drawMarker(previewRef.current, qr, {
      name,
      id,
      style,
      frame,
      showId,
      size: 660,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
    });
  }, [qr, name, style, frame, showId, fontsReady]);

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

  const notifyEmptyId = (): void => {
    toast({
      title: "Код метки пуст",
      description: "Введите код метки или нажмите кнопку обновления рядом с полем.",
      variant: "destructive",
      duration: 3500,
    });
  };

  const handleDownload = async (): Promise<void> => {
    if (!qr) {
      notifyEmptyId();
      return;
    }
    try {
      const blob = await exportMarkerPng(qr, {
        name,
        id,
        style,
        frame,
        showId,
        size: exportSize,
        dpr: 1,
      });
      saveBlob(blob, markerFileName(name, id));
      addToHistory({ name, id, style, frame, showId });
      toast({
        title: "PNG сохранён",
        description: `Метка «${name.trim() || id}» — ${exportSize} px по ширине.`,
        duration: 3500,
      });
    } catch {
      toast({ title: "Не удалось создать PNG", variant: "destructive", duration: 3500 });
    }
  };

  const handlePrint = (): void => {
    if (!qr) {
      notifyEmptyId();
      return;
    }
    const url = renderMarkerDataUrl(qr, { name, id, style, frame, showId, size: 1600, dpr: 1 });
    setPrintLoaded(0);
    setPrintJob({ images: [url], labels: [name.trim() || id], sizeCm: printSizeCm, batch: false });
  };

  /** Лист A4 со всеми метками из истории — сетка 2 колонки */
  const handlePrintAll = (): void => {
    if (history.length === 0) return;
    const images = history.map((it) =>
      renderMarkerDataUrl(createQrData(it.id), { ...it, size: 1100, dpr: 1 })
    );
    setPrintLoaded(0);
    setPrintJob({
      images,
      labels: history.map((it) => it.name.trim() || it.id),
      sizeCm: 8.5,
      batch: true,
    });
  };

  const copyId = async (): Promise<void> => {
    const value = id.trim();
    if (!value) {
      notifyEmptyId();
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast({
        title: "Код скопирован",
        description: `${value} — в буфере обмена, удобно вставить в AR-сцену.`,
        duration: 2500,
      });
    } catch {
      toast({
        title: "Не удалось скопировать",
        description: "Скопируйте код вручную из поля ввода.",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const loadItem = (item: HistoryItem): void => {
    setName(item.name);
    setId(item.id);
    setStyle(item.style);
    setFrame(item.frame);
    setShowId(item.showId);
    toast({
      title: "Метка загружена в редактор",
      description: `«${item.name.trim() || item.id}»`,
      duration: 3000,
    });
  };

  const downloadItem = async (item: HistoryItem): Promise<void> => {
    try {
      const itemQr = createQrData(item.id);
      const blob = await exportMarkerPng(itemQr, { ...item, size: exportSize, dpr: 1 });
      saveBlob(blob, markerFileName(item.name, item.id));
      toast({
        title: "PNG сохранён",
        description: `Метка «${item.name.trim() || item.id}».`,
        duration: 3000,
      });
    } catch {
      toast({ title: "Не удалось создать PNG", variant: "destructive", duration: 3500 });
    }
  };

  const deleteItem = (item: HistoryItem): void => {
    setHistory((prev) => prev.filter((it) => it.ts !== item.ts));
    toast({
      title: "Метка удалена из истории",
      description: `«${item.name.trim() || item.id}»`,
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

  const handleIdChange = (value: string): void => {
    setId(value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 16));
  };

  /* Стрелки влево/вправо/вверх/вниз переключают стиль — как настоящий radiogroup */
  const handleStyleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (dir === 0) return;
    e.preventDefault();
    const idx = STYLE_OPTIONS.findIndex((o) => o.value === style);
    const next =
      STYLE_OPTIONS[(idx + dir + STYLE_OPTIONS.length) % STYLE_OPTIONS.length].value;
    setStyle(next);
    styleGroupRef.current
      ?.querySelector<HTMLButtonElement>(`[data-style="${next}"]`)
      ?.focus();
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

  return (
    <>
      {printSheet}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(360px,440px)_1fr] xl:gap-8">
        {/* Панель параметров */}
        <Card className="border-white/10 bg-neutral-900/60 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-lg">Параметры метки</CardTitle>
            <CardDescription className="text-neutral-400">
              Изменения сразу видны в предпросмотре
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Название */}
            <div className="space-y-2">
              <Label htmlFor="marker-name" className="text-neutral-200">
                Название метки
              </Label>
              <Input
                id="marker-name"
                value={name}
                maxLength={36}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Красная спортивная"
                className="h-11 border-white/10 bg-neutral-950/70 text-neutral-100 placeholder:text-neutral-600 focus-visible:ring-amber-500/40"
              />
              <p className="text-xs text-neutral-500">
                Печатается над QR-кодом — в скачанной картинке и на печати.
              </p>
            </div>

            {/* Код метки */}
            <div className="space-y-2">
              <Label htmlFor="marker-id" className="text-neutral-200">
                Код метки (ID)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="marker-id"
                  value={id}
                  maxLength={16}
                  onChange={(e) => handleIdChange(e.target.value)}
                  placeholder="KX7M2P9Q"
                  className="h-11 min-w-0 border-white/10 bg-neutral-950/70 font-mono tracking-wider text-neutral-100 placeholder:text-neutral-600 focus-visible:ring-amber-500/40"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={copyId}
                  className="h-11 w-11 shrink-0 border-white/10 bg-transparent hover:bg-white/10 hover:text-white"
                  title="Скопировать код метки"
                >
                  <Copy className="size-4" aria-hidden="true" />
                  <span className="sr-only">Скопировать код метки</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setId(generateId())}
                  className="h-11 w-11 shrink-0 border-white/10 bg-transparent hover:bg-white/10 hover:text-white"
                  title="Сгенерировать новый код"
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                  <span className="sr-only">Сгенерировать новый код</span>
                </Button>
              </div>
              <p className="text-xs text-neutral-500">
                Содержимое QR-кода — только этот ID. Никаких ссылок и адресов.
              </p>
            </div>

            {/* Стиль модулей */}
            <div className="space-y-2">
              <Label id="marker-style-label" className="text-neutral-200">
                Стиль модулей
              </Label>
              <div
                ref={styleGroupRef}
                className="grid grid-cols-3 gap-2"
                role="radiogroup"
                aria-labelledby="marker-style-label"
                onKeyDown={handleStyleKeyDown}
              >
                {STYLE_OPTIONS.map((opt) => {
                  const active = style === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      tabIndex={active ? 0 : -1}
                      data-style={opt.value}
                      onClick={() => setStyle(opt.value)}
                      className={cn(
                        "flex flex-col items-center gap-2.5 rounded-lg border p-3 text-center transition-colors",
                        active
                          ? "border-amber-500/60 bg-amber-500/10"
                          : "border-white/10 bg-neutral-950/40 hover:border-white/25"
                      )}
                    >
                      <StyleGlyph style={opt.value} active={active} />
                      <span>
                        <span
                          className={cn(
                            "block text-sm font-medium",
                            active ? "text-amber-300" : "text-neutral-200"
                          )}
                        >
                          {opt.title}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-tight text-neutral-500">
                          {opt.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Переключатели */}
            <div className="space-y-4 rounded-lg border border-white/10 bg-neutral-950/40 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-neutral-200">Рамка-трекер</div>
                  <div className="mt-0.5 text-xs leading-snug text-neutral-500">
                    Чёрный контур вокруг кода — камера быстрее находит метку в кадре
                  </div>
                </div>
                <Switch checked={frame} onCheckedChange={setFrame} aria-label="Рамка-трекер" />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-neutral-200">Код под меткой</div>
                  <div className="mt-0.5 text-xs leading-snug text-neutral-500">
                    Мелкая техническая подпись с ID под QR-кодом
                  </div>
                </div>
                <Switch checked={showId} onCheckedChange={setShowId} aria-label="Код под меткой" />
              </div>
            </div>

            {/* Разрешение и размер печати */}
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="marker-export-size" className="text-neutral-200">
                  Разрешение PNG
                </Label>
                <Select value={String(exportSize)} onValueChange={(v) => setExportSize(Number(v))}>
                  <SelectTrigger
                    id="marker-export-size"
                    className="h-11 w-full border-white/10 bg-neutral-950/70 text-neutral-100 focus-visible:ring-amber-500/40"
                    aria-label="Разрешение PNG"
                  >
                    <SelectValue placeholder="Выберите разрешение" />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-neutral-900 text-neutral-100">
                    <SelectItem value="512">512 px — черновик на экране</SelectItem>
                    <SelectItem value="1024">1024 px — оптимально</SelectItem>
                    <SelectItem value="2048">2048 px — крупная печать</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="marker-print-size" className="text-neutral-200">
                  Размер при печати
                </Label>
                <Select
                  value={String(printSizeCm)}
                  onValueChange={(v) => setPrintSizeCm(Number(v))}
                >
                  <SelectTrigger
                    id="marker-print-size"
                    className="h-11 w-full border-white/10 bg-neutral-950/70 text-neutral-100 focus-visible:ring-amber-500/40"
                    aria-label="Размер при печати"
                  >
                    <SelectValue placeholder="Размер метки" />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-neutral-900 text-neutral-100">
                    <SelectItem value="10">10 см — компактные</SelectItem>
                    <SelectItem value="13">13 см — обычные</SelectItem>
                    <SelectItem value="16">16 см — крупные (макс. для A4)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Действия */}
            <div className="flex flex-col gap-3 pt-1 sm:flex-row">
              <Button
                type="button"
                onClick={handleDownload}
                className="h-12 flex-1 bg-amber-500 text-base font-semibold text-neutral-950 shadow-lg shadow-amber-500/20 hover:bg-amber-400"
              >
                <Download className="size-5" aria-hidden="true" />
                Скачать PNG
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handlePrint}
                className="h-12 border-white/15 bg-transparent px-5 text-neutral-200 hover:bg-white/10 hover:text-white"
              >
                <Printer className="size-5" aria-hidden="true" />
                Печать
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Предпросмотр и советы */}
        <div className="space-y-6 lg:sticky lg:top-24">
          <Card className="border-white/10 bg-neutral-900/60 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-lg">Предпросмотр</CardTitle>
              <CardDescription className="text-neutral-400">
                Так метка сохранится в PNG и на печати
              </CardDescription>
              <CardAction>
                <span className="font-mono text-xs tracking-wider text-amber-400/90">
                  {id || "—"}
                </span>
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="mx-auto max-w-[430px] overflow-hidden rounded-xl bg-white shadow-2xl shadow-black/50 ring-1 ring-white/10">
                {qr ? (
                  <canvas
                    ref={previewRef}
                    className="block h-auto w-full"
                    aria-label="Предпросмотр метки"
                  />
                ) : (
                  <div className="grid aspect-square place-items-center text-sm text-neutral-400">
                    Введите код метки
                  </div>
                )}
              </div>
              {qr && (
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <Badge variant="outline" className="border-white/15 bg-white/5 text-neutral-300">
                    версия {qr.version}
                  </Badge>
                  <Badge variant="outline" className="border-white/15 bg-white/5 text-neutral-300">
                    {qr.size}×{qr.size} модулей
                  </Badge>
                  <Badge variant="outline" className="border-white/15 bg-white/5 text-neutral-300">
                    тихая зона 4 модуля
                  </Badge>
                  <Badge variant="outline" className="border-white/15 bg-white/5 text-neutral-300">
                    чёрное на белом
                  </Badge>
                  <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-400">
                    EC · H (30%)
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-neutral-900/60 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-base">Уверенное распознавание при слабом свете</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm text-neutral-400">
                <li className="flex gap-3">
                  <Ruler className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
                  Печатайте метку не меньше 6×6 см на матовой бумаге — глянец даёт блики от подсветки.
                </li>
                <li className="flex gap-3">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
                  Коррекция ошибок уровня H: код читается даже при повреждении до 30% поверхности.
                </li>
                <li className="flex gap-3">
                  <Frame className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
                  Рамка-трекер создаёт контрастный силуэт — камере проще захватить метку целиком.
                </li>
                <li className="flex gap-3">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
                  В темноте достаточно подсветить метку фонариком телефона с расстояния 20–30 см.
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* История */}
      <section className="mt-10 lg:mt-14" aria-labelledby="history-heading">
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
          <div className="rounded-xl border border-dashed border-white/15 bg-neutral-900/30 px-6 py-10 text-center">
            <QrCode className="mx-auto size-8 text-neutral-600" aria-hidden="true" />
            <p className="mt-3 text-sm text-neutral-400">
              Здесь появятся сохранённые метки. Скачайте первую — она автоматически попадёт в историю.
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
        Метки-трекеры для AR: наведите камеру на QR-код, система распознаёт ID и привязывает
        к метке трёхмерную модель автомобиля.
      </p>
    </>
  );
}
