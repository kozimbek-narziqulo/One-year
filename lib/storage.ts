// Тонкая обёртка над localStorage. Всё, что нужно приложению, укладывается в три метода,
// поэтому в тестах подставляется обычная Map, а в Safari с закрытыми данными сайта
// приложение остаётся рабочим в памяти и честно говорит об этом пользователю.

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function memoryStorage(initial: Record<string, string> = {}): StorageLike & { dump(): Record<string, string> } {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

export function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { name?: string; code?: number };
  return (
    err.name === "QuotaExceededError" ||
    err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    err.code === 22 ||
    err.code === 1014
  );
}

export interface BrowserStorage {
  storage: StorageLike;
  /** false: localStorage недоступен (приватный режим, запрет сайтам хранить данные), записи живут до закрытия вкладки. */
  persistent: boolean;
}

export function browserStorage(): BrowserStorage {
  try {
    const ls = globalThis.localStorage;
    const probe = "garden:v1:probe";
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return { storage: ls, persistent: true };
  } catch {
    return { storage: memoryStorage(), persistent: false };
  }
}
