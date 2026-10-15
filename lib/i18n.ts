// Локализация без зависимостей. Русский словарь главный: ключи берутся из него,
// а en и es обязаны содержать те же ключи (иначе TypeScript не даст собрать проект).
//
// Использование в компонентах: const { t, lang } = useT();  (см. components/I18nProvider.tsx)
// Подстановки: t("backup.changes", { count: 3 }) подставит значение вместо {count}.
// Склонений («1 запись / 2 записи») нет специально: строки написаны как «Записей: 3».
//
// Ошибки: GardenError и BackupError несут только код. Текст для человека даёт errorText(t, e).

import { BackupError } from "./backupError.ts";
import type { DateKey } from "./date.ts";
import { GardenError, LANGUAGES, type Language } from "./types.ts";

export { LANGUAGES };
export type { Language };

export const LANGUAGE_NAMES: Record<Language, string> = {
  ru: "Русский",
  en: "English",
  es: "Español",
};

/** BCP 47 для Intl: даты и месяцы выводит браузер. */
export const LOCALES: Record<Language, string> = {
  ru: "ru-RU",
  en: "en-US",
  es: "es-ES",
};

const ru = {
  "common.close": "Закрыть",
  "common.delete": "Удалить",
  "common.today": "Сегодня",

  "panel.title": "Копия и настройки",
  "panel.notPersistent":
    "Браузер не даёт сохранять данные сайта (например, приватный режим). Записи живут только до закрытия вкладки. Сохраните копию файлом.",

  "lang.title": "Язык",

  "nav.aria": "Разделы",
  "nav.back": "Назад",
  "nav.feed": "Лента",
  "nav.garden": "Сад",
  "nav.todayGo": "Перейти к сегодняшнему дню",

  "strip.aria": "Дни",

  "today.plant": "Посадить воспоминание",
  "today.writeDay": "Записать {date}",

  "app.loadProblem":
    "Часть сохранённых записей не удалось прочитать. Исходный текст отложен в хранилище браузера и не стёрт. Сохраните копию и обратитесь за помощью, прежде чем что-то менять.",

  "nudge.aria": "Напоминание о копии",
  "nudge.text": "Давно не было копии. Сохраните файл, на случай если телефон потеряется.",
  "nudge.save": "Сохранить копию",
  "nudge.later": "Позже",

  "toast.saved": "Записано. Растение уже в саду.",
  "toast.updated": "Запись обновлена.",
  "toast.deleted": "Запись за {date} удалена.",
  "toast.undo": "Вернуть",
  "toast.restoreFailed": "Не удалось вернуть запись: нет места.",

  "feed.title": "Лента воспоминаний",
  "feed.count": "Записей: {count}",
  "feed.empty": "В ленте пока пусто. Записи появятся здесь.",
  "feed.writeSomething": "Написать пару слов…",
  "feed.more": "Показать ещё",
  "feed.shown": "Показано {shown} из {total}",
  "feed.photoAlt": "Фото к записи за {date}",
  "feed.photoAltN": "Фото к записи за {date}, {index} из {total}",
  "feed.deletePhotoAria": "Удалить фото",
  "feed.deletingPhoto": "Удаляю фото…",
  "feed.photoQuota": "Не удалось сохранить изменения: на телефоне кончилось место.",
  "feed.photoUnavailable": "Не удалось записать изменения в хранилище браузера.",
  "feed.photoDeleteFailed": "Не удалось удалить фото.",

  "entry.editToday": "Изменить запись за сегодня",
  "entry.editDay": "Изменить запись за {date}",
  "entry.placeholder": "Начать писать",
  "entry.done": "Готово",
  "entry.moodTitle": "Как вы себя чувствуете сегодня?",
  "entry.changeDate": "Сменить дату, сейчас {date}",
  "entry.draftRestored": "Черновик восстановлен",
  "entry.draftDiscard": "Сбросить",
  "entry.bodyLabel": "Запись дня",
  "entry.addGallery": "Добавить фото из галереи",
  "entry.addCamera": "Сделать фото",
  "entry.photoCount": "Фото: {count} из {max}",
  "entry.processing": "обрабатываю…",
  "entry.attached": "Прикреплённые фото",
  "entry.photoN": "Фото {index} из {total}",
  "entry.removePhoto": "Убрать фото {index}",
  "entry.confirmAria": "Подтверждение удаления",
  "entry.confirmDelete": "Текст пустой. Удалить запись за {date}? Растение снова станет семенем.",
  "entry.keep": "Не удалять",
  "entry.saveQuota": "Не удалось сохранить: на телефоне кончилось место. Текст остался на экране.",
  "entry.saveUnavailable": "Не удалось записать в хранилище браузера. Текст остался на экране: скопируйте его, чтобы не потерять.",
  "entry.saveFailed": "Не удалось сохранить. Текст остался на экране.",

  "backup.title": "Копия записей",
  "backup.intro": "Записи и фото хранятся только на этом устройстве. Файл копии — единственная защита, если телефон потеряется.",
  "backup.statEntries": "Записи",
  "backup.statPhotos": "Фото",
  "backup.statLast": "Последняя копия",
  "backup.never": "Ещё не было",
  "backup.changes": "Изменений после копии: {count}",
  "backup.save": "Сохранить копию (.zip)",
  "backup.building": "Собираю копию…",
  "backup.buildingPhotos": "Собираю фото: {done} из {total}",
  "backup.saved": "Копия сохранена: записей {entries}, фото {photos}. Положите файл туда, где он переживёт этот телефон.",
  "backup.photosMissing":
    "В копию не попало фото: {count}. Записи на них ссылаются, а самих файлов в этом браузере нет, поэтому в копии они сохранены без этих фото.",
  "backup.failed": "Не удалось собрать копию. Попробуйте ещё раз.",

  "import.title": "Загрузить из копии",
  "import.choose": "Выбрать файл копии",
  "import.reading": "Читаю файл…",
  "import.readFailed": "Не удалось прочитать файл.",
  "import.fileSummary": "Файл «{name}»: записей {entries}, фото {photos}.",
  "import.skipped": "Пропущено: {count} (повреждённые, пустые или с датой из будущего).",
  "import.jsonNote": "Это копия без фото (старый формат или одиночный backup.json). У записей, которые уже есть в приложении, фото останутся.",
  "import.photosMissing": "В файле нет {count} фото, на которые ссылаются записи. Записи загрузятся без них.",
  "import.noPhotoStore": "В этом браузере нельзя сохранять фото (например, приватный режим). Записи загрузятся без фото.",
  "import.howTitle": "Как загрузить",
  "import.merge": "Добавить к текущим",
  "import.mergeHint": "Если дата совпала, остаётся более свежая правка.",
  "import.replace": "Заменить всё содержимым файла",
  "import.replaceHint": "Подходит для нового телефона.",
  "import.plan": "Новых: {added}. Обновится: {updated}. Без изменений: {unchanged}.",
  "import.planPhotos": "Фото добавится: {count}.",
  "import.planKept": "Останутся ваши, как более свежие: {count}.",
  "import.removeWarn": "Исчезнет записей, которых нет в файле: {entries}",
  "import.removeWarnPhotos": ", фото: {count}",
  "import.removeWarnTail": ". Если сомневаетесь, сначала сохраните копию текущих.",
  "import.withSettings": "Загрузить и настройки приложения",
  "import.load": "Загрузить",
  "import.cancel": "Не загружать",
  "import.loadingEntries": "Загружаю записи…",
  "import.loadingPhotos": "Загружаю фото…",
  "import.loadingPhotosN": "Загружаю фото: {done} из {total}",
  "import.doneReplace": "Записи заменены: в саду {count}.",
  "import.doneMerge": "Импортировано: новых {added}, обновлено {updated}.",
  "import.donePhotos": "Фото: {count}.",
  "import.donePhotosFailed": "Не удалось прочитать фото: {count}.",
  "import.failedQuota": "Не удалось импортировать: на телефоне кончилось место. Записи не изменились.",
  "import.failed": "Не удалось импортировать. Записи не изменились.",

  "settings.saveFailed": "Не удалось сохранить настройку: нет места или хранилище недоступно.",

  "photo.noFile": "Нет файла",
  "photo.loadFailed": "Не удалось показать фото.",

  "garden.aria": "Сад {year}",
  "garden.hasEntry": ", есть запись",
  "garden.noEntry": ", записи нет",
  "garden.empty": "Пока здесь одни семена. Начнём с сегодняшнего дня?",
  "garden.stats": "Записей: {count} из {total} · прошло {elapsed} дн.",

  "error.future": "Завтра ещё не наступило.",
  "error.empty": "Добавьте текст, фото или выберите настроение.",
  "error.invalid": "Некорректные данные.",
  "error.quota": "На телефоне кончилось место.",
  "error.unavailable": "Не удалось записать в хранилище браузера.",

  "backupError.fileTooLarge": "Файл слишком большой для копии.",
  "backupError.tooManyPhotos":
    "Фото слишком много для одного файла копии. Удалите часть фото или сохраните копию позже, когда приложение это умеет по частям.",
  "backupError.notJson": "Это не файл копии: он не читается как JSON.",
  "backupError.unexpected": "Это не файл копии: неожиданное содержимое.",
  "backupError.otherApp": "Это файл другого приложения, записи из него не импортируются.",
  "backupError.noVersion": "В файле нет номера версии.",
  "backupError.newerVersion": "Файл создан более новой версией приложения. Обновите приложение и повторите.",
  "backupError.noEntries": "В файле нет списка записей.",
  "backupError.tooManyEntries": "В файле слишком много записей.",
  "backupError.allInvalid": "Ни одна запись в файле не прошла проверку. Файл повреждён?",
  "backupError.noBackupJson": "В архиве нет файла backup.json. Это не копия дневника.",
  "backupError.photoMissing": "В архиве нет файла этого фото.",
  "backupError.photoCorrupt": "Файл фото повреждён или это не изображение.",
  "backupError.readFailed": "Не удалось прочитать файл.",
  "backupError.zipFailed": "Архив повреждён или не читается.",
  "backupError.photosRequired": "Эта копия содержит фото и должна загружаться вместе с ними.",
};

