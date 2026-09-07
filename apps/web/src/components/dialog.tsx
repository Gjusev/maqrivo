"use client";

import { useEffect, useRef, type ReactNode } from "react";

const PANEL_CLASSES =
  "sheet-panel relative w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl";

/** Elements considered when moving initial focus into the panel. */
const FOCUSABLE =
  "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])";

/**
 * Shared accessible modal shell: Escape and backdrop clicks close, body scroll
 * is locked while open, focus moves into the panel on open and returns to the
 * opener on close. The panel is a bottom sheet on mobile and a centered card
 * from sm:; pass `className` to resize it (e.g. a wide scrollable form).
 */
export function Dialog({
  open,
  onClose,
  closeLabel,
  labelledBy,
  className = PANEL_CLASSES,
  children,
}: {
  open: boolean;
  onClose: () => void;
  closeLabel: string;
  /** id of the element (usually the h2) that names the dialog. */
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  // Latest callback without re-running the open side effects below — callers
  // pass inline handlers, and focus must not be stolen on every re-render.
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    openerRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    if (panel) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      openerRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label={closeLabel}
        className="backdrop-fade absolute inset-0 bg-zinc-900/40"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={className}
      >
        {children}
      </div>
    </div>
  );
}
