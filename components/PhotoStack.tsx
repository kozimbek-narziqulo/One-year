"use client";

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Одна фотография стопки. Либо `src` (готовый адрес картинки), либо свой `renderPhoto` в пропсах:
 * так стопка может показывать фото, которые сами умеют загружаться из хранилища.
 */
export interface StackPhoto {
  id: string;
  src?: string;
  alt?: string;
}

type Props = {
  photos: readonly StackPhoto[];
  /** Как нарисовать содержимое фотографии. Без него используется обычный <img src>. */
  renderPhoto?: (photo: StackPhoto) => ReactNode;
  /**
   * Тап по верхней фотографии (не смахивание и не долгое нажатие): родитель открывает её на весь экран.
   * Событие дальше вверх не идёт, поэтому редактор записи от тапа по фото не открывается.
   */
  onPhotoOpen?: (id: string) => void;
  /** Удаление фото. Если передано, долгое нажатие на верхнее фото показывает крестик в углу. */
  onPhotoRemove?: (id: string) => void;
  className?: string;
};

// Пружина в стиле iOS: небольшой «перелёт» и возврат. Без библиотек, только CSS-переход.
const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";
const SPRING_MS = 520;
const FLY_MS = 260;
const SWIPE_DISTANCE_PX = 80;
const SWIPE_VELOCITY_PX_MS = 0.6;
const SWIPE_MIN_FAST_PX = 30;
const TAP_SLOP_PX = 6;
const VISIBLE_LAYERS = 4;
/** Сколько держать палец, чтобы появился крестик удаления. */
const LONG_PRESS_MS = 500;

/** Как лежит фото на своей глубине: смещение, наклон и масштаб. Нижние чуть выглядывают из-за верхней. */
const POSES = [
  { x: 0, y: 0, r: 0, s: 1 },
  { x: -7, y: 7, r: -4.5, s: 0.97 },
  { x: 9, y: 12, r: 4, s: 0.94 },
  { x: -4, y: 17, r: -2, s: 0.91 },
] as const;

/**
 * Стопка вертикальных фотографий (3:4) прямо на фоне приложения: без рамок, подложек и обводок, только скруглённые углы.
 * Верхнюю можно смахнуть влево или вправо: она улетает и пружинисто ложится в самый низ стопки.
 * Долгое нажатие на верхнюю показывает крестик в углу; нажатие на крестик удаляет фото.
 * Работает и с одной фотографией: тогда смахивания нет, а тап и долгое нажатие есть.
 */
