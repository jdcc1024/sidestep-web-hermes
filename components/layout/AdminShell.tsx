"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { MenuIcon } from "lucide-react";

import { Logo } from "./Logo";
import { Badge } from "@/components/ui/badge";
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

type AdminLink = {
  href: string;
  label: string;
  exact?: boolean;
};

const adminLinks: AdminLink[] = [
  { href: "/admin/orders", label: "All Orders" },
  { href: "/admin/jersey-runs", label: "Jersey Runs" },
  { href: "/admin/designs", label: "All Designs" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/leads", label: "Leads" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (link: AdminLink) =>
    link.exact
      ? pathname === link.href
      : pathname === link.href || pathname.startsWith(`${link.href}/`);

  const adminBadge = (
    <Badge
      variant="secondary"
      className="bg-rose-100 text-rose-700 hover:bg-rose-100 dark:bg-rose-500/20 dark:text-rose-200"
    >
      Admin
    </Badge>
  );

  const navList = (
    <ul className="flex flex-col gap-1">
      {adminLinks.map((link) => {
        const active = isActive(link);
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              onClick={() => setMobileOpen(false)}
              aria-current={active ? "page" : undefined}
              className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-200"
                  : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  const accountFooter = (
    <div className="flex items-center gap-3">
      <UserButton />
      <span className="text-sm text-zinc-600 dark:text-zinc-400">
        Admin account
      </span>
    </div>
  );

  return (
    <div className="relative flex min-h-screen flex-1 bg-zinc-50 dark:bg-zinc-950">
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900 lg:hidden">
        <div className="flex items-center gap-2">
          <Logo />
          {adminBadge}
        </div>
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
              <SheetTitle className="flex items-center gap-2">
                Admin {adminBadge}
              </SheetTitle>
            </SheetHeader>
            <Separator />
            <nav
              className="flex-1 overflow-y-auto p-4"
              aria-label="Admin navigation"
            >
              {navList}
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
        aria-label="Admin"
        className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 lg:flex"
      >
        <div className="flex h-16 items-center justify-between gap-2 px-4">
          <div className="flex items-center gap-2">
            <Logo />
            {adminBadge}
          </div>
          <ThemeToggleCompare />
        </div>
        <Separator />
        <nav
          className="flex-1 overflow-y-auto p-4"
          aria-label="Admin navigation"
        >
          {navList}
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
