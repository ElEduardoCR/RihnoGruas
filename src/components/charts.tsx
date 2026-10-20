"use client";

import { useState } from "react";
import { cx } from "./ui";

const compact = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${Math.round(n)}`;
const full = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

/**
 * Columnas de una sola serie: meses anteriores en tinta, mes actual en rojo.
 * Barras ≤ 24px, extremo redondeado de 4px, tooltip al pasar el cursor.
 */
export function MonthlyColumns({
  data,
  height = 200,
}: {
  data: { key: string; label: string; total: number; breakdown?: { label: string; value: number }[] }[];
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...data.map((d) => d.total)));
  const ticks = [0, max / 2, max];
  const last = data.length - 1;
  return (
    <div className="relative">
      <div className="flex" style={{ height }}>
        <div className="tabular relative w-11 shrink-0 text-[11px] text-faint">
          {ticks.map((t) => (
            <span key={t} className="absolute right-2 -translate-y-1/2" style={{ top: `${(1 - t / max) * 100}%` }}>
              {compact(t)}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <div key={t} className={cx("absolute inset-x-0 h-px", t === 0 ? "bg-line-2" : "bg-line")} style={{ top: `${(1 - t / max) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end">
            {data.map((d, i) => (
              <div
                key={d.key}
                className="group relative flex h-full flex-1 cursor-default items-end justify-center"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {i === last && (
                  <span className="tabular absolute text-[12px] font-semibold text-ink" style={{ bottom: `calc(${(d.total / max) * 100}% + 6px)` }}>
                    {compact(d.total)}
                  </span>
                )}
                <div
                  className={cx("w-full max-w-[24px] rounded-t-[4px] transition-opacity", i === last ? "bg-rhino-500" : "bg-ink", hover != null && hover !== i && "opacity-40")}
                  style={{ height: `${(d.total / max) * 100}%` }}
                />
              </div>
            ))}
          </div>
          {hover != null && (
            <div
              className="pointer-events-none absolute z-10 min-w-[180px] -translate-x-1/2 rounded-xl bg-ink px-3 py-2.5 text-[12px] text-white shadow-[var(--shadow-pop)]"
              style={{ left: `${((hover + 0.5) / data.length) * 100}%`, bottom: `calc(${(data[hover].total / max) * 100}% + 10px)` }}
            >
              <div className="mb-1 font-medium capitalize text-white/70">{data[hover].label}</div>
              <div className="tabular text-[15px] font-semibold">{full(data[hover].total)}</div>
              {data[hover].breakdown?.slice(0, 4).map((b) => (
                <div key={b.label} className="tabular mt-1 flex justify-between gap-4 text-white/80">
                  <span>{b.label}</span>
                  <span>{compact(b.value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex pl-11">
        {data.map((d, i) => (
          <div key={d.key} className={cx("flex-1 text-center text-[12px] capitalize", i === last ? "font-semibold text-ink" : "text-muted")}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Barras horizontales de magnitud (una serie). Valor al extremo de cada barra. */
export function HBars({
  rows,
  accentFirst = false,
  format = "money",
}: {
  rows: { label: string; value: number; sub?: string; href?: string }[];
  accentFirst?: boolean;
  format?: "money" | "number";
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.value));
  const fmtV = format === "money" ? compact : (n: number) => new Intl.NumberFormat("es-MX").format(n);
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} title={format === "money" ? full(r.value) : undefined}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate font-medium text-ink">
              {r.label}
              {r.sub && <span className="ml-1.5 font-normal text-muted">{r.sub}</span>}
            </span>
            <span className="tabular shrink-0 font-semibold text-ink">{hover === i && format === "money" ? full(r.value) : fmtV(r.value)}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-black/[0.05]">
            <div
              className={cx("h-full rounded-full transition-opacity", accentFirst && i === 0 ? "bg-rhino-500" : "bg-ink", hover != null && hover !== i && "opacity-40")}
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
