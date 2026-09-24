export const documentTypes = [
  { id: "insurance", label: "Seguro" },
  { id: "certification", label: "Certificación" },
  { id: "municipal", label: "Tarjeta de circulación municipal" },
];

export function todayISO() {
  const now = new Date();
  return [
    String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function dateValue(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  if (value.startsWith("0000-")) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    return null;
  return date.getTime();
}

export function expiryStatus(doc, asOf = todayISO()) {
  const expiration = dateValue(doc?.expiresOn);
  const current = dateValue(asOf);
  if (expiration === null || current === null)
    return { key: "missing", label: "Sin fecha válida", days: null };
  const days = (expiration - current) / 86400000;
  if (days < 0) return { key: "expired", label: "Vencido", days };
  if (days <= 30) return { key: "soon", label: "Por vencer", days };
  return { key: "valid", label: "Vigente", days };
}

export function validateDocument(draft) {
  const clean = (value) => (typeof value === "string" ? value.trim() : "");
  const document = {
    id: draft?.id,
    type: clean(draft?.type),
    title: clean(draft?.title),
    issuer: clean(draft?.issuer),
    number: clean(draft?.number),
    issuedOn: clean(draft?.issuedOn),
    expiresOn: clean(draft?.expiresOn),
    notes: clean(draft?.notes),
  };
  if (!documentTypes.some((type) => type.id === document.type))
    throw new Error("Selecciona un tipo de documento válido.");
  if (!document.title) throw new Error("Escribe el título del documento.");
  if (!document.issuer) throw new Error("Escribe el emisor del documento.");
  if (!document.number) throw new Error("Escribe el folio del documento.");
  const issued = dateValue(document.issuedOn);
  const expiration = dateValue(document.expiresOn);
  if (issued === null) throw new Error("Revisa la fecha de emisión.");
  if (expiration === null) throw new Error("Revisa la fecha de vencimiento.");
  if (issued > expiration)
    throw new Error(
      "La fecha de vencimiento debe ser igual o posterior a la emisión.",
    );
  return document;
}

const expirationExamples = [
  ["2026-10-09", "2026-11-30", "2027-04-30", "2026-09-30"],
  ["2027-03-31", "2026-10-04", "2027-01-31", "2026-12-31"],
  ["2026-09-14", "2027-02-28", "2026-10-20", "2026-09-18"],
  ["2027-06-30", "2026-09-18", "2026-09-23", "2027-01-31"],
  ["2026-09-24", "2027-08-31", "2027-07-31", "2026-10-24"],
];

const documentExamples = [
  {
    type: "insurance",
    title: "Póliza de seguro · ejemplo",
    issuer: "Aseguradora de ejemplo (ficticia)",
    prefix: "SEG",
  },
  {
    type: "certification",
    title: "Certificación de inspección del equipo · ejemplo",
    issuer: "Centro de inspección de ejemplo (ficticio)",
    prefix: "INS",
  },
  {
    type: "certification",
    title: "Certificación de prueba de carga · ejemplo",
    issuer: "Laboratorio de prueba de ejemplo (ficticio)",
    prefix: "CAR",
  },
  {
    type: "municipal",
    title: "Tarjeta de circulación municipal · ejemplo",
    issuer: "Dependencia municipal de ejemplo (ficticia)",
    prefix: "MUN",
  },
];

export const initialDocuments = Object.fromEntries(
  Array.from({ length: 15 }, (_, index) => {
    const craneId = `RH-${String(index + 1).padStart(2, "0")}`;
    const expirations = expirationExamples[index % expirationExamples.length];
    return [
      craneId,
      documentExamples.map((example, documentIndex) => ({
        id: `${craneId}-${example.prefix.toLowerCase()}`,
        type: example.type,
        title: example.title,
        issuer: example.issuer,
        number: `DEMO-${example.prefix}-${craneId}-2026`,
        issuedOn: "2026-01-15",
        expiresOn: expirations[documentIndex],
        notes:
          "Datos ficticios de ejemplo para demostrar el expediente. No acredita seguro, certificación ni permiso real.",
      })),
    ];
  }),
);
