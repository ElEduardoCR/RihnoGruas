import Link from "next/link";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { CraneStatus } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/labels";
import type { DocHealth } from "@/lib/domain/fleet";

export const cx = (...v: ClassValue[]) => twMerge(clsx(v));

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-[13px] font-medium text-rhino-600">{eyebrow}</div>}
        <h1 className="text-[28px] leading-[1.1] font-semibold text-ink sm:text-[34px]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-[15px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({
  children,
  className,
  as: As = "section",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
  id?: string;
}) {
  return (
    <As id={id} className={cx("min-w-0 rounded-[22px] border border-black/[0.04] bg-white shadow-[var(--shadow-card)]", className)}>
      {children}
    </As>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-start justify-between gap-3 px-5 pt-5 sm:px-6", className)}>
      <div className="min-w-0">
        <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

type ButtonVariant = "primary" | "dark" | "outline" | "ghost" | "danger-ghost";
const BTN: Record<ButtonVariant, string> = {
  primary: "bg-rhino-500 text-white hover:bg-rhino-600 shadow-[0_1px_0_rgb(255_255_255/0.2)_inset]",
  dark: "bg-ink text-white hover:bg-black",
  outline: "border border-line-2 bg-white text-ink hover:bg-canvas",
  ghost: "text-ink hover:bg-black/[0.05]",
  "danger-ghost": "text-rhino-600 hover:bg-rhino-50",
};

export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" | "lg" = "md") {
  return cx(
    "inline-flex select-none items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rhino-500",
    size === "sm" && "h-8 px-3.5 text-[13px]",
    size === "md" && "h-10 px-5 text-[14px]",
    size === "lg" && "h-12 px-6 text-[16px]",
    BTN[variant],
  );
}

export function LinkButton({
  href,
  children,
  variant = "outline",
  size = "md",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <Link href={href} className={cx(buttonClass(variant, size), className)}>
      {children}
    </Link>
  );
}

export const STATUS_STYLE: Record<CraneStatus, { pill: string; dot: string; bar: string }> = {
  disponible: { pill: "bg-ok-soft text-ok", dot: "bg-ok", bar: "bg-ok" },
  rentada: { pill: "bg-ink text-white", dot: "bg-ink", bar: "bg-ink" },
  mantenimiento: { pill: "bg-warn-soft text-warn", dot: "bg-warn-mid", bar: "bg-warn-mid" },
  detenida: { pill: "bg-rhino-50 text-rhino-600", dot: "bg-rhino-500", bar: "bg-rhino-500" },
};

export function StatusPill({ status, className }: { status: CraneStatus; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium", STATUS_STYLE[status].pill, className)}>
      <span className={cx("size-1.5 rounded-full", status === "rentada" ? "bg-rhino-500" : STATUS_STYLE[status].dot)} />
      {STATUS_LABELS[status]}
    </span>
  );
}

type Tone = "neutral" | "red" | "green" | "amber" | "dark" | "outline";
const TONE: Record<Tone, string> = {
  neutral: "bg-black/[0.05] text-ink-2",
  red: "bg-rhino-50 text-rhino-600",
  green: "bg-ok-soft text-ok",
  amber: "bg-warn-soft text-warn",
  dark: "bg-ink text-white",
  outline: "border border-line-2 text-ink-2",
};

export function Badge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium", TONE[tone], className)}>
      {children}
    </span>
  );
}

export function DocHealthBadge({ health, days }: { health: DocHealth; days?: number | null }) {
  if (health === "vencido") return <Badge tone="red">Vencido{days != null ? ` · hace ${Math.abs(days)} d` : ""}</Badge>;
  if (health === "por_vencer") return <Badge tone="amber">{days != null ? `Vence en ${days} d` : "Por vencer"}</Badge>;
  return <Badge tone="green">Vigente</Badge>;
}

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "neutral" | "red" | "green" | "amber" | "dark";
  icon?: React.ReactNode;
}) {
  return (
    <Card className={cx("p-5", tone === "dark" && "bg-ink text-white")} as="div">
      <div className="flex items-center justify-between">
        <span className={cx("text-[13px] font-medium", tone === "dark" ? "text-white/60" : "text-muted")}>{label}</span>
        {icon && (
          <span
            className={cx(
              "grid size-8 place-items-center rounded-full",
              tone === "red" && "bg-rhino-50 text-rhino-600",
              tone === "green" && "bg-ok-soft text-ok",
              tone === "amber" && "bg-warn-soft text-warn",
              tone === "neutral" && "bg-canvas text-ink-2",
              tone === "dark" && "bg-white/10 text-white",
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="tabular mt-3 text-[32px] leading-none font-semibold tracking-tight">{value}</div>
      {hint && <div className={cx("mt-2 text-[13px]", tone === "dark" ? "text-white/60" : "text-muted")}>{hint}</div>}
    </Card>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      {icon && <div className="mb-3 text-faint">{icon}</div>}
      <div className="text-[15px] font-medium text-ink">{title}</div>
      {children && <div className="mt-1 max-w-sm text-[13px] text-muted">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}

export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px] rounded-[22px]" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-[220px] rounded-[22px]" />
      ))}
    </div>
  );
}

export function KeyValue({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-0">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className={cx("text-right text-[14px] font-medium text-ink", mono && "font-mono text-[13px]")}>{children ?? "—"}</dd>
    </div>
  );
}

export function Progress({ value, tone = "dark" }: { value: number; tone?: "dark" | "red" | "amber" | "green" }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
      <div
        className={cx(
          "h-full rounded-full",
          tone === "dark" && "bg-ink",
          tone === "red" && "bg-rhino-500",
          tone === "amber" && "bg-warn-mid",
          tone === "green" && "bg-ok",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "h-11 w-full rounded-xl border border-line-2 bg-white px-3.5 text-[15px] text-ink outline-none transition placeholder:text-faint focus:border-ink focus:ring-4 focus:ring-black/5";

export const selectClass = cx(inputClass, "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236e6e73%22 stroke-width=%222.5%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[right_14px_center] bg-no-repeat pr-9");

export function Tabs({ tabs, active }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <nav className="scroll-x -mx-1 mb-5 flex gap-1 px-1">
      <div className="inline-flex rounded-full bg-black/[0.05] p-1">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            scroll={false}
            className={cx(
              "flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium transition",
              active === t.key ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className={cx("rounded-full px-1.5 text-[11px]", active === t.key ? "bg-rhino-500 text-white" : "bg-black/10 text-ink-2")}>
                {t.count}
              </span>
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}
