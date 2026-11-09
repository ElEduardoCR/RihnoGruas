import { NextResponse } from "next/server";
import { webAgentContext } from "@/lib/agent/conversation";
import { hasOpenAI } from "@/lib/env";
import { createChatAttachment, DocumentError } from "@/lib/services/agent-documents";

export const maxDuration = 60;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Adjunta el archivo desde el chat de Rhino." }, { status: 403 });
  let context;
  try { context = await webAgentContext(); }
  catch { return NextResponse.json({ error: "Inicia sesión con una cuenta activa para adjuntar archivos." }, { status: 401 }); }
  if (!hasOpenAI) return NextResponse.json({ error: "Activa la IA para leer documentos desde el chat." }, { status: 400 });
  if (!new Set(["direccion", "administracion"]).has(context.staff.role)) return NextResponse.json({ error: "Sólo Dirección y Administración pueden registrar documentos del expediente." }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 3 * 1024 * 1024 + 64 * 1024) return NextResponse.json({ error: "Adjunta un archivo de hasta 3 MB." }, { status: 413 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 3 * 1024 * 1024) return NextResponse.json({ error: "Selecciona un PDF, JPG o PNG de hasta 3 MB." }, { status: 400 });
    const conversationId = form.get("conversationId");
    const uploadId = form.get("uploadId");
    if (typeof conversationId !== "string" || typeof uploadId !== "string") return NextResponse.json({ error: "Abre una conversación y vuelve a adjuntar el archivo." }, { status: 400 });
    const attachment = await createChatAttachment(context.db, context.staff, { conversationId, uploadId, filename: file.name, contentType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
    return NextResponse.json({ attachment: { id: attachment.id, fileName: attachment.file_name, mimeType: attachment.content_type, size: attachment.byte_size } });
  } catch (error) {
    if (error instanceof DocumentError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[agent-attachment] upload failed");
    return NextResponse.json({ error: "No se pudo guardar el archivo. Inténtalo de nuevo." }, { status: 500 });
  }
}
