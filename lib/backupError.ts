// Ошибки копии записей. Текстов здесь нет: у ошибки только код, а человеку его переводит
// errorText() из i18n.ts (ключи backupError.<код>), так же как для GardenError.
// Файл без зависимостей, чтобы i18n.ts мог его импортировать без циклов.

export type BackupErrorCode =
  | "fileTooLarge"
  | "tooManyPhotos"
  | "notJson"
  | "unexpected"
  | "otherApp"
  | "noVersion"
  | "newerVersion"
  | "noEntries"
  | "tooManyEntries"
  | "allInvalid"
  | "noBackupJson"
  | "photoMissing"
  | "photoCorrupt"
  | "readFailed"
  | "zipFailed"
  | "photosRequired";

export class BackupError extends Error {
  readonly code: BackupErrorCode;

  /** detail — техническая подробность для консоли (например, сообщение ZipError). Человеку не показывается. */
  constructor(code: BackupErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "BackupError";
    this.code = code;
  }
}