export type TKey = keyof typeof ru;
type Dict = Record<TKey, string>;

const en: Dict = {
  "common.close": "Close",
  "common.delete": "Delete",
  "common.today": "Today",

  "panel.title": "Backup & settings",
  "panel.notPersistent":
    "Your browser won't let this site save data (for example, in private mode). Entries only last until you close the tab. Save a backup file.",

  "lang.title": "Language",

  "nav.aria": "Sections",
  "nav.back": "Back",
  "nav.feed": "Feed",
  "nav.garden": "Garden",
  "nav.todayGo": "Go to today",

  "strip.aria": "Days",

  "today.plant": "Plant a memory",
  "today.writeDay": "Write {date}",

  "app.loadProblem":
    "Some saved entries couldn't be read. The original text is set aside in browser storage and hasn't been erased. Save a backup and ask for help before changing anything.",

  "nudge.aria": "Backup reminder",
  "nudge.text": "It's been a while since your last backup. Save a file in case you lose your phone.",
  "nudge.save": "Save backup",
  "nudge.later": "Later",

  "toast.saved": "Saved. The plant is already in the garden.",
  "toast.updated": "Entry updated.",
  "toast.deleted": "Entry for {date} deleted.",
  "toast.undo": "Undo",
  "toast.restoreFailed": "Couldn't restore the entry: out of space.",

  "feed.title": "Memory feed",
  "feed.count": "Entries: {count}",
  "feed.empty": "The feed is empty for now. Entries will show up here.",
  "feed.writeSomething": "Write a few words…",
  "feed.more": "Show more",
  "feed.shown": "Showing {shown} of {total}",
  "feed.photoAlt": "Photo for the entry of {date}",
  "feed.photoAltN": "Photo for the entry of {date}, {index} of {total}",
  "feed.deletePhotoAria": "Delete photo",
  "feed.deletingPhoto": "Deleting photo…",
  "feed.photoQuota": "Couldn't save the changes: this phone is out of space.",
  "feed.photoUnavailable": "Couldn't write the changes to browser storage.",
  "feed.photoDeleteFailed": "Couldn't delete the photo.",

  "entry.editToday": "Edit today's entry",
  "entry.editDay": "Edit the entry for {date}",
  "entry.placeholder": "Start writing",
  "entry.done": "Done",
  "entry.moodTitle": "How are you feeling today?",
  "entry.changeDate": "Change date, currently {date}",
  "entry.draftRestored": "Draft restored",
  "entry.draftDiscard": "Discard",
  "entry.bodyLabel": "Entry for the day",
  "entry.addGallery": "Add a photo from the gallery",
  "entry.addCamera": "Take a photo",
  "entry.photoCount": "Photos: {count} of {max}",
  "entry.processing": "processing…",
  "entry.attached": "Attached photos",
  "entry.photoN": "Photo {index} of {total}",
  "entry.removePhoto": "Remove photo {index}",
  "entry.confirmAria": "Confirm deletion",
  "entry.confirmDelete": "The text is empty. Delete the entry for {date}? The plant will turn back into a seed.",
  "entry.keep": "Keep it",
  "entry.saveQuota": "Couldn't save: this phone is out of space. Your text is still on screen.",
  "entry.saveUnavailable": "Couldn't write to browser storage. Your text is still on screen: copy it so you don't lose it.",
  "entry.saveFailed": "Couldn't save. Your text is still on screen.",

  "backup.title": "Backup",
  "backup.intro": "Entries and photos are stored only on this device. A backup file is your only safeguard if you lose your phone.",
  "backup.statEntries": "Entries",
  "backup.statPhotos": "Photos",
  "backup.statLast": "Last backup",
  "backup.never": "Never",
  "backup.changes": "Changes since last backup: {count}",
  "backup.save": "Save backup (.zip)",
  "backup.building": "Building backup…",
  "backup.buildingPhotos": "Packing photos: {done} of {total}",
  "backup.saved": "Backup saved: {entries} entries, {photos} photos. Keep the file somewhere that will outlive this phone.",
  "backup.photosMissing":
    "{count} photos didn't make it into the backup. Entries refer to them, but the files aren't in this browser, so those entries were saved without them.",
  "backup.failed": "Couldn't build the backup. Please try again.",

  "import.title": "Restore from backup",
  "import.choose": "Choose backup file",
  "import.reading": "Reading file…",
  "import.readFailed": "Couldn't read the file.",
  "import.fileSummary": "File “{name}”: {entries} entries, {photos} photos.",
  "import.skipped": "Skipped: {count} (damaged, empty, or dated in the future).",
  "import.jsonNote": "This backup has no photos (old format or a standalone backup.json). Entries already in the app keep their photos.",
  "import.photosMissing": "The file is missing {count} photos that entries refer to. Entries will load without them.",
  "import.noPhotoStore": "This browser can't store photos (for example, in private mode). Entries will load without photos.",
  "import.howTitle": "How to restore",
  "import.merge": "Add to current entries",
  "import.mergeHint": "If a date matches, the more recent edit is kept.",
  "import.replace": "Replace everything with the file",
  "import.replaceHint": "Good for a new phone.",
  "import.plan": "New: {added}. Updated: {updated}. Unchanged: {unchanged}.",
  "import.planPhotos": "Photos added: {count}.",
  "import.planKept": "Yours are kept as more recent: {count}.",
  "import.removeWarn": "Entries missing from the file will disappear: {entries}",
  "import.removeWarnPhotos": ", photos: {count}",
  "import.removeWarnTail": ". If in doubt, save a backup of the current ones first.",
  "import.withSettings": "Also restore app settings",
  "import.load": "Restore",
  "import.cancel": "Cancel",
  "import.loadingEntries": "Loading entries…",
  "import.loadingPhotos": "Loading photos…",
  "import.loadingPhotosN": "Loading photos: {done} of {total}",
  "import.doneReplace": "Entries replaced: {count} in the garden.",
  "import.doneMerge": "Imported: {added} new, {updated} updated.",
  "import.donePhotos": "Photos: {count}.",
  "import.donePhotosFailed": "Couldn't read {count} photos.",
  "import.failedQuota": "Import failed: this phone is out of space. Your entries are unchanged.",
  "import.failed": "Import failed. Your entries are unchanged.",

  "settings.saveFailed": "Couldn't save the setting: out of space or storage is unavailable.",

  "photo.noFile": "No file",
  "photo.loadFailed": "Couldn't show the photo.",

  "garden.aria": "Garden {year}",
  "garden.hasEntry": ", has an entry",
  "garden.noEntry": ", no entry",
  "garden.empty": "Nothing but seeds here for now. Shall we start with today?",
  "garden.stats": "Entries: {count} of {total} · {elapsed} days so far",

  "error.future": "Tomorrow hasn't come yet.",
  "error.empty": "Add some text, a photo, or pick a mood.",
  "error.invalid": "Invalid data.",
  "error.quota": "This phone is out of space.",
  "error.unavailable": "Couldn't write to browser storage.",

  "backupError.fileTooLarge": "The file is too large to be a backup.",
  "backupError.tooManyPhotos":
    "There are too many photos for a single backup file. Delete some photos, or save a backup later, once the app can split it into parts.",
  "backupError.notJson": "This isn't a backup file: it can't be read as JSON.",
  "backupError.unexpected": "This isn't a backup file: unexpected contents.",
  "backupError.otherApp": "This file belongs to another app, so its entries can't be imported.",
  "backupError.noVersion": "The file has no version number.",
  "backupError.newerVersion": "This file was made by a newer version of the app. Update the app and try again.",
  "backupError.noEntries": "The file has no list of entries.",
  "backupError.tooManyEntries": "The file has too many entries.",
  "backupError.allInvalid": "None of the entries in the file passed validation. Is the file damaged?",
  "backupError.noBackupJson": "The archive has no backup.json file. This isn't a diary backup.",
  "backupError.photoMissing": "The archive doesn't contain this photo's file.",
  "backupError.photoCorrupt": "The photo file is damaged or isn't an image.",
  "backupError.readFailed": "Couldn't read the file.",
  "backupError.zipFailed": "The archive is damaged or can't be read.",
  "backupError.photosRequired": "This backup contains photos and has to be restored together with them.",
};

