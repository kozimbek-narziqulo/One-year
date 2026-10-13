import { Caveat } from "next/font/google";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { APP_NAME, APP_TAGLINE } from "../lib/brand.ts";
import { PwaRegister } from "../components/PwaRegister.tsx";
import "./globals.css";
const hand = Caveat({ subsets: ["latin", "cyrillic"], variable: "--font-hand" });

export const metadata: Metadata = {
  title: APP_NAME,
  description: `${APP_TAGLINE}. Бесплатный дневник: записи остаются только в вашем браузере.`,
  manifest: "/manifest.json",
  // iPhone берёт значок и режим «как приложение» отсюда, а не из manifest.json.
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBF7F2" },
    { media: "(prefers-color-scheme: dark)", color: "#1A1517" },
  ],
};

// Выставляет тему и палитры до первой отрисовки, чтобы не было вспышки светлого экрана.
const THEME_SCRIPT = `try{var s=JSON.parse(localStorage.getItem("garden:v1:settings")||"{}"),r=document.documentElement;
if(s.theme==="light"||s.theme==="dark")r.setAttribute("data-theme",s.theme);
if(s.moodPalette==="cvd")r.setAttribute("data-mood-palette","cvd");
if(s.plantPalette==="autumn"||s.plantPalette==="ink")r.setAttribute("data-plant-palette",s.plantPalette)}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {children}
        <PwaRegister />
      </body>
    <html lang="ru" className={hand.variable}>
  );
}
