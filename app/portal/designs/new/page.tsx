import Link from "next/link";
import { DesignForm } from "@/components/portal/DesignForm";

export const metadata = {
  title: "New design — Sidestep portal",
};

export default function NewDesignPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <Link
        href="/portal"
        className="text-sm font-medium text-teal-700 hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
      >
        ← Back to dashboard
      </Link>
      <header className="mt-3">
        <p className="text-sm font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
          New design
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Tell us what you&apos;re thinking.
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Upload logos, mood boards, or reference photos — and write an
          overview so Sidestep can start with your vibe in mind.
        </p>
      </header>

      <div className="mt-10">
        <DesignForm />
      </div>
    </div>
  );
}
