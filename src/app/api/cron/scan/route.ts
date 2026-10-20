import { getAdminDb } from "@/lib/db";
import { cronAuthorized } from "@/lib/cron";
import { runProactiveScan } from "@/lib/agent/proactive";
import { embedMissingKnowledge } from "@/lib/agent/knowledge";

export const maxDuration = 300;

/** Escaneo proactivo: estados, decisiones de agenda y alertas nuevas por WhatsApp. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("No autorizado", { status: 401 });
  const db = getAdminDb();
  const scan = await runProactiveScan(db, new Date());
  const embedded = await embedMissingKnowledge().catch(() => 0);
  return Response.json({ ok: true, ...scan, embedded });
}
