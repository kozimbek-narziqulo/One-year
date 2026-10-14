import type { Metadata, Viewport } from "next";
import { Caveat } from "next/font/google";
import type { ReactNode } from "react";
import { APP_NAME, APP_TAGLINE } from "../lib/brand.ts";
import { PwaRegister } from "../components/PwaRegister.tsx";
import "./globals.css";

// Рукописный шрифт для своей верхней панели. Подключается переменной --font-caveat.
const caveat = Caveat({ subsets: ["latin", "cyrillic"], variable: "--font-caveat", display: "swap" });

export const metadata: Metadata = {
  title: APP_NAME,
  description: `${APP_TAGLINE}. Бесплатный дневник: записи остаются только в вашем браузере.`,
  manifest: "/manifest.json",
  // iPhone берёт значок и режим «как приложение» отсюда, а не из manifest.json.
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Масштаб выключен: ни щипок, ни двойной тап его не меняют. На iPhone Safari это игнорирует, там дополнительно
  // работают touch-action в globals.css и гашение жестов в GardenApp.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // Приложение сейчас только тёмное, поэтому цвет один.
  themeColor: "#02001a",
};

// Выставляет тему и палитры до первой отрисовки, чтобы не было вспышки светлого экрана.
const THEME_SCRIPT = `try{var s=JSON.parse(localStorage.getItem("garden:v1:settings")||"{}"),r=document.documentElement;
if(s.theme==="light"||s.theme==="dark")r.setAttribute("data-theme",s.theme);
if(s.moodPalette==="cvd")r.setAttribute("data-mood-palette","cvd");
if(s.plantPalette==="autumn"||s.plantPalette==="ink")r.setAttribute("data-plant-palette",s.plantPalette)}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={caveat.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
