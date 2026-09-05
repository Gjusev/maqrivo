"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { MORE_NAV, NAV_ITEMS, PRIMARY_NAV, type NavItem } from "@/lib/nav";
import { DotsNineIcon } from "@phosphor-icons/react/dist/csr/DotsNine";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { SignOutIcon } from "@phosphor-icons/react/dist/csr/SignOut";
import { signOut } from "@/lib/auth-client";

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function DesktopSidebar({ onSignOut }: { onSignOut: () => void }) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-zinc-200 bg-white md:flex">
      <div className="px-5 py-5">
        <span className="text-lg font-bold tracking-tight text-zinc-900">Maqrivo</span>
      </div>
      <nav className="flex-1 space-y-0.5 px-3" aria-label={t("openMenu")}>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.key} item={item} active={isActive(pathname, item.href)} />
        ))}
      </nav>
      <div className="border-t border-zinc-200 p-3">
        <button type="button" onClick={onSignOut} className="btn-ghost w-full justify-start text-zinc-500">
          <SignOutIcon size={18} aria-hidden />
          {t("signOut")}
        </button>
      </div>
    </aside>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const t = useTranslations("Nav");
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
        active ? "bg-brand-50 text-brand-800" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
      }`}
      aria-current={active ? "page" : undefined}
    >
      <Icon size={19} aria-hidden />
      {t(item.key)}
    </Link>
  );
}

function BottomNav({ onOpenMore }: { onOpenMore: () => void }) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  return (
    <nav
      className="sticky bottom-0 z-40 grid grid-cols-5 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label={t("openMenu")}
    >
      {PRIMARY_NAV.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
              active ? "text-brand-700" : "text-zinc-500"
            }`}
          >
            <Icon size={21} aria-hidden />
            {t(item.key)}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onOpenMore}
        className="flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium text-zinc-500"
        aria-label={t("more")}
      >
        <DotsNineIcon size={21} aria-hidden />
        {t("more")}
      </button>
    </nav>
  );
}

function MoreSheet({ open, onClose, onSignOut }: { open: boolean; onClose: () => void; onSignOut: () => void }) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={t("more")}>
      <button type="button" aria-label={t("closeMenu")} className="backdrop-fade absolute inset-0 bg-zinc-900/40" onClick={onClose} />
      <div className="sheet-panel absolute inset-x-0 bottom-0 rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-xl">
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="text-sm font-semibold text-zinc-900">{t("more")}</span>
          <button type="button" onClick={onClose} className="btn-ghost px-2" aria-label={t("closeMenu")}>
            <XIcon size={18} aria-hidden />
          </button>
        </div>
        <nav className="grid grid-cols-3 gap-2 p-4">
          {MORE_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onClose}
                className={`flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border text-xs font-medium ${
                  active
                    ? "border-brand-200 bg-brand-50 text-brand-800"
                    : "border-zinc-200 bg-zinc-50 text-zinc-600"
                }`}
              >
                <Icon size={22} aria-hidden />
                {t(item.key)}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-zinc-100 p-3">
          <button type="button" onClick={onSignOut} className="btn-ghost w-full justify-start text-zinc-500">
            <SignOutIcon size={18} aria-hidden />
            {t("signOut")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false);

  const handleSignOut = () => {
    void signOut();
  };

  return (
    <div className="flex min-h-[100dvh]">
      <DesktopSidebar onSignOut={handleSignOut} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-6 pt-4 md:px-8 md:pt-8">{children}</main>
        <BottomNav onOpenMore={() => setMoreOpen(true)} />
        <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} onSignOut={handleSignOut} />
      </div>
    </div>
  );
}
