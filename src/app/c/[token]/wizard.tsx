"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, ArrowLeft, BookOpen, Bot, Camera, Check, CheckCircle2, ChevronRight, Loader2, MapPin, Plus, ShieldX, X } from "lucide-react";
import type { CraneType } from "@/lib/types";
import { CraneArt, RhinoMark } from "@/components/brand";
import { cx } from "@/components/ui";
import { compressImage as compress } from "@/lib/client-image";
import { MAX_PHOTOS_PER_ITEM as MAX_PHOTOS } from "@/lib/domain/checklists";
import { completeAction, saveStepAction, startAction, uploadPhotoAction } from "./actions";
import type { WizardItem } from "./types";

interface Props {
  token: string;
  inspection: { title: string; kind?: string; status: string; started: boolean; scheduledFor: string; dueBy: string; result: string | null; score: number | null };
  crane: { code: string; name: string; type: CraneType; hourMeter: number | null };
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
  const isMaintenance = inspection.kind === "mantenimiento";
  // -1 = portada, items.length = firma
  const [step, setStep] = useState<number>(done ? items.length + 1 : inspection.started ? (firstPending < 0 ? items.length : firstPending) : -1);
  const [final, setFinal] = useState<{ result: string | null; score: number | null; flags: string[] } | null>(done ? { result: inspection.result, score: inspection.score, flags: [] } : null);

