// Только для браузера: отдаёт данные как файл. Работает без сервера.

/** Скачивание готового Blob (например, ZIP-копии). */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari иногда не успевает начать скачивание, если адрес освободить сразу. Большому архиву нужно больше времени.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadText(filename: string, text: string, mime = "application/json"): void {
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}

export function readFileText(file: Blob): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}
