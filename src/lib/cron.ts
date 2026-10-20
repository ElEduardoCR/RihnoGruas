import { env } from "@/lib/env";

/** Vercel Cron envía "Authorization: Bearer $CRON_SECRET". */
export function cronAuthorized(req: Request) {
  if (!env.cronSecret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${env.cronSecret}`;
}