const es: Dict = {
  "common.close": "Cerrar",
  "common.delete": "Eliminar",
  "common.today": "Hoy",

  "panel.title": "Copia y ajustes",
  "panel.notPersistent":
    "El navegador no permite que este sitio guarde datos (por ejemplo, en modo privado). Las entradas duran solo hasta cerrar la pestaña. Guarda una copia en un archivo.",

  "lang.title": "Idioma",

  "nav.aria": "Secciones",
  "nav.back": "Atrás",
  "nav.feed": "Recuerdos",
  "nav.garden": "Jardín",
  "nav.todayGo": "Ir a hoy",

  "strip.aria": "Días",

  "today.plant": "Plantar un recuerdo",
  "today.writeDay": "Anotar {date}",

  "app.loadProblem":
    "No se pudieron leer algunas entradas guardadas. El texto original está apartado en el almacenamiento del navegador y no se ha borrado. Guarda una copia y pide ayuda antes de cambiar nada.",

  "nudge.aria": "Recordatorio de copia",
  "nudge.text": "Hace tiempo que no haces una copia. Guarda un archivo por si pierdes el teléfono.",
  "nudge.save": "Guardar copia",
  "nudge.later": "Más tarde",

  "toast.saved": "Guardado. La planta ya está en el jardín.",
  "toast.updated": "Entrada actualizada.",
  "toast.deleted": "Entrada del {date} eliminada.",
  "toast.undo": "Deshacer",
  "toast.restoreFailed": "No se pudo recuperar la entrada: no hay espacio.",

  "feed.title": "Línea de recuerdos",
  "feed.count": "Entradas: {count}",
  "feed.empty": "La línea de recuerdos está vacía por ahora. Las entradas aparecerán aquí.",
  "feed.writeSomething": "Escribe unas palabras…",
  "feed.more": "Mostrar más",
  "feed.shown": "Mostrando {shown} de {total}",
  "feed.photoAlt": "Foto de la entrada del {date}",
  "feed.photoAltN": "Foto de la entrada del {date}, {index} de {total}",
  "feed.deletePhotoAria": "Eliminar foto",
  "feed.deletingPhoto": "Eliminando la foto…",
  "feed.photoQuota": "No se pudieron guardar los cambios: el teléfono se quedó sin espacio.",
  "feed.photoUnavailable": "No se pudieron escribir los cambios en el almacenamiento del navegador.",
  "feed.photoDeleteFailed": "No se pudo eliminar la foto.",

  "entry.editToday": "Editar la entrada de hoy",
  "entry.editDay": "Editar la entrada del {date}",
  "entry.placeholder": "Empieza a escribir",
  "entry.done": "Listo",
  "entry.moodTitle": "¿Cómo te sientes hoy?",
  "entry.changeDate": "Cambiar la fecha, ahora {date}",
  "entry.draftRestored": "Borrador recuperado",
  "entry.draftDiscard": "Descartar",
  "entry.bodyLabel": "Entrada del día",
  "entry.addGallery": "Añadir una foto de la galería",
  "entry.addCamera": "Hacer una foto",
  "entry.photoCount": "Fotos: {count} de {max}",
  "entry.processing": "procesando…",
  "entry.attached": "Fotos adjuntas",
  "entry.photoN": "Foto {index} de {total}",
  "entry.removePhoto": "Quitar la foto {index}",
  "entry.confirmAria": "Confirmar eliminación",
  "entry.confirmDelete": "El texto está vacío. ¿Eliminar la entrada del {date}? La planta volverá a ser semilla.",
  "entry.keep": "No eliminar",
  "entry.saveQuota": "No se pudo guardar: el teléfono se quedó sin espacio. El texto sigue en pantalla.",
  "entry.saveUnavailable": "No se pudo escribir en el almacenamiento del navegador. El texto sigue en pantalla: cópialo para no perderlo.",
  "entry.saveFailed": "No se pudo guardar. El texto sigue en pantalla.",

  "backup.title": "Copia de seguridad",
  "backup.intro": "Las entradas y las fotos se guardan solo en este dispositivo. El archivo de copia es tu única protección si pierdes el teléfono.",
  "backup.statEntries": "Entradas",
  "backup.statPhotos": "Fotos",
  "backup.statLast": "Última copia",
  "backup.never": "Todavía no",
  "backup.changes": "Cambios desde la última copia: {count}",
  "backup.save": "Guardar copia (.zip)",
  "backup.building": "Preparando la copia…",
  "backup.buildingPhotos": "Empaquetando fotos: {done} de {total}",
  "backup.saved": "Copia guardada: {entries} entradas, {photos} fotos. Guarda el archivo en un lugar que sobreviva a este teléfono.",
  "backup.photosMissing":
    "{count} fotos no entraron en la copia. Las entradas las mencionan, pero los archivos no están en este navegador, así que esas entradas se guardaron sin ellas.",
  "backup.failed": "No se pudo preparar la copia. Inténtalo de nuevo.",

  "import.title": "Cargar desde una copia",
  "import.choose": "Elegir archivo de copia",
  "import.reading": "Leyendo el archivo…",
  "import.readFailed": "No se pudo leer el archivo.",
  "import.fileSummary": "Archivo «{name}»: {entries} entradas, {photos} fotos.",
  "import.skipped": "Omitidas: {count} (dañadas, vacías o con fecha futura).",
  "import.jsonNote": "Esta copia no incluye fotos (formato antiguo o un backup.json suelto). Las entradas que ya están en la app conservan sus fotos.",
  "import.photosMissing": "Al archivo le faltan {count} fotos a las que se refieren las entradas. Se cargarán sin ellas.",
  "import.noPhotoStore": "Este navegador no puede guardar fotos (por ejemplo, en modo privado). Las entradas se cargarán sin fotos.",
  "import.howTitle": "Cómo cargar",
  "import.merge": "Añadir a las actuales",
  "import.mergeHint": "Si la fecha coincide, se conserva la edición más reciente.",
  "import.replace": "Reemplazar todo con el archivo",
  "import.replaceHint": "Ideal para un teléfono nuevo.",
  "import.plan": "Nuevas: {added}. Se actualizarán: {updated}. Sin cambios: {unchanged}.",
  "import.planPhotos": "Fotos añadidas: {count}.",
  "import.planKept": "Se quedan las tuyas por ser más recientes: {count}.",
  "import.removeWarn": "Desaparecerán entradas que no están en el archivo: {entries}",
  "import.removeWarnPhotos": ", fotos: {count}",
  "import.removeWarnTail": ". Si tienes dudas, guarda primero una copia de las actuales.",
  "import.withSettings": "Cargar también los ajustes de la app",
  "import.load": "Cargar",
  "import.cancel": "No cargar",
  "import.loadingEntries": "Cargando entradas…",
  "import.loadingPhotos": "Cargando fotos…",
  "import.loadingPhotosN": "Cargando fotos: {done} de {total}",
  "import.doneReplace": "Entradas reemplazadas: {count} en el jardín.",
  "import.doneMerge": "Importadas: {added} nuevas, {updated} actualizadas.",
  "import.donePhotos": "Fotos: {count}.",
  "import.donePhotosFailed": "No se pudieron leer {count} fotos.",
  "import.failedQuota": "No se pudo importar: el teléfono se quedó sin espacio. Tus entradas no cambiaron.",
  "import.failed": "No se pudo importar. Tus entradas no cambiaron.",

  "settings.saveFailed": "No se pudo guardar el ajuste: no hay espacio o el almacenamiento no está disponible.",

  "photo.noFile": "Sin archivo",
  "photo.loadFailed": "No se pudo mostrar la foto.",

  "garden.aria": "Jardín {year}",
  "garden.hasEntry": ", hay entrada",
  "garden.noEntry": ", sin entrada",
  "garden.empty": "Por ahora aquí solo hay semillas. ¿Empezamos con hoy?",
  "garden.stats": "Entradas: {count} de {total} · han pasado {elapsed} días",

  "error.future": "Mañana todavía no ha llegado.",
  "error.empty": "Añade texto, una foto o elige un estado de ánimo.",
  "error.invalid": "Datos no válidos.",
  "error.quota": "El teléfono se quedó sin espacio.",
  "error.unavailable": "No se pudo escribir en el almacenamiento del navegador.",

  "backupError.fileTooLarge": "El archivo es demasiado grande para ser una copia.",
  "backupError.tooManyPhotos":
    "Hay demasiadas fotos para un solo archivo de copia. Elimina algunas fotos o guarda la copia más adelante, cuando la app pueda dividirla en partes.",
  "backupError.notJson": "No es un archivo de copia: no se puede leer como JSON.",
  "backupError.unexpected": "No es un archivo de copia: contenido inesperado.",
  "backupError.otherApp": "Este archivo es de otra aplicación, así que sus entradas no se pueden importar.",
  "backupError.noVersion": "El archivo no tiene número de versión.",
  "backupError.newerVersion": "El archivo fue creado por una versión más reciente de la app. Actualiza la app e inténtalo de nuevo.",
  "backupError.noEntries": "El archivo no contiene una lista de entradas.",
  "backupError.tooManyEntries": "El archivo tiene demasiadas entradas.",
  "backupError.allInvalid": "Ninguna entrada del archivo pasó la validación. ¿Está dañado el archivo?",
  "backupError.noBackupJson": "El archivo comprimido no contiene backup.json. No es una copia del diario.",
  "backupError.photoMissing": "El archivo comprimido no contiene el archivo de esta foto.",
  "backupError.photoCorrupt": "El archivo de la foto está dañado o no es una imagen.",
  "backupError.readFailed": "No se pudo leer el archivo.",
  "backupError.zipFailed": "El archivo comprimido está dañado o no se puede leer.",
  "backupError.photosRequired": "Esta copia incluye fotos y debe cargarse junto con ellas.",
};

