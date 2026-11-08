import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { AgentChat } from "@/components/agent-chat";
import { currentStaff } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { webAgentContext, webConversation } from "@/lib/agent/conversation";
import { hasOpenAI, isDemo } from "@/lib/env";
import { ROLE_LABELS } from "@/lib/labels";

export const metadata = { title: "Asistente Rhino" };
export const maxDuration = 300;

export default function HomePage() {
  return <Suspense fallback={<div role="status" className="grid h-full place-items-center text-sm text-muted">Preparando tu espacio de trabajo…</div>}><Workspace /></Suspense>;
}

async function Workspace() {
  await connection();
  const me = await currentStaff(await getDb());
  if (!me?.active) return (
    <div className="grid h-full place-content-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-semibold">Tu espacio con Rhino</h1>
      <p className="text-muted">Necesitas una cuenta activa del equipo para usar el asistente.</p>
      <Link href="/login" className="font-medium text-rhino-600 underline">Iniciar sesión</Link>
    </div>
  );
  const conversation = await webConversation(await webAgentContext());
  return <AgentChat
    initial={conversation.messages}
    initialPending={conversation.pending}
    user={{ name: me.full_name, role: me.role, roleLabel: ROLE_LABELS[me.role] }}
    ai={hasOpenAI}
    demo={isDemo}
  />;
}
