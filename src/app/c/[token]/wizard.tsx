"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, ArrowLeft, Bot, Camera, Check, CheckCircle2, ChevronRight, Loader2, MapPin, Plus, ShieldX, X } from "lucide-react";
import type { CraneType } from "@/lib/types";
import { CraneArt, RhinoMark } from "@/components/brand";
import { cx } from "@/components/ui";
import { compressImage as compress } from "@/lib/client-image";
import { MAX_PHOTOS_PER_ITEM as MAX_PHOTOS } from "@/lib/domain/checklists";
import { completeAction, saveStepAction, startAction, uploadPhotoAction } from "./actions";
import type { WizardItem } from "./types";

interface Props {
  token: string;
  inspection: { title: string; status: string; started: boolean; scheduledFor: string; dueBy: string; result: string | null; score: number | null };
  crane: { code: string; name: string; type: CraneType; hourMeter: number };
  assignee: string | null;
  initialItems: WizardItem[];
}


async function sha256(buf: ArrayBuffer) {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function Wizard({ token, inspection, crane, assignee, initialItems }: Props) {
  const [items, setItems] = useState(initialItems);
  const firstPending = items.findIndex((i) => !i.answered);
  const done = inspection.status === "completada";
  // -1 = portada, items.length = firma
  const [step, setStep] = useState<number>(done ? items.length + 1 : inspection.started ? (firstPending < 0 ? items.length : firstPending) : -1);
  const [final, setFinal] = useState<{ result: string | null; score: number | null; flags: string[] } | null>(done ? { result: inspection.result, score: inspection.score, flags: [] } : null);

  const progress = step < 0 ? 0 : Math.min(1, items.filter((i) => i.answered).length / items.length);
  const agentItems = items.filter((i) => i.source !== "plantilla");

  return (
    <div className="flex min-h-dvh flex-col bg-white text-ink">
      <header className="sticky top-0 z-20 bg-night text-white">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-3 px-4">
          <RhinoMark className="size-8" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[15px] font-semibold">{inspection.title} · {crane.code}</div>
            <div className="truncate text-[12px] text-white/55">{crane.name}{assignee ? ` · ${assignee}` : ""}</div>
          </div>
          {step >= 0 && step < items.length && (
            <span className="tabular rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-medium">
              {step + 1}/{items.length}
            </span>
          )}
        </div>
        <div className="h-1 bg-white/10">
          <div className="h-full bg-rhino-500 transition-all duration-500" style={{ width: `${progress * 100}%` }} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pt-6 pb-8">
        {inspection.status === "cancelada" ? (
          <Message icon={<X className="size-8" />} title="Revisión cancelada" text="Esta revisión ya no es necesaria." />
        ) : final ? (
          <Done final={final} crane={crane} />
        ) : step === -1 ? (
          <Intro
            crane={crane}
            inspection={inspection}
            total={items.length}
            agentItems={agentItems}
            onStart={async (coords) => {
              await startAction(token, coords);
              setStep(firstPending < 0 ? 0 : firstPending);
            }}
          />
        ) : step < items.length ? (
          <Step
            key={items[step].id}
            token={token}
            item={items[step]}
            index={step}
            total={items.length}
            otherHashes={items.filter((x) => x.id !== items[step].id).flatMap((x) => x.photos.map((p) => p.hash))}
            onBack={() => setStep(Math.max(0, step - 1))}
            onSaved={(it) => {
              const next = items.map((x) => (x.id === it.id ? it : x));
              setItems(next);
              const nextPending = next.findIndex((x, i) => i > step && !x.answered);
              setStep(nextPending >= 0 ? nextPending : next.every((x) => x.answered) ? next.length : step + 1);
            }}
          />
        ) : (
          <Sign
            items={items}
            hourMeter={crane.hourMeter}
            onGoto={setStep}
            onSubmit={async (name, hm) => {
              const r = await completeAction(token, name, hm);
              if (!r.ok) return r.error;
              setFinal({ result: r.result, score: r.score, flags: r.flags });
              return null;
            }}
          />
        )}
      </main>
    </div>
  );
}

function Intro({
  crane,
  inspection,
  total,
  agentItems,
  onStart,
}: {
  crane: Props["crane"];
  inspection: Props["inspection"];
  total: number;
  agentItems: WizardItem[];
  onStart: (coords: { lat: number; lng: number } | null) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    const coords = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null), { timeout: 6000, maximumAge: 60000 });
    });
    await onStart(coords);
    setBusy(false);
  };
  const fmtDate = (s: string) => new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(s));
  return (
    <div className="flex flex-1 flex-col">
      <div className="rounded-[28px] bg-canvas px-6 pt-6 pb-2">
        <CraneArt type={crane.type} />
      </div>
      <h1 className="mt-6 text-[30px] leading-tight font-semibold">{crane.code} · {crane.name}</h1>
      <p className="mt-2 text-[15px] text-muted">
        {total} puntos · aprox. {Math.max(10, Math.round(total * 0.8))} min · antes de {fmtDate(inspection.dueBy)}
      </p>

      {agentItems.length > 0 && (
        <div className="mt-6 rounded-3xl border border-rhino-100 bg-rhino-50/60 p-5">
          <div className="flex items-center gap-2 text-[14px] font-semibold text-rhino-700">
            <Bot className="size-4" /> {agentItems.length} puntos específicos para esta grúa
          </div>
          <ul className="mt-3 space-y-2 text-[13px] text-ink-2">
            {agentItems.slice(0, 5).map((i) => (
              <li key={i.id} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-rhino-500" />
                <span><b className="font-medium text-ink">{i.title}</b>{i.source_reason ? ` — ${i.source_reason}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="mt-6 space-y-3 text-[14px] text-ink-2">
        <li className="flex gap-3"><Camera className="size-5 shrink-0 text-rhino-500" />Cada punto requiere al menos una foto tomada en este momento; algunos piden varias (p. ej. los 4 lados).</li>
        <li className="flex gap-3"><MapPin className="size-5 shrink-0 text-rhino-500" />Debes estar frente a la grúa; se registra la ubicación al iniciar.</li>
        <li className="flex gap-3"><AlertTriangle className="size-5 shrink-0 text-rhino-500" />Si algo falla, descríbelo. Las fallas críticas detienen la grúa.</li>
      </ul>

      <div className="mt-auto pt-8">
        <button onClick={start} disabled={busy} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-rhino-500 text-[17px] font-semibold text-white active:scale-[0.99] disabled:opacity-60">
          {busy ? <Loader2 className="size-5 animate-spin" /> : null}
          {inspection.started ? "Continuar revisión" : "Comenzar revisión"}
        </button>
      </div>
    </div>
  );
}

type Shot = {
  key: string;
  url: string;
  path: string | null;
  hash: string;
  takenAt: string | null;
  status: "subiendo" | "lista" | "error";
  error?: string;
};

function Step({
  token,
  item,
  index,
  total,
  otherHashes,
  onBack,
  onSaved,
}: {
  token: string;
  item: WizardItem;
  index: number;
  total: number;
  otherHashes: string[];
  onBack: () => void;
  onSaved: (it: WizardItem) => void;
}) {
  const shownAt = useRef(new Date().toISOString());
  const fileRef = useRef<HTMLInputElement>(null);
  const blobUrls = useRef<string[]>([]);
  const [shots, setShots] = useState<Shot[]>(() =>
    item.photos.map((p) => ({ key: p.path, url: `/api/files/evidencias/${p.path}?t=${token}`, path: p.path, hash: p.hash, takenAt: p.takenAt, status: "lista" as const })),
  );
  const [passed, setPassed] = useState<boolean | null>(item.answered ? item.passed : null);
  const [value, setValue] = useState(item.response_type === "numero" ? (item.value_number?.toString() ?? "") : (item.value_text ?? ""));
  const [notes, setNotes] = useState(item.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [processing, setProcessing] = useState(false);

  useEffect(() => () => blobUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const needed = item.requires_photo ? Math.max(1, item.min_photos) : 0;
  const ready = shots.filter((s) => s.status === "lista");
  const uploading = shots.some((s) => s.status === "subiendo");
  const missingPhotos = Math.max(0, needed - ready.length);
  const canAdd = shots.length < MAX_PHOTOS;
  const answerOk = item.response_type === "ok_falla" ? passed !== null : item.response_type === "numero" ? value.trim() !== "" && !Number.isNaN(Number(value)) : value.trim().length > 1;
  const needsNotes = passed === false && notes.trim().length < 4;
  const canNext = missingPhotos === 0 && !uploading && answerOk && !needsNotes;

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setProcessing(true);
    const hash = await sha256(await f.arrayBuffer());
    if (shots.some((s) => s.hash === hash)) {
      setProcessing(false);
      return setError("Ya agregaste esta misma foto a este punto. Toma otra.");
    }
    if (otherHashes.includes(hash)) {
      setProcessing(false);
      return setError("Esta foto ya se usó en otro punto. Toma una foto nueva de este punto.");
    }
    const blob = await compress(f);
    setProcessing(false);
    const key = `${Date.now()}-${hash.slice(0, 6)}`;
    const takenAt = new Date(f.lastModified || Date.now()).toISOString();
    const url = URL.createObjectURL(blob);
    blobUrls.current.push(url);
    setShots((list) => [...list, { key, url, path: null, hash, takenAt, status: "subiendo" }]);
    // Se sube en cuanto se toma: si falla la señal sólo se repite esa foto
    const fd = new FormData();
    fd.set("photo", blob, "foto.jpg");
    fd.set("hash", hash);
    fd.set("takenAt", takenAt);
    const r = await uploadPhotoAction(token, item.id, fd);
    setShots((list) => list.map((x) => (x.key !== key ? x : r.ok ? { ...x, path: r.photo.path, status: "lista" } : { ...x, status: "error", error: r.error })));
    if (!r.ok) setError(r.error);
  };

  const remove = (key: string) => {
    setError(null);
    setShots((list) => list.filter((x) => x.key !== key));
  };

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await saveStepAction(token, item.id, {
        passed: item.response_type === "ok_falla" ? passed : null,
        value,
        notes,
        shownAt: shownAt.current,
        photos: ready.map((s) => ({ path: s.path!, hash: s.hash, takenAt: s.takenAt })),
      });
      if (!r.ok) return setError(r.error);
      onSaved(r.item);
    });

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-rhino-600">{item.section}</span>
        {item.critical && <span className="rounded-full bg-rhino-500 px-2 py-0.5 text-[11px] font-semibold text-white">CRÍTICO</span>}
      </div>
      <h2 className="mt-2 text-[26px] leading-tight font-semibold">{item.title}</h2>
      {item.source !== "plantilla" && item.source_reason && (
        <div className="mt-3 inline-flex items-center gap-1.5 self-start rounded-full bg-ink px-3 py-1 text-[12px] font-medium text-white">
          <Bot className="size-3.5" /> {item.source === "agente" ? "Rhino lo agregó:" : "Propio de esta grúa:"} {item.source_reason}
        </div>
      )}
      {item.instructions && <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{item.instructions}</p>}

      {/* Fotos */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = ""; // permite volver a elegir
          onFile(f);
        }}
      />
      <div className="mt-5 flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-ink-2">{item.photo_hint ?? "Foto del punto revisado"}</span>
        {(needed > 1 || shots.length > 1) && (
          <span className={cx("tabular text-[13px] font-semibold", missingPhotos ? "text-rhino-600" : "text-ok")}>
            {ready.length}
            {needed > 1 ? ` / ${needed}` : ""} fotos
          </span>
        )}
      </div>
      {shots.length === 0 ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="mt-2 flex aspect-[4/3] w-full flex-col items-center justify-center rounded-[24px] border-2 border-dashed border-line-2 bg-canvas transition active:bg-line"
        >
          {processing ? (
            <Loader2 className="size-8 animate-spin text-muted" />
          ) : (
            <>
              <span className="grid size-16 place-items-center rounded-full bg-ink text-white"><Camera className="size-7" /></span>
              <span className="mt-3 text-[16px] font-semibold">Tomar foto</span>
              <span className="mt-1 px-6 text-center text-[13px] text-muted">
                {needed > 1 ? `Este punto pide ${needed} fotos` : "Foto tomada en este momento"}
              </span>
            </>
          )}
        </button>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {shots.map((s, i) => (
            <div key={s.key} className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-canvas">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.url} alt={`Evidencia ${i + 1}`} className="absolute inset-0 size-full object-cover" />
              <span className="absolute bottom-2 left-2 grid size-6 place-items-center rounded-full bg-black/65 text-[12px] font-semibold text-white">{i + 1}</span>
              {s.status === "subiendo" && (
                <div className="absolute inset-0 grid place-items-center bg-black/35">
                  <Loader2 className="size-7 animate-spin text-white" />
                </div>
              )}
              {s.status === "error" && (
                <div className="absolute inset-0 flex items-center justify-center bg-rhino-600/80 px-3 text-center text-[12px] font-medium text-white">No se subió · quítala y tómala de nuevo</div>
              )}
              <button
                type="button"
                onClick={() => remove(s.key)}
                disabled={s.status === "subiendo"}
                className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/65 text-white backdrop-blur disabled:opacity-40"
                aria-label={`Quitar foto ${i + 1}`}
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          {canAdd && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={processing}
              className={cx(
                "flex aspect-[4/3] flex-col items-center justify-center rounded-2xl border-2 border-dashed transition active:bg-line",
                missingPhotos ? "border-rhino-200 bg-rhino-50/50 text-rhino-700" : "border-line-2 bg-canvas text-ink-2",
              )}
            >
              {processing ? <Loader2 className="size-6 animate-spin" /> : <Plus className="size-6" />}
              <span className="mt-1.5 text-[14px] font-semibold">Agregar foto</span>
              {missingPhotos > 0 && <span className="text-[12px]">faltan {missingPhotos}</span>}
            </button>
          )}
        </div>
      )}

      {/* Respuesta */}
      {item.response_type === "ok_falla" && (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setPassed(true)} className={cx("flex h-16 items-center justify-center gap-2 rounded-2xl border-2 text-[17px] font-semibold transition", passed === true ? "border-ink bg-ink text-white" : "border-line-2 text-ink")}>
            <Check className="size-5" /> Todo bien
          </button>
          <button type="button" onClick={() => setPassed(false)} className={cx("flex h-16 items-center justify-center gap-2 rounded-2xl border-2 text-[17px] font-semibold transition", passed === false ? "border-rhino-500 bg-rhino-500 text-white" : "border-line-2 text-ink")}>
            <AlertTriangle className="size-5" /> Hay falla
          </button>
        </div>
      )}
      {item.response_type === "numero" && (
        <label className="mt-5 block">
          <span className="text-[13px] font-medium text-ink-2">Lectura{item.unit ? ` (${item.unit})` : ""}</span>
          <input
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(",", "."))}
            className="mt-1.5 h-16 w-full rounded-2xl border-2 border-line-2 px-4 text-[28px] font-semibold tabular-nums outline-none focus:border-ink"
            placeholder="0"
          />
        </label>
      )}
      {item.response_type === "texto" && (
        <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={3} className="mt-5 w-full rounded-2xl border-2 border-line-2 p-4 text-[16px] outline-none focus:border-ink" placeholder="Escribe lo que revisaste" />
      )}
      {(passed === false || item.response_type !== "ok_falla") && (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className={cx("mt-3 w-full rounded-2xl border-2 p-4 text-[16px] outline-none", passed === false ? "border-rhino-200 bg-rhino-50/50 focus:border-rhino-500" : "border-line-2 focus:border-ink")}
          placeholder={passed === false ? "Describe la falla (obligatorio)" : "Notas (opcional)"}
        />
      )}

      {error && <div className="mt-4 rounded-2xl bg-rhino-50 px-4 py-3 text-[14px] font-medium text-rhino-700">{error}</div>}

      <div className="mt-auto flex gap-3 pt-6">
        <button type="button" onClick={onBack} disabled={index === 0} className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border-2 border-line-2 disabled:opacity-30" aria-label="Anterior">
          <ArrowLeft className="size-5" />
        </button>
        <button type="button" onClick={submit} disabled={!canNext || pending || processing} className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-rhino-500 text-[17px] font-semibold text-white disabled:bg-line-2 disabled:text-muted">
          {pending ? <Loader2 className="size-5 animate-spin" /> : null}
          {index === total - 1 ? "Guardar y revisar" : "Siguiente"} <ChevronRight className="size-5" />
        </button>
      </div>
      {!canNext && !pending && (
        <p className="mt-2 text-center text-[12px] text-muted">
          {uploading
            ? "Subiendo fotos…"
            : missingPhotos
              ? needed === 1
                ? "Falta la foto"
                : missingPhotos === 1
                  ? "Falta 1 foto"
                  : `Faltan ${missingPhotos} fotos`
              : !answerOk
                ? "Falta tu respuesta"
                : needsNotes
                  ? "Describe la falla"
                  : ""}
        </p>
      )}
    </div>
  );
}

function Sign({ items, hourMeter, onGoto, onSubmit }: { items: WizardItem[]; hourMeter: number; onGoto: (i: number) => void; onSubmit: (name: string, hm: number | null) => Promise<string | null> }) {
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const failed = useMemo(() => items.map((it, i) => ({ it, i })).filter(({ it }) => it.passed === false), [items]);
  const missing = items.map((it, i) => ({ it, i })).filter(({ it }) => !it.answered);
  const hmItem = items.find((i) => i.response_type === "numero" && i.unit === "h");
  return (
    <div className="flex flex-1 flex-col">
      <h2 className="text-[28px] font-semibold">Revisa y firma</h2>
      <p className="mt-1 text-[15px] text-muted">{items.length - missing.length} de {items.length} puntos contestados.</p>

      {missing.length > 0 && (
        <div className="mt-5 rounded-3xl bg-warn-soft p-5">
          <div className="font-semibold text-warn">Faltan {missing.length} puntos</div>
          <ul className="mt-2 space-y-1 text-[14px]">
            {missing.slice(0, 6).map(({ it, i }) => (
              <li key={it.id}><button className="text-left underline underline-offset-2" onClick={() => onGoto(i)}>{it.title}</button></li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 rounded-3xl bg-canvas p-5">
        <div className="text-[14px] font-semibold">{failed.length ? `${failed.length} falla(s) reportada(s)` : "Sin fallas reportadas"}</div>
        <ul className="mt-2 space-y-2 text-[14px]">
          {failed.map(({ it, i }) => (
            <li key={it.id} className="flex gap-2">
              <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", it.critical ? "bg-rhino-500" : "bg-warn-mid")} />
              <button className="text-left" onClick={() => onGoto(i)}>
                <b className="font-medium">{it.title}</b>
                {it.critical && <span className="text-rhino-600"> · crítico</span>}
                <div className="text-[13px] text-muted">{it.notes}</div>
              </button>
            </li>
          ))}
        </ul>
        {failed.some(({ it }) => it.critical) && (
          <p className="mt-3 rounded-2xl bg-rhino-500 px-4 py-3 text-[13px] font-medium text-white">
            Hay fallas críticas: al firmar, la grúa quedará detenida y Rhino avisará a Dirección.
          </p>
        )}
      </div>

      {!hmItem && <p className="mt-4 text-[13px] text-muted">Horómetro registrado: {hourMeter} h</p>}

      <label className="mt-6 block">
        <span className="text-[13px] font-medium text-ink-2">Nombre completo (firma)</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-14 w-full rounded-2xl border-2 border-line-2 px-4 text-[17px] outline-none focus:border-ink" autoComplete="name" />
      </label>
      <label className="mt-4 flex items-start gap-3 text-[14px] text-ink-2">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-5 accent-[#e3261b]" />
        Declaro que realicé esta revisión físicamente, frente a la grúa, y que las fotos fueron tomadas durante la revisión.
      </label>
      {error && <div className="mt-4 rounded-2xl bg-rhino-50 px-4 py-3 text-[14px] font-medium text-rhino-700">{error}</div>}
      <div className="mt-auto pt-6">
        <button
          disabled={!agree || name.trim().length < 5 || missing.length > 0 || pending}
          onClick={() =>
            start(async () => {
              const err = await onSubmit(name, null);
              if (err) setError(err);
            })
          }
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-[17px] font-semibold text-white disabled:bg-line-2 disabled:text-muted"
        >
          {pending && <Loader2 className="size-5 animate-spin" />} Firmar y enviar
        </button>
      </div>
    </div>
  );
}

function Done({ final, crane }: { final: { result: string | null; score: number | null; flags: string[] }; crane: Props["crane"] }) {
  const ok = final.result === "aprobada";
  const rejected = final.result === "rechazada";
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className={cx("grid size-24 place-items-center rounded-full", ok ? "bg-ok-soft text-ok" : rejected ? "bg-rhino-500 text-white" : "bg-warn-soft text-warn")}>
        {ok ? <CheckCircle2 className="size-12" /> : rejected ? <ShieldX className="size-12" /> : <AlertTriangle className="size-12" />}
      </div>
      <h2 className="mt-6 text-[30px] font-semibold">{ok ? "Revisión aprobada" : rejected ? "Grúa detenida" : "Aprobada con observaciones"}</h2>
      <p className="mt-2 max-w-sm text-[15px] text-muted">
        {ok
          ? `${crane.code} está lista para salir. Gracias por hacerlo con cuidado.`
          : rejected
            ? `Se encontraron fallas críticas. ${crane.code} quedó fuera de servicio y Rhino ya avisó a Dirección y al taller.`
            : "Rhino avisó al taller para atender las observaciones."}
      </p>
      {final.score != null && (
        <div className="mt-6 rounded-3xl bg-canvas px-8 py-5">
          <div className="text-[13px] text-muted">Calidad del llenado</div>
          <div className={cx("text-[44px] font-semibold", final.score < 70 && "text-rhino-500")}>{final.score}</div>
          {final.score < 70 && <div className="max-w-xs text-[13px] text-rhino-600">Por política, esta revisión se repetirá con supervisión.</div>}
        </div>
      )}
      <p className="mt-8 text-[13px] text-faint">Ya puedes cerrar esta ventana.</p>
    </div>
  );
}

function Message({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="grid size-20 place-items-center rounded-full bg-canvas text-muted">{icon}</div>
      <h2 className="mt-5 text-[24px] font-semibold">{title}</h2>
      <p className="mt-2 text-muted">{text}</p>
    </div>
  );
}
