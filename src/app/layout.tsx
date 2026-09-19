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
  title: "Генератор AR-меток — трекер-метки для 3D-машинок",
  description:
    "Красивый генератор трекер-меток: название над узором, уникальный силуэт из названия и крупные модули в рамке-трекере для уверенного различения камерой даже при слабом освещении.",
  keywords: ["AR-метка", "трекер", "3D-модель", "генератор меток", "marker", "tracking"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Генератор AR-меток — трекер-метки для 3D-машинок",
    description:
      "Трекер-метки со названием над узором и уникальным силуэтом. Максимум контраста для распознавания при слабом освещении.",
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
    <html lang="ru" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <div className="print:hidden">
          <Toaster />
        </div>
      </body>
    </html>
  );
}
