// Configuración central. Sin Supabase configurado, la app corre en modo demo
// (datos en memoria generados en src/lib/demo/seed.ts).

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",

  openaiKey: process.env.OPENAI_API_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-5-mini",
  openaiVisionModel: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini",
  openaiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",

  waToken: process.env.WHATSAPP_TOKEN ?? "",
  waPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
  waVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
  waAppSecret: process.env.WHATSAPP_APP_SECRET ?? "",
  waApiVersion: process.env.WHATSAPP_API_VERSION || "v23.0",
  waAlertTemplate: process.env.WHATSAPP_ALERT_TEMPLATE ?? "",
  waTemplateLang: process.env.WHATSAPP_TEMPLATE_LANG || "es_MX",

  cronSecret: process.env.CRON_SECRET ?? "",
  // En Vercel, si no se define APP_URL se usa el dominio de producción del proyecto
  appUrl: (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
    (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
    "http://localhost:3000"
  ).replace(/\/$/, ""),

  // Reglas de negocio ajustables
  authorizeAboveMxn: Number(process.env.INVENTORY_AUTHORIZE_ABOVE_MXN || 5000),
};

export const isDemo =
  process.env.DEMO_MODE === "1" || !env.supabaseUrl || !env.supabaseServiceKey || !env.supabaseAnonKey;

export const hasOpenAI = Boolean(env.openaiKey);
export const hasWhatsApp = Boolean(env.waToken && env.waPhoneNumberId);
