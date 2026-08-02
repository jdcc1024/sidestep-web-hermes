"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { MenuIcon } from "lucide-react";
import { motion } from "motion/react";

import { Logo } from "./Logo";
import { SPRING_SPOTLIGHT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeToggleCompare } from "@/components/theme-toggle-compare";

type PortalLink = {
  href: string;
  label: string;
  exact?: boolean;
};

/**
 * Every href here must resolve to a real page — `PortalShell.test.tsx` checks
 * each one against `app/`.
 *
 * There is deliberately no "Jersey Runs" section: a run belongs to an order, so
 * the captain reaches setup and responses from `/portal/orders/[id]`, and runs
 * they have *responded* to are listed on `/portal` itself. A top-level section
 * would only re-list orders.
 */
const portalLinks: PortalLink[] = [
  { href: "/portal", label: "My Orders", exact: true },
  { href: "/portal/designs", label: "My Designs" },
];

const isActive = (link: PortalLink, pathname: string) =>
  link.exact
    ? pathname === link.href
    : pathname === link.href || pathname.startsWith(`${link.href}/`);

/** The pill behind the current link — as a moving box, or as a flat class. */
const ACTIVE_PILL = "bg-teal-50 dark:bg-teal-500/15";

/**
 * The portal's section links.
 *
 * `sliding` decides how the current link is filled in. In the desktop sidebar
 * the pill is a `layoutId` box that travels from the old link to the new one on
 * client-side navigation — `PortalShell` is the `/portal` layout, so it does not
 * remount between sections and the box survives to animate. In the mobile sheet
 * the same pill is a plain background class, for two reasons: the sheet closes
 * on navigation so there is nothing to watch, and a second element sharing one
 * `layoutId` would leave Motion animating between two copies of the same nav.
 */
function PortalNav({
  pathname,
  sliding,
  onNavigate,
}: {
  pathname: string;
  sliding: boolean;
  onNavigate: () => void;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {portalLinks.map((link) => {
        const active = isActive(link, pathname);
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "text-teal-700 dark:text-teal-200"
                  : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
                active && !sliding && ACTIVE_PILL,
              )}
            >
              {active && sliding && (
                <motion.span
                  layoutId="portal-nav-indicator"
                  data-testid="portal-nav-indicator"
                  aria-hidden="true"
                  transition={SPRING_SPOTLIGHT}
                  className={cn(
                    "pointer-events-none absolute inset-0 rounded-md",
                    ACTIVE_PILL,
                  )}
                />
              )}
              {/* Positioned, and after the pill in the DOM, so the label paints
                  over it without either one needing a z-index. */}
              <span className="relative">{link.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const accountFooter = (
    <div className="flex items-center gap-3">
      <UserButton />
      <span className="text-sm text-zinc-600 dark:text-zinc-400">Account</span>
    </div>
  );

  return (
    <div className="relative flex min-h-screen flex-1 bg-zinc-50 dark:bg-zinc-950">
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900 lg:hidden">
        <Logo />
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <MenuIcon />
              </Button>
            }
          />
          <SheetContent
            side="left"
            className="flex w-72 flex-col gap-0 bg-white p-0 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <SheetHeader className="px-4 py-4">
              <SheetTitle>Portal</SheetTitle>
            </SheetHeader>
            <Separator />
            <nav
              className="flex-1 overflow-y-auto p-4"
              aria-label="Portal navigation"
            >
              <PortalNav
                pathname={pathname}
                sliding={false}
                onNavigate={() => setMobileOpen(false)}
              />
            </nav>
            <Separator />
            <div className="flex items-center justify-between gap-3 p-4">
              {accountFooter}
              <ThemeToggleCompare />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <aside
        aria-label="Portal"
        className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 lg:flex"
      >
        <div className="flex h-16 items-center justify-between gap-2 px-4">
          <Logo />
          <ThemeToggleCompare />
        </div>
        <Separator />
        <nav
          className="flex-1 overflow-y-auto p-4"
          aria-label="Portal navigation"
        >
          <PortalNav
            pathname={pathname}
            sliding
            onNavigate={() => setMobileOpen(false)}
          />
        </nav>
        <Separator />
        <div className="p-4">{accountFooter}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pt-14 lg:ml-64 lg:pt-0">
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
