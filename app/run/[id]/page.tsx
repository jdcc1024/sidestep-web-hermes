"use client";

import Link from "next/link";
import { use } from "react";
import { Logo } from "@/components/layout/Logo";
import { PublicOrderForm } from "@/components/run/PublicOrderForm";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Id } from "@/convex/_generated/dataModel";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default function PublicOrderFormPage({ params }: PageProps) {
  const { id } = use(params);
  const orderFormId = id as Id<"orderForms">;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-1">
            <Link
              href="/"
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
            >
              About Sidestep
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-10">
            <PublicOrderForm orderFormId={orderFormId} />
          </div>
        </div>
      </main>

      <footer className="border-t border-border bg-background">
        <div className="mx-auto max-w-2xl px-4 py-6 text-center text-xs text-muted-foreground sm:px-6">
          Powered by Sidestep — custom team jerseys, made in Vancouver.
        </div>
      </footer>
    </div>
  );
}