const DICTS: Record<Language, Dict> = { ru, en, es };

export type Params = Record<string, string | number>;
export type Translate = (key: TKey, params?: Params) => string;

export function makeT(lang: Language): Translate {
  const dict = DICTS[lang];
  return (key, params) => {
    const s = dict[key] ?? ru[key];
    return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s;
  };
}

/** Текст ошибки по её коду (GardenError, BackupError); для чужих ошибок возвращает null. */
export function errorText(t: Translate, e: unknown): string | null {
  if (e instanceof GardenError) return t(`error.${e.code}`);
  if (e instanceof BackupError) return t(`backupError.${e.code}`);
  return null;
}

/** Ключ YYYY-MM-DD в локальную дату (без сдвига часового пояса). */
function dateOfKey(key: DateKey): Date {
  const [y = 1970, m = 1, d = 1] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** «11 окт.» / «Oct 11» / «11 oct»: короткая дата из ключа YYYY-MM-DD. */
export function formatDayShort(key: DateKey, lang: Language): string {
  return new Intl.DateTimeFormat(LOCALES[lang], { day: "numeric", month: "short" }).format(dateOfKey(key));
}

/** «воскресенье, 11 октября 2026 г.» / «Sunday, October 11, 2026» / «domingo, 11 de octubre de 2026». */
export function formatDayLong(key: DateKey, lang: Language): string {
  return new Intl.DateTimeFormat(LOCALES[lang], { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(dateOfKey(key));
}

/** Дата с годом по метке времени (мс). */
export function formatDateFull(ms: number, lang: Language): string {
  return new Intl.DateTimeFormat(LOCALES[lang], { day: "numeric", month: "short", year: "numeric" }).format(new Date(ms));
}