  const progress = step < 0 || items.length === 0 ? 0 : Math.min(1, items.filter((i) => i.answered).length / items.length);
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
          <Done final={final} crane={crane} maintenance={isMaintenance} />
        ) : items.length === 0 ? (
          <Message icon={<AlertTriangle className="size-8" />} title="Checklist sin pasos" text="Pide al responsable de taller que revise la plantilla antes de comenzar." />
        ) : step === -1 ? (
          <Intro
            crane={crane}
            inspection={inspection}
            total={items.length}
            agentItems={agentItems}
            onStart={async (coords) => {
              await startAction(token, coords);
              setStep(firstPending < 0 ? items.length : firstPending);
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
            maintenance={isMaintenance}
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
  const [error, setError] = useState<string | null>(null);
  const maintenance = inspection.kind === "mantenimiento";
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const coords = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null), { timeout: 6000, maximumAge: 60000 });
      });
      await onStart(coords);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir la revisión. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  };
  const fmtDate = (s: string) => new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(s));
  return (
    <div className="flex flex-1 flex-col">
      <div className="rounded-[28px] bg-canvas px-6 pt-6 pb-2">
        <CraneArt type={crane.type} />
      </div>
      <h1 className="mt-6 text-[30px] leading-tight font-semibold">{crane.code} · {crane.name}</h1>
      <p className="mt-2 text-[15px] text-muted">
        {total} pasos{maintenance ? "" : ` · aprox. ${Math.max(10, Math.round(total * 0.8))} min`} · antes de {fmtDate(inspection.dueBy)}
      </p>

      {maintenance && (
        <div className="mt-5 rounded-2xl border border-warn-mid/30 bg-warn-soft p-4 text-[14px] leading-relaxed text-ink-2">
          <div className="flex items-center gap-2 font-semibold text-ink"><BookOpen className="size-4 shrink-0" /> Manual de esta unidad</div>
          <p className="mt-2">La guía se preparó con las fuentes del expediente. Antes de intervenir, confirma el manual que corresponde al modelo y número de serie. Si no coincide o falta, deja el primer paso pendiente.</p>
        </div>
      )}

      {!maintenance && agentItems.length > 0 && (
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
        <li className="flex gap-3"><Camera className="size-5 shrink-0 text-rhino-500" />Cada paso indica qué fotografiar y cuántas tomas necesita. El avance se guarda al completar cada paso.</li>
        <li className="flex gap-3"><MapPin className="size-5 shrink-0 text-rhino-500" />Debes estar frente a la unidad. Si autorizas la ubicación, se registra al iniciar.</li>
        <li className="flex gap-3"><AlertTriangle className="size-5 shrink-0 text-rhino-500" />Si algo falla, descríbelo. Las fallas críticas detienen la unidad.</li>
      </ul>

      {error && <p role="alert" className="mt-4 rounded-xl bg-rhino-50 p-3 text-[14px] text-rhino-700">{error}</p>}

      <div className="mt-auto pt-8">
        <button onClick={start} disabled={busy} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-rhino-500 text-[17px] font-semibold text-white active:scale-[0.99] disabled:opacity-60">
          {busy ? <Loader2 className="size-5 animate-spin" /> : null}
          {inspection.started ? "Continuar checklist" : maintenance ? "Comenzar checklist" : "Comenzar revisión"}
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
  slot: number;
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
  const captureSlot = useRef(0);
  const captureBusy = useRef(false);
  const blobUrls = useRef<string[]>([]);
  const [shots, setShots] = useState<Shot[]>(() =>
    item.photos.map((p) => ({ key: p.path, url: `/api/files/evidencias/${p.path}?t=${token}`, path: p.path, hash: p.hash, takenAt: p.takenAt, slot: p.slot, status: "lista" as const })),
  );
  const [passed, setPassed] = useState<boolean | null>(item.answered ? item.passed : null);
  const [value, setValue] = useState(item.response_type === "numero" ? (item.value_number?.toString() ?? "") : (item.value_text ?? ""));
  const [notes, setNotes] = useState(item.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [processing, setProcessing] = useState(false);
  const [activeCaptureSlot, setActiveCaptureSlot] = useState<number | null>(null);
  const [manualConfirmed, setManualConfirmed] = useState(item.manual_confirmed);
  const [manualMissing, setManualMissing] = useState(false);

  useEffect(() => () => blobUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const needed = item.requires_photo ? Math.max(1, item.min_photos) : 0;
  const ready = shots.filter((s) => s.status === "lista");
  const uploading = shots.some((s) => s.status === "subiendo");
  const requiredSlots = Array.from({ length: needed }, (_, i) => i);
  const missingPhotos = requiredSlots.filter((slot) => !ready.some((s) => s.slot === slot)).length;
  const canAdd = shots.length < MAX_PHOTOS;
  const answerOk = item.response_type === "ok_falla" ? passed !== null : item.response_type === "numero" ? value.trim() !== "" && Number.isFinite(Number(value)) : value.trim().length > 1;
  const needsNotes = passed === false && notes.trim().length < 4;
  const manualOk = !item.requires_manual_confirmation || (manualConfirmed && !manualMissing);
  const canNext = missingPhotos === 0 && !uploading && answerOk && !needsNotes && manualOk;
  const shotLabel = (slot: number) => item.photo_requirements[slot] ?? (slot < needed ? item.photo_hint ?? `Punto revisado · toma ${slot + 1}` : `Evidencia adicional ${slot - needed + 1}`);
  const choosePhoto = (slot: number) => {
    if (processing || pending || captureBusy.current) return;
    captureSlot.current = slot;
    setActiveCaptureSlot(slot);
    fileRef.current?.click();
  };

  const onFile = async (f: File | undefined) => {
    if (!f || captureBusy.current) return;
    const slot = captureSlot.current;
    if (shots.length >= MAX_PHOTOS || shots.some((s) => s.slot === slot)) return;
    captureBusy.current = true;
    setError(null);
    setProcessing(true);
    let shotKey: string | null = null;
    try {
      const blob = await compress(f);
      const hash = await sha256(await blob.arrayBuffer());
      if (shots.some((s) => s.hash === hash)) throw new Error("Ya agregaste esta misma foto a este paso. Toma otra.");
      if (otherHashes.includes(hash)) throw new Error("Esta foto ya se usó en otro paso. Toma una foto nueva.");
      shotKey = hash;
      const takenAt = f.lastModified > 0 ? new Date(f.lastModified).toISOString() : null;
      const url = URL.createObjectURL(blob);
      blobUrls.current.push(url);
      const key = shotKey;
      setShots((list) => [...list, { key, url, path: null, hash, takenAt, slot, status: "subiendo" }]);
      const fd = new FormData();
      fd.set("photo", blob, "foto.jpg");
      fd.set("hash", hash);
      if (takenAt) fd.set("takenAt", takenAt);
      const r = await uploadPhotoAction(token, item.id, fd);
      if (!r.ok) throw new Error(r.error);
      setShots((list) => list.map((x) => x.key !== key ? x : { ...x, path: r.photo.path, status: "lista" }));
    } catch (e) {
      const message = e instanceof Error ? e.message : "No se pudo procesar la foto. Intenta de nuevo.";
      setError(message);
      if (shotKey) setShots((list) => list.map((x) => x.key !== shotKey ? x : { ...x, status: "error", error: message }));
    } finally {
      captureBusy.current = false;
      setProcessing(false);
    }
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
        photos: [...ready].sort((a, b) => a.slot - b.slot).map((s) => ({ path: s.path!, hash: s.hash, takenAt: s.takenAt, slot: s.slot })),
        manualConfirmed,
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
      {item.source === "plantilla" && item.procedure_steps.length > 0 && item.source_reason && (
        <p className="mt-3 rounded-2xl bg-canvas px-4 py-3 text-[12px] leading-relaxed text-muted">{item.source_reason}</p>
      )}
      {item.source !== "plantilla" && item.source_reason && (
        <div className="mt-3 inline-flex items-center gap-1.5 self-start rounded-full bg-ink px-3 py-1 text-[12px] font-medium text-white">
          <Bot className="size-3.5" /> {item.source === "agente" ? "Rhino lo agregó:" : "Propio de esta grúa:"} {item.source_reason}
        </div>
      )}
      {item.instructions && <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{item.instructions}</p>}

      {item.procedure_steps.length > 0 && (
        <ol className="mt-4 space-y-3 rounded-2xl bg-canvas p-4 text-[14px] leading-relaxed text-ink-2">
          {item.procedure_steps.map((instruction, i) => (
            <li key={`${i}-${instruction}`} className="flex gap-3">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-white text-[12px] font-semibold text-ink">{i + 1}</span>
              <span>{instruction}</span>
            </li>
          ))}
        </ol>
      )}
      {item.reference_label && (
        <div className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-muted">
          <BookOpen className="mt-0.5 size-4 shrink-0" />
          {item.reference_url ? <a href={item.reference_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{item.reference_label}</a> : <span>{item.reference_label}</span>}
        </div>
      )}

      {item.requires_manual_confirmation && (
        <div className="mt-5 rounded-2xl border border-warn-mid/40 bg-warn-soft p-4 text-[14px] leading-relaxed">
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={manualConfirmed} onChange={(e) => { setManualConfirmed(e.target.checked); setManualMissing(false); }} className="mt-1 size-5 shrink-0 accent-[#e3261b]" />
            <span>Confirmo que tengo el manual aplicable al modelo y número de serie de esta unidad, y que verifiqué el procedimiento de este trabajo.</span>
          </label>
          <button type="button" onClick={() => { setManualMissing(true); setManualConfirmed(false); }} className="mt-3 min-h-10 text-left font-medium underline underline-offset-2">No tengo el manual correcto</button>
          {manualMissing && <p role="status" className="mt-2 rounded-xl bg-white/70 p-3">No continúes ni intervengas el equipo sin el manual correcto. Puedes cerrar y retomar el paso cuando lo tengas; este aviso no se registra como falla mecánica.</p>}
        </div>
      )}

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
      <div className="mt-5 flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-semibold text-ink">{needed ? "Fotos necesarias" : "Fotos de apoyo (opcional)"}</span>
        <span className={cx("tabular shrink-0 text-[13px] font-semibold", missingPhotos ? "text-rhino-600" : "text-ok")}>
          {needed ? `${needed - missingPhotos} / ${needed} tomas` : `${ready.length} fotos`}
        </span>
      </div>
      {item.photo_hint && <p className="mt-1 text-[12px] leading-relaxed text-muted">{item.photo_hint}</p>}
      <div className="mt-3 space-y-3">
        {requiredSlots.map((slot) => {
          const shot = shots.find((s) => s.slot === slot);
          return (
            <section key={slot} className="overflow-hidden rounded-2xl border border-line-2">
              <div className="flex items-start gap-2.5 bg-canvas px-3 py-3 text-[13px] leading-relaxed">
                <span className={cx("grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold", shot?.status === "lista" ? "bg-ink text-white" : "bg-white text-ink")}>{slot + 1}</span>
                <span className="flex-1">{shotLabel(slot)}</span>
                {shot?.status === "lista" && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-label="Foto subida" />}
              </div>
              {shot ? (
                <ShotTile shot={shot} label={shotLabel(slot)} onRemove={() => remove(shot.key)} disabled={pending} />
              ) : (
                <button type="button" onClick={() => choosePhoto(slot)} disabled={processing || pending} className="flex min-h-28 w-full items-center justify-center gap-3 bg-white px-4 py-6 text-[15px] font-semibold text-ink transition active:bg-canvas disabled:opacity-50">
                  {processing && activeCaptureSlot === slot ? <Loader2 className="size-6 animate-spin" /> : <Camera className="size-6" />}
                  Tomar foto {slot + 1}
                </button>
              )}
            </section>
          );
        })}
        {shots.filter((s) => s.slot >= needed).sort((a, b) => a.slot - b.slot).map((shot) => (
          <section key={shot.key} className="overflow-hidden rounded-2xl border border-line-2">
            <div className="bg-canvas px-3 py-2 text-[13px] font-medium">{shotLabel(shot.slot)}</div>
            <ShotTile shot={shot} label={shotLabel(shot.slot)} onRemove={() => remove(shot.key)} disabled={pending} />
          </section>
        ))}
        {canAdd && missingPhotos === 0 && (
          <button type="button" onClick={() => choosePhoto(Array.from({ length: MAX_PHOTOS }, (_, i) => i).find((slot) => !shots.some((s) => s.slot === slot))!)} disabled={processing || pending} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-2 px-4 py-3 text-[14px] font-semibold text-ink-2 disabled:opacity-50">
            {processing ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Agregar foto adicional
          </button>
        )}
      </div>

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
        <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={3} aria-label={item.requires_manual_confirmation ? "Identificación del manual verificado" : "Resultado del paso"} className="mt-5 w-full rounded-2xl border-2 border-line-2 p-4 text-[16px] outline-none focus:border-ink" placeholder={item.requires_manual_confirmation ? "Código y edición del manual, modelo y serie comprobados" : "Escribe lo que revisaste"} />
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
        <button type="button" onClick={onBack} disabled={index === 0 || pending || processing} className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border-2 border-line-2 disabled:opacity-30" aria-label="Anterior">
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
              : !manualOk
                ? "Falta confirmar el manual aplicable a la unidad"
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

function ShotTile({ shot, label, onRemove, disabled }: { shot: Shot; label: string; onRemove: () => void; disabled: boolean }) {
  return (
    <div className="relative aspect-[4/3] bg-canvas">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shot.url} alt={label} className="absolute inset-0 size-full object-contain" />
      {shot.status === "subiendo" && <div className="absolute inset-0 grid place-items-center bg-black/35"><Loader2 className="size-7 animate-spin text-white" /></div>}
      {shot.status === "error" && <div className="absolute inset-0 flex items-center justify-center bg-rhino-600/80 px-8 text-center text-[13px] font-medium text-white">No se subió. Quita esta foto y toma otra.</div>}
      <button type="button" onClick={onRemove} disabled={shot.status === "subiendo" || disabled} className="absolute top-2 right-2 grid size-10 place-items-center rounded-full bg-black/65 text-white backdrop-blur disabled:opacity-40" aria-label={`Quitar foto: ${label}`}><X className="size-5" /></button>
    </div>
  );
}

function Sign({ items, hourMeter, maintenance, onGoto, onSubmit }: { items: WizardItem[]; hourMeter: number | null; maintenance: boolean; onGoto: (i: number) => void; onSubmit: (name: string, hm: number | null) => Promise<string | null> }) {
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
            Hay fallas críticas: al firmar, la unidad quedará detenida y Rhino avisará a Dirección.
          </p>
        )}
      </div>

      {!hmItem && <p className="mt-4 text-[13px] text-muted">Horómetro registrado: {hourMeter == null ? "Pendiente" : `${hourMeter} h`}</p>}

      <label className="mt-6 block">
        <span className="text-[13px] font-medium text-ink-2">Nombre completo (firma)</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-14 w-full rounded-2xl border-2 border-line-2 px-4 text-[17px] outline-none focus:border-ink" autoComplete="name" />
      </label>
      <label className="mt-4 flex items-start gap-3 text-[14px] text-ink-2">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-5 accent-[#e3261b]" />
        Declaro que realicé {maintenance ? "los pasos registrados de este mantenimiento" : "esta revisión"} físicamente, frente a la unidad, y que las fotos corresponden al trabajo realizado.
      </label>
      {maintenance && <p className="mt-3 text-[12px] leading-relaxed text-muted">La firma guarda este checklist. El responsable del taller revisa el resultado antes de cerrar la orden de mantenimiento; no libera por sí sola la unidad para operar.</p>}
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

function Done({ final, crane, maintenance }: { final: { result: string | null; score: number | null; flags: string[] }; crane: Props["crane"]; maintenance: boolean }) {
  const ok = final.result === "aprobada";
  const rejected = final.result === "rechazada";
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className={cx("grid size-24 place-items-center rounded-full", ok ? "bg-ok-soft text-ok" : rejected ? "bg-rhino-500 text-white" : "bg-warn-soft text-warn")}>
        {ok ? <CheckCircle2 className="size-12" /> : rejected ? <ShieldX className="size-12" /> : <AlertTriangle className="size-12" />}
      </div>
      <h2 className="mt-6 text-[30px] font-semibold">{maintenance ? rejected ? "Mantenimiento con falla crítica" : "Checklist de mantenimiento registrado" : ok ? "Revisión aprobada" : rejected ? "Unidad detenida" : "Aprobada con observaciones"}</h2>
      <p className="mt-2 max-w-sm text-[15px] text-muted">
        {maintenance
          ? rejected
            ? `Se registraron fallas críticas en ${crane.code}. La unidad permanece fuera de servicio hasta que el responsable del taller resuelva y verifique las fallas.`
            : "Las respuestas, fotos y firma quedaron guardadas. El responsable del taller debe revisar este resultado y cerrar la orden; este checklist no libera automáticamente la unidad."
          : ok
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
