import Link from "next/link";
import { OrderDetailsForm } from "@/components/portal/OrderDetailsForm";

export const metadata = {
  title: "New order — Sidestep portal",
};

export default function NewOrderPage() {
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
          New order
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Tell us about your team.
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          A few details about the jerseys and your team is all we need to get
          started. You can link existing designs to this order, or add them
          after.
        </p>
      </header>

      <div className="mt-10">
        <OrderDetailsForm />
      </div>
    </div>
  );
}
