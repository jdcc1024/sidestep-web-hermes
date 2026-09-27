import { currentUser } from "@clerk/nextjs/server";
import { AdminShell } from "@/components/layout/AdminShell";
import { AdminAuthGate } from "@/components/layout/AdminAuthGate";
import { AdminFlagReconciler } from "@/components/layout/UserSync";
import { isAdminFromClerk } from "@/lib/adminFlag";

// Reads Clerk private metadata server-side — it is never sent to the client.
// Only the resulting boolean reaches the reconciler, which uses it to decide
// whether the Convex cache needs a refresh, never as the value to store.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  const isAdmin = isAdminFromClerk(user?.privateMetadata);

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center bg-background">
        <AdminFlagReconciler clerkSaysAdmin={false} />
        <div className="text-center">
          <p className="text-xl font-semibold text-foreground">
            403 — Access Denied
          </p>
          <p className="mt-2 text-muted-foreground">
            You do not have permission to access this area.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AdminShell>
      <AdminFlagReconciler clerkSaysAdmin />
      <AdminAuthGate>{children}</AdminAuthGate>
    </AdminShell>
  );
}
