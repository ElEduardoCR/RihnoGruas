import type { CraneType } from "@/lib/types";

/** Isotipo Rhino: cuerno estilizado sobre cuadro rojo. */
export function RhinoMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect width="40" height="40" rx="11" fill="#e3261b" />
      <path d="M9 29c2.5-7.5 8.5-12.5 16-14l6-6c-.6 5.4-2.4 9.5-5.6 12.3L31 29H9Z" fill="#fff" />
      <path d="M21.5 23.5a1.6 1.6 0 1 0 0-.01" fill="#e3261b" />
    </svg>
  );
}

export function CraneIcon({ className = "size-5", strokeWidth = 1.8 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 20h9" />
      <path d="M5 20V9h4v11" />
      <path d="M7 9 19 4" />
      <path d="M9 9h12" />
      <path d="M19 4v5" />
      <path d="M18 9v4" />
      <path d="M16.5 13h3l-1.5 2.5" />
    </svg>
  );
}

/** Ilustraciones lineales por tipo de grúa para tarjetas y expediente. */
export function CraneArt({ type, className = "h-full w-full", tone = "light" }: { type: CraneType; className?: string; tone?: "light" | "dark" }) {
  const stroke = tone === "dark" ? "#fff" : "#1d1d1f";
  const accent = "#e3261b";
  const ground = tone === "dark" ? "rgba(255,255,255,.18)" : "rgba(0,0,0,.08)";
  if (type === "vehiculo_apoyo" || type === "tractocamion" || type === "remolque") {
    return (
      <svg viewBox="0 0 240 140" className={className} aria-hidden>
        <line x1="10" y1="128" x2="230" y2="128" stroke={ground} strokeWidth="2" />
        {type === "remolque" ? (
          <>
            <path d="M24 72h28v25h162v12H42V84H24z" fill={accent} />
            <path d="M60 109v14M56 123h14" stroke={stroke} strokeWidth="4" />
          </>
        ) : type === "tractocamion" ? (
          <>
            <rect x="32" y="96" width="174" height="15" rx="3" fill={stroke} />
            <path d="M132 95V52h43l20 27h19v32h-82z" fill={accent} />
            <path d="M155 60h16l15 20h-31z" fill={tone === "dark" ? "#0b0b0c" : "#fff"} />
            <path d="M66 89h40" stroke={stroke} strokeWidth="6" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M30 104V88l33-8 22-28h74l28 31 25 9v20H30z" fill={accent} />
            <path d="M91 60h29v23H73zM128 60h26l21 23h-47z" fill={tone === "dark" ? "#0b0b0c" : "#fff"} />
          </>
        )}
        {(type === "remolque" ? [160, 190] : type === "tractocamion" ? [58, 86, 190] : [61, 180]).map((x) => (
          <g key={x}>
            <circle cx={x} cy="114" r="12" fill={stroke} />
            <circle cx={x} cy="114" r="5" fill={tone === "dark" ? "#0b0b0c" : "#fff"} />
          </g>
        ))}
      </svg>
    );
  }
  if (type === "telehandler") {
    return (
      <svg viewBox="0 0 240 140" className={className} aria-hidden>
        <line x1="10" y1="128" x2="230" y2="128" stroke={ground} strokeWidth="2" />
        <rect x="35" y="90" width="112" height="22" rx="5" fill={accent} />
        <path d="M59 92V58h36l10 34z" fill={stroke} />
        <path d="M65 64h24l8 23H65z" fill={tone === "dark" ? "#0b0b0c" : "#fff"} />
        <path d="M112 91 196 39" stroke={stroke} strokeWidth="12" strokeLinecap="round" />
        <path d="M145 70 196 39" stroke={accent} strokeWidth="4" strokeLinecap="round" />
        <path d="M197 40v35h27M204 74v9h20" stroke={stroke} strokeWidth="4" fill="none" />
        {[55, 132].map((x) => (
          <g key={x}>
            <circle cx={x} cy="112" r="15" fill={stroke} />
            <circle cx={x} cy="112" r="6" fill={tone === "dark" ? "#0b0b0c" : "#fff"} />
          </g>
        ))}
      </svg>
    );
  }
  if (type === "grua_armable") {
    return (
      <svg viewBox="0 0 240 140" className={className} aria-hidden>
        <line x1="10" y1="128" x2="230" y2="128" stroke={ground} strokeWidth="2" />
        <rect x="96" y="116" width="34" height="12" rx="2" fill={stroke} opacity=".9" />
        {Array.from({ length: 6 }).map((_, i) => (
          <g key={i} stroke={stroke} strokeWidth="2" fill="none">
            <rect x="104" y={34 + i * 14} width="18" height="14" />
            <line x1="104" y1={34 + i * 14} x2="122" y2={48 + i * 14} />
          </g>
        ))}
        <line x1="40" y1="34" x2="224" y2="34" stroke={stroke} strokeWidth="2.5" />
        <line x1="40" y1="42" x2="224" y2="42" stroke={stroke} strokeWidth="1.5" />
        {Array.from({ length: 12 }).map((_, i) => (
          <line key={i} x1={44 + i * 15} y1="42" x2={51 + i * 15} y2="34" stroke={stroke} strokeWidth="1.2" />
        ))}
        <path d="M113 34 L113 14 L60 34 M113 14 L190 34" stroke={stroke} strokeWidth="1.5" fill="none" />
        <rect x="40" y="42" width="26" height="16" rx="2" fill={accent} />
        <line x1="182" y1="42" x2="182" y2="86" stroke={stroke} strokeWidth="1.2" />
        <path d="M178 86h8l-4 7z" fill={accent} />
        <rect x="122" y="40" width="12" height="10" rx="2" fill={accent} />
      </svg>
    );
  }
  if (type === "camion_grua") {
    return (
      <svg viewBox="0 0 240 140" className={className} aria-hidden>
        <line x1="10" y1="128" x2="230" y2="128" stroke={ground} strokeWidth="2" />
        <rect x="30" y="92" width="150" height="16" rx="3" fill={stroke} />
        <path d="M180 108V78c0-3 2-5 5-5h18l14 16v19z" fill={accent} />
        <path d="M188 80h14l9 10h-23z" fill={tone === "dark" ? "#0b0b0c" : "#fff"} opacity=".85" />
        {[52, 78, 196].map((x) => (
          <g key={x}>
            <circle cx={x} cy="114" r="11" fill={stroke} />
            <circle cx={x} cy="114" r="4" fill={tone === "dark" ? "#0b0b0c" : "#fff"} />
          </g>
        ))}
        <rect x="150" y="70" width="18" height="22" rx="3" fill={stroke} />
        <path d="M159 72 L120 30 L60 44" stroke={stroke} strokeWidth="9" strokeLinecap="round" fill="none" />
        <path d="M159 72 L120 30 L60 44" stroke={accent} strokeWidth="2" strokeLinecap="round" fill="none" opacity=".9" />
        <line x1="60" y1="44" x2="60" y2="74" stroke={stroke} strokeWidth="1.4" />
        <path d="M56 74h8l-4 7z" fill={accent} />
        <rect x="36" y="104" width="6" height="18" fill={stroke} />
        <rect x="30" y="120" width="18" height="4" rx="1" fill={stroke} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 240 140" className={className} aria-hidden>
      <line x1="10" y1="128" x2="230" y2="128" stroke={ground} strokeWidth="2" />
      <rect x="40" y="94" width="130" height="18" rx="4" fill={stroke} />
      {[62, 148].map((x) => (
        <g key={x}>
          <circle cx={x} cy="114" r="13" fill={stroke} />
          <circle cx={x} cy="114" r="5" fill={tone === "dark" ? "#0b0b0c" : "#fff"} />
        </g>
      ))}
      <rect x="100" y="74" width="40" height="22" rx="4" fill={accent} />
      <rect x="128" y="62" width="22" height="26" rx="4" fill={stroke} />
      <path d="M132 66h14v10h-14z" fill={tone === "dark" ? "#0b0b0c" : "#fff"} opacity=".85" />
      <path d="M112 78 L214 22" stroke={stroke} strokeWidth="10" strokeLinecap="round" />
      <path d="M150 57 L214 22" stroke={accent} strokeWidth="3" strokeLinecap="round" />
      <line x1="214" y1="22" x2="214" y2="70" stroke={stroke} strokeWidth="1.4" />
      <path d="M210 70h8l-4 7z" fill={accent} />
      <path d="M40 112 l-14 12h20z M170 112 l14 12h-20z" fill={stroke} opacity=".7" />
    </svg>
  );
}
