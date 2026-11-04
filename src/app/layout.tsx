import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import { assetPath } from "@/lib/base-path";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Генератор AR-меток — трекер-метки для 3D-машинок",
  description:
    "Генератор AR-меток для Vuforia и печати: JPG без подписи, PDF с названием, уникальный узор из названия и общая история меток.",
  keywords: ["AR-метка", "трекер", "3D-модель", "генератор меток", "marker", "tracking"],
  manifest: assetPath("/manifest.webmanifest"),
  applicationName: "Генератор AR-меток",
  appleWebApp: {
    capable: true,
    title: "AR-метки",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: assetPath("/icons/favicon.svg"), type: "image/svg+xml" },
      { url: assetPath("/icons/favicon-32.png"), sizes: "32x32", type: "image/png" },
    ],
    apple: [
      {
        url: assetPath("/icons/apple-touch-icon.png"),
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  openGraph: {
    title: "Генератор AR-меток — трекер-метки для 3D-машинок",
    description:
      "Метки для Vuforia и печати: JPG без подписи, PDF с названием, уникальный узор из названия.",
    siteName: "Генератор AR-меток",
    type: "website",
  },
};

/** PWA: theme-color подстраивается под активную тему (светлая/тёмная) */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F3EFE6" },
    { media: "(prefers-color-scheme: dark)", color: "#12110F" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      {/* suppressHydrationWarning: расширения браузера вписывают атрибуты
          в body до гидрации (React рапортует hydration mismatch) — глушим
          на этом уровне; на контент детей это не влияет */}
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {/* Тема до первой отрисовки (анти-вспышка): инлайн-скрипт ставит
            класс .dark на <html> по сохранённому выбору или системной теме.
            Выполняется синхронно до отрисовки контента body. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("ar-theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
        {children}
        <ServiceWorkerRegister />
        <div className="print:hidden">
          <Toaster />
        </div>
      </body>
    </html>
  );
}
