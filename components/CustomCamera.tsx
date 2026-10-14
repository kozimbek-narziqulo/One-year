"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/*
 * Своя камера вместо системного меню «Камера / Галерея / Файлы».
 * Видео берётся через getUserMedia, снимок вырезается с canvas ровно по рамке видоискателя
 * и отдаётся наружу обычным File (jpeg): дальше он идёт тем же путём, что и фото из галереи.
 *
 * Показывайте компонент ВНУТРИ <dialog> окна записи (position: absolute; inset: 0): всё, что лежит вне
 * открытого showModal-диалога, неактивно. Цвета берутся из --ink, шрифт наследуется от формы.
 */

/** Пропорции видоискателя (ширина / высота). Снимок обрезается ровно под них: что видно в рамке, то и сохранится. */
const ASPECT = 3 / 4;
/** Длинная сторона снимка не больше этого: дальше фото всё равно сожмёт compressImage. */
const MAX_SIDE = 2048;
const MAX_ZOOM = 2;

type Facing = "environment" | "user";

export interface CustomCameraProps {
  /** Снимок готов. Сразу после этого вызывается onClose. */
  onCapture: (file: File) => void;
  onClose: () => void;
}

function cameraErrorText(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Нет доступа к камере. Разрешите её для этого сайта в настройках браузера.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Камера не найдена.";
  if (name === "NotReadableError" || name === "AbortError") return "Камеру сейчас использует другое приложение.";
  return "Не удалось запустить камеру.";
}

/* ───────────── Нарисованные от руки значки ───────────── */

const STROKE = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Icon({ children, className = "size-9" }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={`overflow-visible ${className}`}>
      <g filter="url(#cam-wobble)" {...STROKE} strokeWidth={3}>
        {children}
      </g>
    </svg>
  );
}

const IconX = () => (
  <Icon>
    <path d="M17 17 C 26 27, 38 38, 48 48" />
    <path d="M48 16 C 38 27, 27 38, 16 49" />
  </Icon>
);

/** Вспышка; перечёркнута, когда выключена или недоступна. */
const IconBolt = ({ off }: { off: boolean }) => (
  <Icon>
    <path d="M37 9 L 20 35 L 31 35 L 25 56 L 45 27 L 33 27 Z" />
    {off && <path d="M11 12 C 24 24, 40 40, 53 54" />}
  </Icon>
);

const IconFlip = () => (
  <Icon className="size-10">
    <path d="M14 29 C 14 17, 27 10, 39 14" />
    <path d="M39 14 L 33 8" />
    <path d="M39 14 L 32 19" />
    <path d="M50 35 C 50 47, 37 54, 25 50" />
    <path d="M25 50 L 31 56" />
    <path d="M25 50 L 32 45" />
  </Icon>
);

