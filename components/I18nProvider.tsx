"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { makeT, type Translate } from "../lib/i18n.ts";
import { DEFAULT_LANGUAGE, isLanguage, type Language } from "../lib/types.ts";

interface I18nValue {
  lang: Language;
  /** Перевод по ключу: t("feed.title"), с подстановками t("toast.deleted", { date }). */
  t: Translate;
}

// Запасное значение: если useT() вызвали вне провайдера, приложение не падает, а говорит по-русски.
const FALLBACK: I18nValue = { lang: DEFAULT_LANGUAGE, t: makeT(DEFAULT_LANGUAGE) };

const I18nContext = createContext<I18nValue>(FALLBACK);

/**
 * Задаёт язык для всего дерева ниже и держит <html lang> в актуальном состоянии.
 * Если в настройках оказалось неизвестное значение (битые данные), берётся русский.
 * Функция t пересоздаётся только при смене языка, поэтому её безопасно класть в зависимости хуков.
 */
export function I18nProvider({ lang, children }: { lang: Language; children: ReactNode }) {
  const current: Language = isLanguage(lang) ? lang : DEFAULT_LANGUAGE;
  const value = useMemo<I18nValue>(() => ({ lang: current, t: makeT(current) }), [current]);

  // От атрибута lang зависят проверка орфографии в поле записи и озвучка скринридера.
  useEffect(() => {
    document.documentElement.lang = current;
  }, [current]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** const { t, lang } = useT(); */
export function useT(): I18nValue {
  return useContext(I18nContext);
}
