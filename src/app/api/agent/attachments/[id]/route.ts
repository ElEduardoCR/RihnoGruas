import { webAgentContext } from "@/lib/agent/conversation";
import { requireOwnedAttachment } from "@/lib/services/agent-documents";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db, staff } = await webAgentContext();
    const { id } = await params;
    const attachment = await requireOwnedAttachment(db, staff, id);
    const file = await db.download("chat-adjuntos", attachment.storage_path);
    if (!file) return new Response("Archivo no disponible", { status: 404 });
    return new Response(Buffer.from(file.bytes), { headers: {
      "Content-Type": attachment.content_type,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.file_name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch { return new Response("Archivo no disponible para esta cuenta", { status: 404 }); }
}
