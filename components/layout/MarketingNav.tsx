"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Authenticated, Unauthenticated } from "convex/react";
import { MenuIcon } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeToggleCompare } from "@/components/theme-toggle-compare";
import { Logo } from "./Logo";

const navLinks = [
  { href: "/#customize", label: "Customize" },
  { href: "/#process", label: "Process" },
  { href: "/#pricing", label: "Pricing" },
];

export function MarketingNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const portalActive = isActive("/portal");

  const desktopSectionLinks = navLinks.map((link) => (
    <Link
      key={link.href}
      href={link.href}
      className="rounded-md px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
    >
      {link.label}
    </Link>
  ));

  const mobileSectionLinks = navLinks.map((link) => (
    <Link
      key={link.href}
      href={link.href}
      onClick={() => setMobileOpen(false)}
      className="block rounded-md px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
    >
      {link.label}
    </Link>
  ));

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Logo />

        <nav
          className="hidden items-center gap-1 sm:flex"
          aria-label="Main"
        >
          {desktopSectionLinks}
          <Unauthenticated>
            <Link
              href="/sign-in"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Sign in
            </Link>
            <Link
              href="/intake"
              className={cn(
                buttonVariants({ size: "sm" }),
                "ml-1 bg-teal-600 text-white hover:bg-teal-700",
              )}
            >
              Get a Quote
            </Link>
          </Unauthenticated>
          <Authenticated>
            <Link
              href="/portal"
              aria-current={portalActive ? "page" : undefined}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                portalActive
                  ? "bg-teal-500/15 text-teal-700 dark:text-teal-200"
                  : "text-foreground/80 hover:bg-accent hover:text-foreground"
              }`}
            >
              Portal
            </Link>
            <div className="ml-1 flex items-center">
              <UserButton />
            </div>
          </Authenticated>
          <ThemeToggleCompare />
        </nav>

        <div className="flex items-center gap-1 sm:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="Open menu">
                  <MenuIcon />
                </Button>
              }
            />
            <SheetContent
              side="right"
              className="flex w-72 flex-col gap-0 p-0"
            >
              <SheetHeader className="px-4 py-4">
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <Separator />
              <nav
                className="flex flex-1 flex-col gap-1 overflow-y-auto p-4"
                aria-label="Main"
              >
                {mobileSectionLinks}
                <Unauthenticated>
                  <Separator className="my-2" />
                  <Link
                    href="/sign-in"
                    onClick={() => setMobileOpen(false)}
                    className="block rounded-md px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/intake"
                    onClick={() => setMobileOpen(false)}
                    className="block rounded-md bg-teal-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
                  >
                    Get a Quote
                  </Link>
                </Unauthenticated>
                <Authenticated>
                  <Separator className="my-2" />
                  <Link
                    href="/portal"
                    onClick={() => setMobileOpen(false)}
                    aria-current={portalActive ? "page" : undefined}
                    className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      portalActive
                        ? "bg-teal-500/15 text-teal-700 dark:text-teal-200"
                        : "text-foreground/80 hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    Portal
                  </Link>
                </Authenticated>
              </nav>
              <Separator />
              <div className="flex items-center justify-between gap-3 p-4">
                <Authenticated>
                  <div className="flex items-center gap-3">
                    <UserButton />
                    <span className="text-sm text-muted-foreground">Account</span>
                  </div>
                </Authenticated>
                <Unauthenticated>
                  <span className="text-sm text-muted-foreground">Theme</span>
                </Unauthenticated>
                <ThemeToggleCompare />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
