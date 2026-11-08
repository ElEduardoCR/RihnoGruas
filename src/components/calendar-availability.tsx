"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, Search } from "lucide-react";
import { CRANE_TYPE_LABELS } from "@/lib/labels";
import type { Crane } from "@/lib/types";

export type CalendarUnit = Pick<Crane, "id" | "code" | "name" | "type" | "capacity_tons">;
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** La flota libre se explora una sola vez, en el día elegido. */
export function CalendarAvailability({ units }: { units: CalendarUnit[] }) {
  const [query, setQuery] = useState("");
  const matches = units.filter((unit) => normalize(`${unit.code} ${unit.name} ${CRANE_TYPE_LABELS[unit.type]}`).includes(normalize(query.trim())));
  const types = [...new Set(matches.map((unit) => unit.type))];

  if (!units.length) return <p className="text-[13px] leading-6 text-muted">Todas las unidades tienen ocupación en agenda este día.</p>;

  return <details className="group rounded-2xl border border-line bg-white">
    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 py-3 text-[13px] font-medium hover:bg-canvas [&::-webkit-details-marker]:hidden">
      <span>Ver {units.length} {units.length === 1 ? "unidad libre" : "unidades libres"}</span>
      <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
    </summary>
    <div className="border-t border-line p-3">
      <label className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 focus-within:border-ink">
        <Search className="size-4 shrink-0 text-muted" aria-hidden />
        <input type="search" aria-label="Buscar unidad libre" placeholder="Buscar código, nombre o tipo" value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 min-w-0 w-full bg-transparent text-[14px]" style={{ outline: "none" }} />
      </label>
      <p className="mt-2 text-[11px] text-muted" aria-live="polite">{matches.length} {matches.length === 1 ? "unidad" : "unidades"}{query ? (matches.length === 1 ? " encontrada" : " encontradas") : " · agrupadas por tipo"}</p>
      <div className="mt-3 max-h-[330px] space-y-4 overflow-y-auto overscroll-contain pr-1">
        {types.map((type) => <div key={type}>
          <h4 className="mb-1 flex items-center justify-between gap-2 text-[11px] font-medium text-muted"><span>{CRANE_TYPE_LABELS[type]}</span><span>{matches.filter((unit) => unit.type === type).length}</span></h4>
          <ul className="divide-y divide-line/70">
            {matches.filter((unit) => unit.type === type).map((unit) => <li key={unit.id}>
              <Link href={`/gruas/${unit.id}`} className="group/unit flex min-h-14 items-center gap-2 rounded-lg px-1 py-2 hover:bg-canvas">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]"><span className="font-semibold">{unit.code}</span>{unit.capacity_tons != null && <span className="text-[11px] text-muted">{unit.capacity_tons} t</span>}</div>
                  <p className="truncate text-[12px] text-muted" title={unit.name}>{unit.name}</p>
                </div>
                <ArrowUpRight className="size-3.5 shrink-0 text-muted" aria-hidden />
              </Link>
            </li>)}
          </ul>
        </div>)}
        {matches.length === 0 && <p className="py-4 text-center text-[13px] text-muted">No hay coincidencias. Prueba otro código o nombre.</p>}
      </div>
    </div>
  </details>;
}
