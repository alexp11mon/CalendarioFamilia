import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageShell } from "@/components/calendar/page-shell";
import { IcloudConnectForm } from "@/components/connections/icloud-connect-form";
import { IcloudNotice } from "@/components/connections/icloud-notice";
import { ProviderNotice } from "@/components/connections/provider-notice";
import { requireUser } from "@/lib/calendar/queries";
import { getConnection } from "@/lib/sync/queries";
import { connectionIdSchema } from "@/lib/sync/schemas";
import { connectIcloud } from "../actions";

export const metadata: Metadata = { title: "Conectar una cuenta" };

type Search = Promise<{ provider?: string; reconnect?: string }>;

/** The Apple ID of the user's own iCloud account to reconnect (spec 018 RF-62). */
async function reconnectAppleId(id: string | undefined): Promise<string> {
  if (!id || !connectionIdSchema.safeParse(id).success) return "";
  const { supabase } = await requireUser();
  const connection = await getConnection(supabase, id);
  return connection?.provider === "icloud" ? connection.email : "";
}

async function Connect({ searchParams }: { searchParams: Search }) {
  const { provider, reconnect } = await searchParams;
  if (provider === "google") {
    return (
      <PageShell
        title="Conectar Google"
        backHref="/dashboard/connections"
        backLabel="Volver a Cuentas conectadas"
      >
        <ProviderNotice />
      </PageShell>
    );
  }
  if (provider !== "icloud") notFound();
  return (
    <PageShell
      title="Conectar iCloud"
      backHref="/dashboard/connections"
      backLabel="Volver a Cuentas conectadas"
    >
      <IcloudNotice />
      <IcloudConnectForm
        action={connectIcloud}
        appleId={await reconnectAppleId(reconnect)}
      />
    </PageShell>
  );
}

/** Google's notice before its consent screen (spec 007 RF-48), or iCloud's form (spec 018 RF-2 to RF-7). */
export default function NewConnectionPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  return (
    <Suspense fallback={null}>
      <Connect searchParams={searchParams} />
    </Suspense>
  );
}
