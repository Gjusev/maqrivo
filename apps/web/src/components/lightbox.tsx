"use client";

import { useEffect, useRef, useState } from "react";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
/** 0.25 per wheel notch — four notches span half the zoom range. */
const WHEEL_STEP = 0.25;
const DOUBLE_CLICK_SCALE = 2.5;

/** Zoom stepper, pure so the wheel path stays unit-testable. */
export function nextScale(current: number, deltaY: number): number {
  const next = current + (deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP);
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
}

type View = { scale: number; x: number; y: number };

const RESET: View = { scale: MIN_SCALE, x: 0, y: 0 };

/**
 * Fullscreen in-app viewer: wheel zoom (1–4×), drag to pan when zoomed,
 * double-click toggles 1 ↔ 2.5, Escape or backdrop tap closes, body scroll
 * stays locked while open. No dependencies.
 */
export function Lightbox({
  src,
  alt,
  closeLabel,
  onClose,
}: {
  src: string;
  alt: string;
  closeLabel: string;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>(RESET);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );

  // Escape closes; the page behind cannot scroll while open.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // React's synthetic wheel event is passive, so preventDefault there is
  // ignored and the page behind would scroll while zooming — attach native.
  useEffect(() => {
    const el = imageRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      setView((v) => {
        const scale = nextScale(v.scale, e.deltaY);
        if (scale === v.scale) return v;
        return scale === MIN_SCALE ? RESET : { ...v, scale };
      });
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function onDoubleClick() {
    setView((v) => (v.scale === MIN_SCALE ? { scale: DOUBLE_CLICK_SCALE, x: 0, y: 0 } : RESET));
  }

  // Pan only makes sense zoomed in; at 1× the image already fits the screen.
  function onPointerDown(e: React.PointerEvent<HTMLImageElement>) {
    if (view.scale <= MIN_SCALE) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: view.x,
      baseY: view.y,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLImageElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setView((v) => ({ ...v, x: drag.baseX + (e.clientX - drag.startX), y: drag.baseY + (e.clientY - drag.startY) }));
  }

  function endDrag(e: React.PointerEvent<HTMLImageElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="backdrop-fade fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/90"
    >
      <button
        type="button"
        aria-label={closeLabel}
        onClick={onClose}
        className="absolute inset-0 block size-full cursor-zoom-out"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated, non-optimized local upload */}
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        draggable={false}
        onDoubleClick={onDoubleClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative max-h-screen max-w-full touch-none select-none object-contain"
        style={{
          transform: `translate(${String(view.x)}px, ${String(view.y)}px) scale(${String(view.scale)})`,
          cursor: view.scale > MIN_SCALE ? "grab" : "zoom-in",
        }}
      />
    </div>
  );
}
