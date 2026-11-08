import { addDays, dayKey, fromDayKey, startOfDay, startOfMonth, startOfWeek } from "./time";

export interface CalendarSearchParams {
  view?: string;
  m?: string;
  w?: string;
  d?: string;
}

/** Rechaza fechas incompletas o normalizadas, como 2026-02-31. */
function validDay(value: string | undefined): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  try {
    const date = fromDayKey(value);
    return Number.isFinite(date.getTime()) && dayKey(date) === value ? date : null;
  } catch {
    return null;
  }
}

function validMonth(value: string | undefined): Date | null {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value) ? validDay(`${value}-01`) : null;
}

const within = (date: Date, start: Date, end: Date) => date >= start && date < end;

/** La selección siempre queda dentro del rango de eventos que consulta la vista. */
export function resolveCalendarRange(sp: CalendarSearchParams, now: Date) {
  const view: "mes" | "linea" = sp.view === "linea" ? "linea" : "mes";
  const requestedDay = validDay(sp.d);
  const requestedWeek = validDay(sp.w);
  const today = startOfDay(now);
  const monthStart = validMonth(sp.m) ?? startOfMonth(requestedDay ?? (view === "linea" ? requestedWeek : null) ?? today);
  const monthKey = dayKey(monthStart).slice(0, 7);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = addDays(gridStart, 42);
  const monthSelection = requestedDay && within(requestedDay, gridStart, gridEnd)
    ? requestedDay
    : monthKey === dayKey(today).slice(0, 7) ? today : monthStart;

  const weekStart = startOfWeek(view === "linea" ? requestedWeek ?? requestedDay ?? today : monthSelection);
  const weekEnd = addDays(weekStart, 14);
  const weekCandidate = requestedDay ?? today;
  const weekSelection = within(weekCandidate, weekStart, weekEnd) ? weekCandidate : weekStart;

  return {
    view,
    monthStart,
    monthKey,
    gridStart,
    gridEnd,
    weekStart,
    selected: dayKey(view === "mes" ? monthSelection : weekSelection),
    rangeStart: view === "mes" ? gridStart : weekStart,
    rangeEnd: view === "mes" ? gridEnd : weekEnd,
  };
}
