"use client";

import { useEffect, useRef, useState } from "react";
import type { PhotoStore } from "../lib/photos.ts";
import type { PhotoRef } from "../lib/types.ts";

export type FeedPhotoFit = "natural" | "square" | "wide";

export interface FeedPhotoProps {
  store: PhotoStore;
  photo: PhotoRef;
  alt: string;
  fit: FeedPhotoFit;
}

/**
 * Фото в ленте. Файл читается из IndexedDB, только когда фото подъезжает к экрану, и отпускается,
 * когда уезжает далеко: в ленте на сотни записей иначе в памяти копились бы сотни разобранных картинок.
 * Место под фото задано заранее (по размерам из PhotoRef), поэтому лента не прыгает при загрузке.
 */
export function FeedPhoto({ store, photo, alt, fit }: FeedPhotoProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setNear(entry?.isIntersecting ?? false), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let made: string | null = null;
    setMissing(false);
    store
      .get(photo.id)
      .then((rec) => {
        if (cancelled) return;
        if (!rec) {
          setMissing(true);
          return;
        }
        made = URL.createObjectURL(rec.blob);
        setUrl(made);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
      setUrl(null);
    };
  }, [near, store, photo.id]);

  const shape =
    fit === "natural" ? "max-h-[80dvh] w-full" : fit === "wide" ? "aspect-[2/1] w-full" : "aspect-square w-full";
  const style = fit === "natural" ? { aspectRatio: `${photo.width} / ${photo.height}` } : undefined;

  return (
    <div ref={boxRef} style={style} className={`${shape} grid place-items-center overflow-hidden rounded-sm bg-surface`}>
      {url ? (
        <img src={url} alt={alt} draggable={false} className={`size-full ${fit === "natural" ? "object-contain" : "object-cover"}`} />
      ) : missing ? (
        <span className="px-2 text-center text-sm text-text-muted">Файла этого фото нет на этом устройстве.</span>
      ) : null}
    </div>
  );
}
