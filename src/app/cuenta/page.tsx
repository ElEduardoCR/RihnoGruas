import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ChevronLeft } from "lucide-react";
import { createUserSupabase } from "@/lib/db";
import { isDemo } from "@/lib/env";
import { RhinoMark } from "@/components/brand";
import { PasswordForm } from "./form";

export const metadata = { title: "Mi cuenta" };

export default function AccountPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-[var(--shadow-card)]">
        <Link href="/" className="mb-6 inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink">
          <ChevronLeft className="size-4" /> Volver
        </Link>
        <RhinoMark className="size-11" />
        <h1 className="mt-6 text-[28px] font-semibold">Mi cuenta</h1>
        <Suspense fallback={<div className="skeleton mt-4 h-6 w-48" />}>
          <Who />
        </Suspense>
        <div className="mt-8">
          <PasswordForm />
        </div>
      </div>
    </div>
  );
}

async function Who() {
  await connection();
  if (isDemo) return <p className="mt-1 text-[15px] text-muted">Modo demo: no hay cuentas de acceso.</p>;
  const { data } = await (await createUserSupabase()).auth.getUser();
  return <p className="mt-1 text-[15px] text-muted">{data.user?.email}</p>;
}