export const PhotoStack = memo(function PhotoStack({ photos, renderPhoto, onPhotoOpen, onPhotoRemove, className = "" }: Props) {
  // Порядок фото в стопке: первое в списке лежит сверху.
  const [order, setOrder] = useState<string[]>(() => photos.map((p) => p.id));
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [flight, setFlight] = useState<-1 | 0 | 1>(0);
  /** id фото, над которым сейчас показан крестик удаления. */
  const [armed, setArmed] = useState<string | null>(null);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const press = useRef<{ x: number; y: number } | null>(null);
  const pressTimer = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);
  const moved = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const groupRef = useRef<HTMLDivElement>(null);
  const swipeable = photos.length > 1;

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(pressTimer.current);
    },
    [],
  );

  // Горизонтальный жест на стопке принадлежит только стопке: гасим «родную» прокрутку и оттяжку страницы.
  // React вешает touch-слушатели пассивными, и preventDefault там молча не работает, поэтому слушатель нативный и не пассивный.
  useEffect(() => {
    const el = groupRef.current;
    if (!el || !swipeable) return;
    let sx = 0;
    let sy = 0;
    let horizontal = false;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      sx = t.clientX;
      sy = t.clientY;
      horizontal = false;
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (!horizontal) {
        const dx = Math.abs(t.clientX - sx);
        const dy = Math.abs(t.clientY - sy);
        if (dx > 4 && dx > dy) horizontal = true;
      }
      if (horizontal && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
    };
  }, [swipeable]);

  // Крестик показан: касание в любом другом месте экрана его прячет.
  useEffect(() => {
    if (armed === null) return;
    const onDown = (e: PointerEvent) => {
      if (groupRef.current && e.target instanceof Node && groupRef.current.contains(e.target)) return;
      setArmed(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [armed]);

  // Если фото добавили или убрали, стопка подстраивается и сохраняет порядок оставшихся.
  const ordered = useMemo(() => {
    const present = new Set(photos.map((p) => p.id));
    const kept = order.filter((id) => present.has(id));
    const keptSet = new Set(kept);
    const added = photos.filter((p) => !keptSet.has(p.id)).map((p) => p.id);
    return [...kept, ...added];
  }, [order, photos]);
  const depthOf = useMemo(() => new Map(ordered.map((id, i) => [id, i] as const)), [ordered]);

  // Фото с крестиком удалили или оно ушло вниз стопки: крестик больше не нужен.
  const topIdForArm = ordered[0];
  useEffect(() => {
    if (armed !== null && armed !== topIdForArm) setArmed(null);
  }, [armed, topIdForArm]);

  const count = ordered.length;
  if (count === 0) return null;

  const topId = ordered[0];
  const currentIndex = photos.findIndex((p) => p.id === topId);

  /** Верхняя фотография улетает в сторону `dir`, затем уходит в самый низ стопки. */
  function fly(dir: 1 | -1) {
    if (count < 2 || flight !== 0) return;
    setArmed(null);
    setDragging(false);
    setFlight(dir);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const [top, ...rest] = ordered;
      if (top !== undefined) setOrder([...rest, top]);
      setFlight(0);
      setDrag({ x: 0, y: 0 });
    }, FLY_MS);
  }

  function cancelPress() {
    window.clearTimeout(pressTimer.current);
    press.current = null;
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Жест принадлежит стопке: не даём ему переключить экраны «Сегодня» / «Сад».
    e.stopPropagation();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (flight !== 0) return;
    moved.current = false;
    longPressed.current = false;

    // Долгое нажатие: через полсекунды без движения показываем крестик удаления.
    if (onPhotoRemove && topId !== undefined) {
      press.current = { x: e.clientX, y: e.clientY };
      window.clearTimeout(pressTimer.current);
      pressTimer.current = window.setTimeout(() => {
        press.current = null;
        longPressed.current = true;
        start.current = null;
        setDragging(false);
        setDrag({ x: 0, y: 0 });
        setArmed(topId);
        navigator.vibrate?.(12);
      }, LONG_PRESS_MS);
    }

    if (count < 2) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const p = press.current;
    if (p && (Math.abs(e.clientX - p.x) > TAP_SLOP_PX || Math.abs(e.clientY - p.y) > TAP_SLOP_PX)) {
      cancelPress();
      moved.current = true;
    }
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > TAP_SLOP_PX || Math.abs(dy) > TAP_SLOP_PX) {
      moved.current = true;
      if (armed !== null) setArmed(null);
    }
    setDrag({ x: dx, y: dy * 0.25 });
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) {
    cancelPress();
    const s = start.current;
    start.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!s) return;
    const dx = e.clientX - s.x;
    const speed = Math.abs(dx) / Math.max(1, performance.now() - s.t);
    const far = Math.abs(dx) > SWIPE_DISTANCE_PX;
    const fast = speed > SWIPE_VELOCITY_PX_MS && Math.abs(dx) > SWIPE_MIN_FAST_PX;
    if (!cancelled && !longPressed.current && (far || fast)) {
      fly(dx > 0 ? 1 : -1);
    } else {
      // Не дотянули: фото пружинисто возвращается на место.
      setDragging(false);
      setDrag({ x: 0, y: 0 });
    }
  }

  function onClick(e: React.MouseEvent<HTMLElement>) {
    // Клик по фото никогда не идёт выше: ни смахивание, ни тап не должны открывать редактор записи.
    e.stopPropagation();
    // После долгого нажатия или перетаскивания браузер всё равно шлёт click: гасим его.
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    if (moved.current) {
      moved.current = false;
      return;
    }
    // Крестик показан: обычный тап по фото просто его прячет.
    if (armed !== null) {
      setArmed(null);
      return;
    }
    if (topId !== undefined) onPhotoOpen?.(topId);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    // Клавиатурный аналог долгого нажатия: Delete или Backspace показывает крестик.
    if ((e.key === "Delete" || e.key === "Backspace") && onPhotoRemove && topId !== undefined) {
      e.preventDefault();
      e.stopPropagation();
      setArmed(topId);
      return;
    }
    if (e.key === "Escape" && armed !== null) {
      e.stopPropagation();
      setArmed(null);
      return;
    }
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    e.stopPropagation();
    if (topId !== undefined) onPhotoOpen?.(topId);
  }

  const interactive = Boolean(onPhotoOpen || onPhotoRemove);

  return (
    <div className={className}>
      <div
        ref={groupRef}
        role="group"
        aria-roledescription="стопка фотографий"
        aria-label={count > 1 ? `Фотографии: ${currentIndex + 1} из ${photos.length}` : "Фотография"}
        // Строго вертикальный формат 3:4. touch-pan-y: по вертикали страница листается, по горизонтали жест у стопки.
        className="relative mx-auto my-6 aspect-[3/4] w-[min(78%,18rem)] touch-pan-y overscroll-x-none"
      >
        {photos.map((photo) => {
          const depth = depthOf.get(photo.id) ?? 0;
          const isTop = depth === 0;
          const isArmed = isTop && armed === photo.id;
          const pose = POSES[Math.min(depth, POSES.length - 1)] ?? POSES[0];

          let transform = `translate(${pose.x}px, ${pose.y}px) rotate(${pose.r}deg) scale(${isArmed ? 0.97 : pose.s})`;
          let transition = `transform ${SPRING_MS}ms ${SPRING}, opacity 300ms ease-out`;
          if (isTop && flight !== 0) {
            // Улетает в сторону с наклоном. Дальше, уже внизу стопки, вернётся пружиной.
            transform = `translate(${flight * 120}%, ${drag.y}px) rotate(${flight * 20}deg)`;
            transition = `transform ${FLY_MS}ms cubic-bezier(0.22, 0.8, 0.3, 1)`;
          } else if (isTop && dragging && !longPressed.current) {
            // Идёт за пальцем без задержки, наклоняется по ходу движения.
            transform = `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 18}deg)`;
            transition = "none";
          }

          const label = photo.alt ?? "Фотография записи";

          return (
            <div
              key={photo.id}
              role={isTop && interactive ? "button" : "img"}
              tabIndex={isTop && interactive ? 0 : undefined}
              onKeyDown={isTop && interactive ? onKeyDown : undefined}
              aria-label={
                isTop && interactive
                  ? `${label}.${onPhotoOpen ? " Нажмите, чтобы открыть на весь экран." : ""}${onPhotoRemove ? " Удерживайте, чтобы удалить." : ""}`
                  : label
              }
              aria-hidden={isTop ? undefined : true}
              onPointerDown={isTop ? onPointerDown : undefined}
              onPointerMove={isTop ? onPointerMove : undefined}
              onPointerUp={isTop ? (e) => endDrag(e, false) : undefined}
              onPointerCancel={isTop ? (e) => endDrag(e, true) : undefined}
              onClick={isTop ? onClick : undefined}
              // Долгое нажатие не должно открывать системное меню картинки (Android) или превью (iOS).
              onContextMenu={(e) => e.preventDefault()}
              // Не даём браузеру начать «родное» перетаскивание картинки: оно отнимает жест у стопки.
              onDragStart={(e) => e.preventDefault()}
              // Никаких рамок, подложек и отступов: фото висит прямо на фоне, только скруглённые углы.
              className={`absolute inset-0 select-none overflow-hidden rounded-2xl [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent] motion-reduce:!transition-none ${
                isTop ? (count > 1 ? "cursor-grab touch-pan-y active:cursor-grabbing" : "cursor-pointer") : "pointer-events-none"
              }`}
              style={{
                transform,
                transition,
                zIndex: photos.length - depth,
                opacity: depth >= VISIBLE_LAYERS ? 0 : 1,
                willChange: "transform",
              }}
            >
              <div className="size-full [&_img]:pointer-events-none [&_img]:size-full [&_img]:object-cover">
                {renderPhoto ? (
                  renderPhoto(photo)
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.src} alt="" draggable={false} />
                )}
              </div>

              {isArmed && onPhotoRemove && (
                <button
                  type="button"
                  aria-label="Удалить фото"
                  // Нажатие на крестик не должно начинать жест стопки и не должно открывать запись.
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setArmed(null);
                    onPhotoRemove(photo.id);
                  }}
                  className="absolute right-2 top-2 grid size-10 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-transform duration-150 starting:scale-50 active:scale-90"
                >
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true" focusable={false}>
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <button
          type="button"
          onClick={(e) => {
            // Точки листают стопку, а не открывают запись, внутри которой лежат.
            e.stopPropagation();
            fly(-1);
          }}
          aria-label={`Следующее фото, сейчас ${currentIndex + 1} из ${photos.length}`}
          className="mx-auto flex items-center gap-2 rounded-full p-3 font-mono text-xs text-[#6b4dff]"
        >
          {photos.map((photo, i) => (
            <span
              key={photo.id}
              aria-hidden="true"
              className={`size-1.5 rounded-full bg-current transition-opacity duration-300 ${i === currentIndex ? "opacity-100" : "opacity-30"}`}
            />
          ))}
        </button>
      )}
    </div>
  );
});
