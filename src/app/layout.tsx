import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Генератор AR-меток — QR-трекеры для 3D-машинок",
  description:
    "Красивый генератор трекерных QR-меток: название над кодом, уникальный ID без ссылок, коррекция ошибок уровня H и рамка-трекер для уверенного распознавания камерой даже при слабом освещении.",
  keywords: ["QR-код", "AR-метка", "трекер", "3D-модель", "генератор QR", "marker", "tracking"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Генератор AR-меток — QR-трекеры для 3D-машинок",
    description:
      "Трекерные QR-метки со названием над кодом и уникальным ID внутри. Максимум контраста для распознавания при слабом освещении.",
    siteName: "Генератор AR-меток",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
