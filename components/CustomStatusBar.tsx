"use client";

import { useEffect, useState } from "react";

/** Минимум из Battery Status API, который нам нужен. В TypeScript его нет, а в Safari и Firefox он не работает. */
interface BatteryManager extends EventTarget {
  readonly level: number;
  readonly charging: boolean;
}
type NavigatorWithBattery = Navigator & {
  getBattery?: () => Promise<BatteryManager>;
  /** Только в Safari на iOS: true, если сайт запущен с домашнего экрана. */
  standalone?: boolean;
};

interface BatteryInfo {
  percent: number;
  charging: boolean;
}

const TIME_FORMAT = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
const LOW_PERCENT = 20;

/** Маленькая нарисованная молния: неровные линии, скруглённые концы, как карандашом. */
function Bolt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable={false}
    >
      <path d="M7.6 1.2C6 4 3.6 8 2.2 10.8c1.2.1 2.6 0 3.8.1-.5 2.6-1.1 5.1-1.6 7.9 2-3.2 4-6.4 5.6-9.4-1.4-.1-2.6 0-3.9-.1.5-2.7 1-5.4 1.5-8.1Z" />
    </svg>
  );
}

/**
 * Своя верхняя панель вместо системной: слева время, справа заряд батареи и молния при зарядке.
 * Сама панель учитывает «чёлку» (safe-area). Системную панель скрывает не компонент, а манифест (display: fullscreen).
 *
 * Если Battery API недоступен (iOS, Firefox) или заблокирован, справа просто ничего нет.
 * На iPhone в режиме «с домашнего экрана» системную панель скрыть нельзя, поэтому там рисуем только отступ под неё.
 */
export function CustomStatusBar() {
  const [now, setNow] = useState<Date | null>(null);
  const [battery, setBattery] = useState<BatteryInfo | null>(null);
  const [systemBarStays, setSystemBarStays] = useState(false);

  // Время: обновляем ровно на границе минуты, а не по таймеру раз в секунду.
  useEffect(() => {
    let id: number;
    const tick = () => {
      const d = new Date();
      setNow(d);
      id = window.setTimeout(tick, 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 50);
    };
    tick();
    return () => window.clearTimeout(id);
  }, []);

  // Заряд: безопасно, потому что getBattery может отсутствовать или быть запрещён политикой браузера.
  useEffect(() => {
    let cancelled = false;
    let manager: BatteryManager | null = null;
    const update = () => {
      if (manager) setBattery({ percent: Math.round(manager.level * 100), charging: manager.charging });
    };
    void (async () => {
      try {
        const nav = navigator as NavigatorWithBattery;
        setSystemBarStays(nav.standalone === true);
        if (typeof nav.getBattery !== "function") return;
        const m = await nav.getBattery();
        if (cancelled) return;
        manager = m;
        update();
        m.addEventListener("levelchange", update);
        m.addEventListener("chargingchange", update);
      } catch {
        // Заблокировано или не поддерживается: показываем только время.
      }
    })();
    return () => {
      cancelled = true;
      manager?.removeEventListener("levelchange", update);
      manager?.removeEventListener("chargingchange", update);
    };
  }, []);

  const spacer = <div aria-hidden="true" className="shrink-0 pt-[env(safe-area-inset-top)]" />;
  if (systemBarStays) return spacer;

  const low = battery !== null && !battery.charging && battery.percent <= LOW_PERCENT;

  return (
    <div className="shrink-0 select-none pt-[env(safe-area-inset-top)]">
      <div
        aria-hidden="true"
        className="pointer-events-none flex h-8 items-center justify-between px-(--layout-gutter) text-2xl leading-none text-[#6b4dff]"
        style={{ fontFamily: "var(--font-caveat), cursive" }}
      >
        <span className="tabular-nums">{now ? TIME_FORMAT.format(now) : ""}</span>
        {battery && (
          <span className={`flex items-center gap-0.5 tabular-nums ${low ? "text-[#ff7a90]" : ""}`}>
            {battery.charging && <Bolt className="h-4 w-2.5" />}
            {battery.percent}%
          </span>
        )}
      </div>
    </div>
  );
}
