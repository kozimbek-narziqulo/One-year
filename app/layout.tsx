import type { Metadata, Viewport } from "next";
import { Caveat } from "next/font/google";
import type { ReactNode } from "react";
import { APP_NAME, APP_TAGLINE } from "../lib/brand.ts";
import { PwaRegister } from "../components/PwaRegister.tsx";
import "./globals.css";

// Handwritten font for the app header.
const caveat = Caveat({ subsets: ["latin", "cyrillic"], variable: "--font-caveat", display: "swap" });

export const metadata: Metadata = {
  title: APP_NAME,
  description: `${APP_TAGLINE}. Записи сохраняются на устройстве и синхронизируются с аккаунтом при входе; фото остаются на устройстве.`,
  manifest: "/manifest.json",
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Keep the app's current mobile interaction model.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#02001a",
};

// Restore language and selected palettes before the first render.
const BOOT_SCRIPT = `try{var s=JSON.parse(localStorage.getItem("garden:v1:settings")||"{}"),r=document.documentElement;
if(s.language==="ru"||s.language==="en"||s.language==="es")r.setAttribute("lang",s.language);
if(s.moodPalette==="cvd")r.setAttribute("data-mood-palette","cvd");
if(s.plantPalette==="autumn"||s.plantPalette==="ink")r.setAttribute("data-plant-palette",s.plantPalette)}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" data-theme="dark" className={caveat.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
