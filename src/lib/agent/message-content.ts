export type MessagePart =
  | { type: "text" | "strong" | "em"; text: string }
  | { type: "link"; text: string; href: string };

/** Sólo enlaces web o rutas del ERP; nunca interpreta HTML ni esquemas ejecutables. */
function messageHref(value: string): string | null {
  if (/[\s\\\u0000-\u001f\u007f]/.test(value)) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (!/^https?:\/\/[^/]/i.test(value)) return null;
  try {
    const url = new URL(value);
    return url.username || url.password ? null : url.href;
  } catch { return null; }
}

/** Formato breve compatible con los mensajes guardados del chat y WhatsApp. */
export function parseMessageContent(text: string): MessagePart[] {
  const tokens = /\[([^\]\n]+)\]\(([^\s<>]+?)\)|https?:\/\/[^\s<>()]+|\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_/g;
  const parts: MessagePart[] = [];
  let offset = 0;
  for (const match of text.matchAll(tokens)) {
    const index = match.index;
    if (index > offset) parts.push({ type: "text", text: text.slice(offset, index) });
    const value = match[0];
    if (match[1] !== undefined) {
      const href = messageHref(match[2]);
      parts.push(href ? { type: "link", text: match[1], href } : { type: "text", text: value });
    } else if (/^https?:\/\//i.test(value)) {
      const url = value.replace(/[.,!?;:]+$/, "");
      const href = messageHref(url);
      parts.push(href ? { type: "link", text: url, href } : { type: "text", text: url });
      if (url.length < value.length) parts.push({ type: "text", text: value.slice(url.length) });
    } else if (value.startsWith("**")) {
      parts.push({ type: "strong", text: value.slice(2, -2) });
    } else if (value.startsWith("*")) {
      parts.push({ type: "strong", text: value.slice(1, -1) });
    } else {
      parts.push({ type: "em", text: value.slice(1, -1) });
    }
    offset = index + value.length;
  }
  if (offset < text.length) parts.push({ type: "text", text: text.slice(offset) });
  return parts;
}

/** Guarda un acceso de la herramienta en el texto para que sobreviva a una recarga. */
export function appendAppLink(text: string, value: unknown, appUrl: string): string {
  if (!value || typeof value !== "object") return text;
  const link = value as Record<string, unknown>;
  if (link.error) return text;
  if (typeof link.url !== "string" || typeof link.etiqueta !== "string") return text;
  const href = messageHref(link.url);
  if (!href) return text;
  try {
    const base = new URL(appUrl);
    const target = new URL(href, base);
    if (target.origin !== base.origin) return text;
    const present = parseMessageContent(text).some((part) => part.type === "link" && new URL(part.href, base).href === target.href);
    if (present) return text;
    const label = link.etiqueta.replace(/[\[\]\\\r\n]/g, " ").trim();
    if (!label) return text;
    const markdownUrl = target.href.replace(/\(/g, "%28").replace(/\)/g, "%29");
    return `${text.trim()}\n\n[${label}](${markdownUrl})`;
  } catch { return text; }
}
