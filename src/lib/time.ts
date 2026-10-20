// Fechas en la zona horaria de la operación (CDMX). Vercel corre en UTC.
export const TZ = "America/Mexico_City";
export const DAY_MS = 86_400_000;

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function zonedParts(d: Date) {
  const p: Record<string, string> = {};
  for (const { type, value } of partsFmt.formatToParts(d)) p[type] = value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    weekday: WEEKDAYS.indexOf(p.weekday), // 0 = domingo
  };
}

/** Diferencia (ms) entre la hora local CDMX y UTC para un instante. */
function offsetMs(d: Date) {
  const p = zonedParts(d);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, d.getUTCSeconds(), d.getUTCMilliseconds());
  return asUtc - d.getTime();
}

/** Construye un instante a partir de fecha/hora locales de CDMX. */
export function zonedDate(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  return new Date(guess - offsetMs(new Date(guess)));
}

/** "YYYY-MM-DD" del día local. */
export function dayKey(d: Date | string): string {
  const p = zonedParts(typeof d === "string" ? new Date(d) : d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function fromDayKey(key: string, hour = 0, minute = 0): Date {
  const [y, m, d] = key.split("-").map(Number);
  return zonedDate(y, m, d, hour, minute);
}

export function startOfDay(d: Date): Date {
  const p = zonedParts(d);
  return zonedDate(p.year, p.month, p.day);
}

/** Lunes 00:00 de la semana local. */
export function startOfWeek(d: Date): Date {
  const p = zonedParts(d);
  const delta = (p.weekday + 6) % 7;
  return zonedDate(p.year, p.month, p.day - delta);
}

export function startOfMonth(d: Date): Date {
  const p = zonedParts(d);
  return zonedDate(p.year, p.month, 1);
}

export function addDays(d: Date, n: number): Date {
  const p = zonedParts(d);
  return zonedDate(p.year, p.month, p.day + n, p.hour, p.minute);
}

export function addMonths(d: Date, n: number): Date {
  const p = zonedParts(d);
  return zonedDate(p.year, p.month + n, 1);
}

/** Días calendario (locales) entre hoy y la fecha. Negativo = ya pasó. */
export function daysUntil(target: string | Date, now: Date): number {
  const a = startOfDay(now).getTime();
  const t = typeof target === "string" && target.length === 10 ? fromDayKey(target) : startOfDay(new Date(target));
  return Math.round((t.getTime() - a) / DAY_MS);
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

const dateFmt = new Intl.DateTimeFormat("es-MX", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
const shortFmt = new Intl.DateTimeFormat("es-MX", { timeZone: TZ, day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("es-MX", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const weekdayFmt = new Intl.DateTimeFormat("es-MX", { timeZone: TZ, weekday: "short" });
const longFmt = new Intl.DateTimeFormat("es-MX", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const monthFmt = new Intl.DateTimeFormat("es-MX", { timeZone: TZ, month: "long", year: "numeric" });
const monthShortFmt = new Intl.DateTimeFormat("es-MX", { timeZone: TZ, month: "short" });

const asDate = (d: Date | string) => (typeof d === "string" ? (d.length === 10 ? fromDayKey(d, 12) : new Date(d)) : d);

export const fmt = {
  date: (d: Date | string) => dateFmt.format(asDate(d)).replace(".", ""),
  short: (d: Date | string) => shortFmt.format(asDate(d)).replace(".", ""),
  time: (d: Date | string) => timeFmt.format(asDate(d)),
  dateTime: (d: Date | string) => `${shortFmt.format(asDate(d)).replace(".", "")} · ${timeFmt.format(asDate(d))}`,
  weekday: (d: Date | string) => weekdayFmt.format(asDate(d)).replace(".", ""),
  long: (d: Date | string) => longFmt.format(asDate(d)),
  month: (d: Date | string) => monthFmt.format(asDate(d)),
  monthShort: (d: Date | string) => monthShortFmt.format(asDate(d)).replace(".", ""),
};

export const money = (n: number, digits = 0) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: digits }).format(n);

export const num = (n: number, digits = 0) =>
  new Intl.NumberFormat("es-MX", { maximumFractionDigits: digits }).format(n);

/** Valor para <input type="datetime-local"> en hora CDMX. */
export function toLocalInput(d: Date): string {
  const p = zonedParts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function atLocal(base: Date, dayOffset: number, hour: number, minute = 0): Date {
  const p = zonedParts(base);
  return zonedDate(p.year, p.month, p.day + dayOffset, hour, minute);
}