/** Кривоватая рамка видоискателя: растягивается под размер, толщина линии не меняется. */
function Frame() {
  return (
    <svg viewBox="0 0 300 400" preserveAspectRatio="none" aria-hidden="true" className="pointer-events-none absolute inset-0 size-full overflow-visible text-(color:--ink)">
      <path
        d="M 14 22 C 60 14, 140 24, 230 16 C 270 14, 290 30, 288 60 C 292 150, 284 260, 290 350 C 288 380, 262 388, 230 384 C 150 392, 80 380, 40 386 C 14 388, 8 366, 10 340 C 6 250, 14 130, 10 60 C 10 40, 12 28, 14 22 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Кнопка спуска: круг, заштрихованный от руки. */
function ShutterShape() {
  return (
    <svg viewBox="0 0 80 80" aria-hidden="true" className="size-full overflow-visible text-(color:--ink)">
      <g filter="url(#cam-wobble)">
        <circle cx="40" cy="40" r="31" fill="currentColor" fillOpacity={0.22} />
        <circle cx="40" cy="40" r="31" fill="url(#cam-hatch)" />
        <path d="M10 41 C 9 24, 24 9, 41 9 C 58 9, 72 24, 71 41 C 70 58, 56 72, 39 71 C 23 70, 11 58, 10 41 Z" fill="none" stroke="currentColor" strokeWidth={3} strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/* ───────────── Камера ───────────── */

export function CustomCamera({ onCapture, onClose }: CustomCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const shutterRef = useRef<HTMLButtonElement>(null);
  // Свежие колбэки без перезапуска камеры при каждой перерисовке родителя.
  const cb = useRef({ onCapture, onClose });
  cb.current = { onCapture, onClose };

  const [facing, setFacing] = useState<Facing>("environment");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [busy, setBusy] = useState(false);

  // Запуск камеры; при смене объектива поток пересоздаётся. Остановка потока при выходе обязательна: иначе горит индикатор камеры.
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);
    setTorchSupported(false);
    setTorchOn(false);
    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) {
      setError("Камера недоступна в этом браузере (нужно открытие по HTTPS).");
      return;
    }
    media
      .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          try {
            await video.play();
          } catch {
            /* автозапуск может быть отложен браузером: кадр всё равно пойдёт после первого касания */
          }
        }
        const track = stream.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as Record<string, unknown>;
        setTorchSupported(Boolean(caps.torch));
        setReady(true);
      })
      .catch((e) => {
        if (!cancelled) setError(cameraErrorText(e));
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [facing]);

  useEffect(() => {
    if (ready) shutterRef.current?.focus();
  }, [ready]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as unknown as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }

  async function shoot() {
    const video = videoRef.current;
    if (!video || !ready || busy) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;
    setBusy(true);
    // Вырезаем ту же область, что показана в рамке: центр кадра под пропорции видоискателя с учётом зума.
    let sw = vw / vh > ASPECT ? vh * ASPECT : vw;
    let sh = vw / vh > ASPECT ? vh : vw / ASPECT;
    sw /= zoom;
    sh /= zoom;
    const sx = (vw - sw) / 2;
    const sy = (vh - sh) / 2;
    const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setBusy(false);
      setError("Не удалось сделать снимок.");
      return;
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) {
      setBusy(false);
      setError("Не удалось сделать снимок.");
      return;
    }
    cb.current.onCapture(new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" }));
    cb.current.onClose();
  }

  const mirrored = facing === "user";

  return (
    <div role="group" aria-label="Камера" className="absolute inset-0 z-20 flex flex-col" style={{ backgroundColor: "#02001a", color: "var(--ink, #6c67d6)" }}>
      <svg width="0" height="0" aria-hidden="true" focusable="false" className="absolute">
        <defs>
          <filter id="cam-wobble" x="-15%" y="-15%" width="130%" height="130%">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="6" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <pattern id="cam-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
            <line x1="0" y1="0" x2="0" y2="5" strokeWidth="2.6" opacity="0.85" style={{ stroke: "var(--ink, #6c67d6)" }} />
          </pattern>
        </defs>
      </svg>

      {/* Верх: закрыть слева, вспышка справа */}
      <div className="flex shrink-0 items-center justify-between px-6" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
        <button type="button" onClick={() => cb.current.onClose()} aria-label="Закрыть камеру" className="grid size-12 place-items-center rounded-xl">
          <IconX />
        </button>
        <button
          type="button"
          onClick={toggleTorch}
          disabled={!torchSupported}
          aria-label={torchSupported ? (torchOn ? "Выключить вспышку" : "Включить вспышку") : "Вспышка недоступна"}
          aria-pressed={torchSupported ? torchOn : undefined}
          className="grid size-12 place-items-center rounded-xl disabled:opacity-60"
        >
          <IconBolt off={!torchOn} />
        </button>
      </div>

      {/* Видоискатель */}
      <div className="grid min-h-0 flex-1 place-items-center px-5 py-4">
        <div className="relative" style={{ aspectRatio: "3 / 4", width: "min(100%, calc((100dvh - 17rem) * 0.75))" }}>
          <div className="absolute inset-[3px] overflow-hidden" style={{ borderRadius: "2.2rem 1.6rem 2.4rem 1.8rem / 1.8rem 2.2rem 1.6rem 2.4rem" }}>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              aria-label="Изображение с камеры"
              className="size-full object-cover"
              style={{ transform: `scale(${mirrored ? -zoom : zoom}, ${zoom})`, transition: "transform 150ms ease" }}
            />
          </div>
          <Frame />
          {!ready && !error && (
            <p className="absolute inset-0 grid place-items-center text-2xl" role="status">
              Запускаю камеру…
            </p>
          )}
          {error && (
            <div role="alert" className="absolute inset-0 grid place-items-center p-8 text-center text-2xl leading-8">
              <p>{error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Низ: зум, спуск, смена камеры */}
      <div className="grid shrink-0 grid-cols-3 items-center px-10" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
        <button
          type="button"
          onClick={() => setZoom((z) => (z >= MAX_ZOOM ? 1 : MAX_ZOOM))}
          disabled={!ready}
          aria-label={`Масштаб ${zoom}x, нажмите, чтобы переключить`}
          className="justify-self-start rounded-xl px-2 py-3 text-3xl leading-none disabled:opacity-60"
        >
          {zoom}x
        </button>
        <button
          ref={shutterRef}
          type="button"
          onClick={shoot}
          disabled={!ready || busy}
          aria-label="Сделать снимок"
          className="size-20 justify-self-center rounded-full transition-transform active:scale-95 disabled:opacity-60"
        >
          <ShutterShape />
        </button>
        <button
          type="button"
          onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
          aria-label="Переключить камеру"
          className="grid size-12 place-items-center justify-self-end rounded-xl"
        >
          <IconFlip />
        </button>
      </div>
    </div>
  );
}
