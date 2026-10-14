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
   * Тап по верхней фотографии (не смахивание): родитель открывает её на весь экран. Событие дальше вверх не идёт,
   * поэтому редактор записи от тапа по фото не открывается.
   */
  onPhotoOpen?: (id: string) => void;
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

/** Как лежит фото на своей глубине: смещение, наклон и масштаб. Нижние чуть выглядывают из-за верхней. */
const POSES = [
  { x: 0, y: 0, r: 0, s: 1 },
  { x: -7, y: 7, r: -4.5, s: 0.97 },
  { x: 9, y: 12, r: 4, s: 0.94 },
  { x: -4, y: 17, r: -2, s: 0.91 },
] as const;

/**
 * Стопка фотографий как полароиды. Верхнюю можно смахнуть влево или вправо (пальцем или мышью):
 * она улетает и пружинисто ложится в самый низ стопки, открывая следующую. Ни одна фотография не пропадает.
 * Точка под стопкой делает то же самое по нажатию, для тех, кому жест неудобен.
 */
export const PhotoStack = memo(function PhotoStack({ photos, renderPhoto, onPhotoOpen, className = "" }: Props) {
  // Порядок фото в стопке: первое в списке лежит сверху.
  const [order, setOrder] = useState<string[]>(() => photos.map((p) => p.id));
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [flight, setFlight] = useState<-1 | 0 | 1>(0);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const moved = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const groupRef = useRef<HTMLDivElement>(null);
  const swipeable = photos.length > 1;

  useEffect(() => () => window.clearTimeout(timer.current), []);

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

  // Если фото добавили или убрали (редактирование записи), стопка подстраивается и сохраняет порядок оставшихся.
  const ordered = useMemo(() => {
    const present = new Set(photos.map((p) => p.id));
    const kept = order.filter((id) => present.has(id));
    const keptSet = new Set(kept);
    const added = photos.filter((p) => !keptSet.has(p.id)).map((p) => p.id);
    return [...kept, ...added];
  }, [order, photos]);
  const depthOf = useMemo(() => new Map(ordered.map((id, i) => [id, i] as const)), [ordered]);

  const count = ordered.length;
  if (count === 0) return null;

  const topId = ordered[0];
  const currentIndex = photos.findIndex((p) => p.id === topId);

  /** Верхняя фотография улетает в сторону `dir`, затем уходит в самый низ стопки. */
  function fly(dir: 1 | -1) {
    if (count < 2 || flight !== 0) return;
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

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (count < 2 || flight !== 0) return;
    // Жест принадлежит стопке: не даём ему переключить экраны «Сегодня» / «Сад».
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    moved.current = false;
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > TAP_SLOP_PX || Math.abs(dy) > TAP_SLOP_PX) moved.current = true;
    setDrag({ x: dx, y: dy * 0.25 });
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) {
    const s = start.current;
    start.current = null;
    if (!s) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const dx = e.clientX - s.x;
    const speed = Math.abs(dx) / Math.max(1, performance.now() - s.t);
    const far = Math.abs(dx) > SWIPE_DISTANCE_PX;
    const fast = speed > SWIPE_VELOCITY_PX_MS && Math.abs(dx) > SWIPE_MIN_FAST_PX;
    if (!cancelled && (far || fast)) {
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
    // После перетаскивания браузер всё равно шлёт click: просто гасим его.
    if (moved.current) {
      moved.current = false;
      return;
    }
    if (topId !== undefined) onPhotoOpen?.(topId);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    e.stopPropagation();
    if (topId !== undefined) onPhotoOpen?.(topId);
  }

  return (
    <div className={className}>
      <div
        ref={groupRef}
        role="group"
        aria-roledescription="стопка фотографий"
        aria-label={`Фотографии: ${currentIndex + 1} из ${photos.length}`}
        // touch-pan-y: по вертикали страница листается, по горизонтали жест остаётся у стопки. overscroll-x-none: без оттяжки вбок.
        className="relative mx-auto my-6 aspect-[4/5] w-[min(78%,18rem)] touch-pan-y overscroll-x-none"
      >
        {photos.map((photo) => {
          const depth = depthOf.get(photo.id) ?? 0;
          const isTop = depth === 0;
          const pose = POSES[Math.min(depth, POSES.length - 1)] ?? POSES[0];

          let transform = `translate(${pose.x}px, ${pose.y}px) rotate(${pose.r}deg) scale(${pose.s})`;
          let transition = `transform ${SPRING_MS}ms ${SPRING}, opacity 300ms ease-out`;
          if (isTop && flight !== 0) {
            // Улетает в сторону с наклоном. Дальше, уже внизу стопки, вернётся пружиной.
            transform = `translate(${flight * 120}%, ${drag.y}px) rotate(${flight * 20}deg)`;
            transition = `transform ${FLY_MS}ms cubic-bezier(0.22, 0.8, 0.3, 1)`;
          } else if (isTop && dragging) {
            // Идёт за пальцем без задержки, наклоняется по ходу движения.
            transform = `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 18}deg)`;
            transition = "none";
          }

          return (
            <div
              key={photo.id}
              // Верхнее фото открывается на весь экран, поэтому для клавиатуры и скринридера это кнопка; нижние лишь картинки.
              role={isTop && onPhotoOpen ? "button" : "img"}
              tabIndex={isTop && onPhotoOpen ? 0 : undefined}
              onKeyDown={isTop && onPhotoOpen ? onKeyDown : undefined}
              aria-label={isTop && onPhotoOpen ? `Открыть на весь экран. ${photo.alt ?? "Фотография записи"}` : (photo.alt ?? "Фотография записи")}
              aria-hidden={isTop ? undefined : true}
              onPointerDown={isTop ? onPointerDown : undefined}
              onPointerMove={isTop ? onPointerMove : undefined}
              onPointerUp={isTop ? (e) => endDrag(e, false) : undefined}
              onPointerCancel={isTop ? (e) => endDrag(e, true) : undefined}
              onClick={isTop ? onClick : undefined}
              // Не даём браузеру начать «родное» перетаскивание картинки: оно отнимает жест у стопки.
              onDragStart={(e) => e.preventDefault()}
              className={`absolute inset-0 select-none rounded-2xl border border-[#5b3dff]/40 bg-[#16103f] p-2 pb-8 shadow-[0_10px_28px_rgba(0,0,0,0.5)] motion-reduce:!transition-none ${
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
              <div className="size-full overflow-hidden rounded-lg [&_img]:size-full [&_img]:object-cover">
                {renderPhoto ? (
                  renderPhoto(photo)
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.src} alt="" draggable={false} />
                )}
              </div>
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
