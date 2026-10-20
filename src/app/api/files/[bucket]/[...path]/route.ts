import type { NextRequest } from "next/server";
import { getAdminDb } from "@/lib/db";
import { createUserSupabase } from "@/lib/db";
import { isDemo } from "@/lib/env";
import type { Bucket } from "@/lib/db/types";

// Sirve evidencias y documentos privados. Requiere sesión de personal
// (o token de la revisión cuando lo pide el wizard).
export async function GET(req: NextRequest, ctx: { params: Promise<{ bucket: string; path: string[] }> }) {
  const { bucket, path } = await ctx.params;
  if (bucket !== "evidencias" && bucket !== "documentos") return new Response("No encontrado", { status: 404 });
  const filePath = path.map(decodeURIComponent).join("/");

  if (!isDemo) {
    const supabase = await createUserSupabase();
    const { data } = await supabase.auth.getUser();
    const token = req.nextUrl.searchParams.get("t");
    let allowed = Boolean(data.user);
    if (!allowed && token && bucket === "evidencias") {
      const db = getAdminDb();
      const insp = await db.select("inspections", { eq: { access_token: token }, limit: 1 });
      allowed = Boolean(insp[0] && filePath.startsWith(`${insp[0].id}/`));
    }
    if (!allowed) return new Response("No autorizado", { status: 401 });
  }

  const file = await getAdminDb().download(bucket as Bucket, filePath);
  if (file) {
    return new Response(Buffer.from(file.bytes), {
      headers: { "Content-Type": file.contentType, "Cache-Control": "private, max-age=3600" },
    });
  }
  if (isDemo && filePath.startsWith("demo/")) return placeholder(filePath);
  return new Response("No encontrado", { status: 404 });
}

/** Foto simulada para los datos de demostración. */
function placeholder(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const tone = 30 + (h % 25);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(0 0% ${tone + 12}%)"/><stop offset="1" stop-color="hsl(0 0% ${tone - 10}%)"/></linearGradient></defs>
  <rect width="640" height="480" fill="url(#g)"/>
  <g fill="none" stroke="rgba(255,255,255,.35)" stroke-width="10" stroke-linecap="round">
    <path d="M${120 + (h % 80)} 360 L${360 + (h % 120)} ${120 + (h % 60)}"/><path d="M80 380h480"/>
  </g>
  <rect x="${200 + (h % 160)}" y="${250 - (h % 60)}" width="90" height="70" rx="8" fill="#e3261b" opacity=".85"/>
  <text x="24" y="452" font-family="-apple-system,Helvetica,Arial" font-size="20" fill="rgba(255,255,255,.75)">Evidencia (demo)</text>
</svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" } });
}
