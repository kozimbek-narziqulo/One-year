"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createRepo, type GardenState, type Repo } from "../lib/repo.ts";
import { browserStorage } from "../lib/storage.ts";
import { todayKey, type DateKey } from "../lib/date.ts";
import { createPhotoStore, type PhotoStore } from "../lib/photos.ts";

let repo: Repo | null = null;
let photoStore: PhotoStore | null = null;

/** Одно хранилище фото на вкладку. IndexedDB открывается лениво, при первом обращении к фото. */
export function getPhotoStore(): PhotoStore {
  if (!photoStore) photoStore = createPhotoStore(globalThis.indexedDB);
  return photoStore;
}

/** Одно хранилище на вкладку. Создаётся только в браузере: на сервере (при сборке) localStorage нет. */
export function getRepo(): Repo {
  if (!repo) {
    const { storage, persistent } = browserStorage();
    const r = createRepo(storage, { persistent });
    repo = r;
    if (persistent) {
      // Другая вкладка изменила записи: подхватываем.
      window.addEventListener("storage", (e) => {
        if (e.key === null || e.key.startsWith("garden:v1:")) r.reload();
      });
    }
  }
  return repo;
}

/** null, пока страница не загрузилась в браузере (и в предварительно собранном HTML). */
export function useGardenState(): GardenState | null {
  return useSyncExternalStore(
    (fn) => getRepo().subscribe(fn),
    () => getRepo().getState(),
    () => null,
  );
}

/** Сегодняшняя дата; обновляется после полуночи и когда вкладку снова открывают. */
export function useToday(): DateKey | null {
  const [today, setToday] = useState<DateKey | null>(null);
  useEffect(() => {
    const update = () => setToday(todayKey());
    update();
    let timer = 0;
    const schedule = () => {
      const n = new Date();
      const next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 2);
      timer = window.setTimeout(() => {
        update();
        schedule();
      }, next.getTime() - n.getTime());
    };
    schedule();
    const onVisible = () => {
      if (document.visibilityState === "visible") update();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return today;
}
