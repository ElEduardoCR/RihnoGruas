"use client";

import { createContext, useContext, useRef } from "react";
import { X } from "lucide-react";
import { buttonClass, cx } from "./ui";

const CloseCtx = createContext<() => void>(() => {});
export const useCloseModal = () => useContext(CloseCtx);

export function Modal({
  label,
  title,
  subtitle,
  children,
  variant = "primary",
  size = "md",
  icon,
  wide,
}: {
  label: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  variant?: "primary" | "dark" | "outline" | "ghost" | "danger-ghost";
  size?: "sm" | "md";
  icon?: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => ref.current?.close();
  return (
    <>
      <button type="button" className={buttonClass(variant, size)} onClick={() => ref.current?.showModal()}>
        {icon}
        {label}
      </button>
      <dialog
        ref={ref}
        className={cx(
          "m-auto max-h-[92dvh] w-[calc(100%-24px)] overflow-y-auto rounded-[26px] bg-white p-0 text-ink shadow-[var(--shadow-pop)]",
          wide ? "max-w-[720px]" : "max-w-[520px]",
        )}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-white/90 px-6 py-5 backdrop-blur">
          <div>
            <h2 className="text-[20px] font-semibold">{title}</h2>
            {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={close} className="grid size-8 place-items-center rounded-full bg-black/[0.05] text-muted hover:text-ink" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>
        <div className="px-6 py-5">
          <CloseCtx.Provider value={close}>{children}</CloseCtx.Provider>
        </div>
      </dialog>
    </>
  );
}

export function FormMessage({ state }: { state: { ok: boolean; message: string; details?: string[] } | null }) {
  if (!state) return null;
  return (
    <div className={cx("rounded-2xl px-4 py-3 text-[14px]", state.ok ? "bg-ok-soft text-ok" : "bg-rhino-50 text-rhino-700")}>
      <div className="font-medium">{state.message}</div>
      {state.details && state.details.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13px]">
          {state.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
