import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  documentTypes,
  todayISO,
  initialDocuments,
  expiryStatus,
  validateDocument,
} from "../dist/equipment-documents-model.js";

const example = {
  id: "RH-01-seg",
  type: "insurance",
  title: "Seguro de ejemplo",
  issuer: "Emisor ficticio",
  number: "DEMO-001",
  issuedOn: "2026-01-01",
  expiresOn: "2026-09-24",
  notes: "Datos de ejemplo.",
};

test("vencimiento distingue 31, 30, 0 y -1 días sin vencer anticipadamente", () => {
  const asOf = "2026-09-24";
  for (const [expiresOn, key, days] of [
    ["2026-10-25", "valid", 31],
    ["2026-10-24", "soon", 30],
    ["2026-09-25", "soon", 1],
    ["2026-09-24", "soon", 0],
    ["2026-09-23", "expired", -1],
  ]) {
    const status = expiryStatus({ expiresOn }, asOf);
    assert.equal(status.key, key);
    assert.equal(status.days, days);
    assert.ok(status.label.length > 0);
  }
  assert.equal(expiryStatus(example, "2026-09-25").key, "expired");
  assert.equal(expiryStatus({ expiresOn: todayISO() }).days, 0);
});

test("vencimiento admite bisiestos reales y cruces de año o de horario", () => {
  assert.equal(expiryStatus({ expiresOn: "2028-03-01" }, "2028-02-28").days, 2);
  assert.equal(expiryStatus({ expiresOn: "2028-02-29" }, "2028-02-28").days, 1);
  assert.equal(expiryStatus({ expiresOn: "2027-01-01" }, "2026-12-31").days, 1);
  assert.equal(expiryStatus({ expiresOn: "2026-11-02" }, "2026-11-01").days, 1);
});

test("fechas faltantes o inexistentes no producen vigencias aparentes", () => {
  for (const expiresOn of [
    undefined,
    null,
    "",
    " ",
    0,
    "2026-02-29",
    "2100-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-01",
    "2026-01-00",
    "2026-9-24",
    "2026-09-24T00:00:00Z",
    "0000-01-01",
    "garbage",
  ]) {
    assert.deepEqual(expiryStatus({ expiresOn }, "2026-09-24"), {
      key: "missing",
      label: "Sin fecha válida",
      days: null,
    });
  }
  assert.equal(expiryStatus(null, "2026-09-24").key, "missing");
  assert.equal(expiryStatus(example, "2026-02-30").key, "missing");
});

test("todayISO usa el día local aunque difiera del día UTC", () => {
  const moduleURL = new URL(
    "../dist/equipment-documents-model.js",
    import.meta.url,
  ).href;
  for (const [tz, expected] of [
    ["Pacific/Kiritimati", "2026-09-25"],
    ["America/Adak", "2026-09-24"],
  ]) {
    const script = `
      import { todayISO } from ${JSON.stringify(moduleURL)};
      const OriginalDate = Date;
      globalThis.Date = class extends OriginalDate {
        constructor(...args) {
          super(...(args.length ? args : ["2026-09-24T12:30:00Z"]));
        }
      };
      process.stdout.write(todayISO());
    `;
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        encoding: "utf8",
        env: { ...process.env, TZ: tz },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, expected);
  }
});

test("las quince grúas tienen cuatro documentos ficticios de los tres tipos", () => {
  assert.deepEqual(
    Object.keys(initialDocuments),
    Array.from(
      { length: 15 },
      (_, index) => `RH-${String(index + 1).padStart(2, "0")}`,
    ),
  );
  assert.deepEqual(
    documentTypes.map((type) => type.id),
    ["insurance", "certification", "municipal"],
  );
  const allIds = new Set();
  const statuses = new Set();
  for (const documents of Object.values(initialDocuments)) {
    assert.equal(documents.length, 4);
    assert.deepEqual(
      documents.map((document) => document.type),
      ["insurance", "certification", "certification", "municipal"],
    );
    assert.notEqual(documents[1].title, documents[2].title);
    for (const document of documents) {
      assert.deepEqual(validateDocument(document), document);
      assert.match(document.title, /ejemplo/i);
      assert.match(document.notes, /ficticios/i);
      assert.match(document.number, /^DEMO-/);
      allIds.add(document.id);
      statuses.add(expiryStatus(document, "2026-09-24").key);
    }
  }
  assert.equal(allIds.size, 60);
  assert.deepEqual([...statuses].sort(), ["expired", "soon", "valid"]);
});

test("editar recorta los valores, conserva id y no modifica la captura ni el expediente", () => {
  const draft = Object.fromEntries(
    Object.entries(example).map(([key, value]) => [
      key,
      key === "id" ? value : `  ${value}  `,
    ]),
  );
  const snapshot = structuredClone(draft);
  const saved = validateDocument(draft);
  assert.deepEqual(saved, example);
  assert.deepEqual(draft, snapshot);
  assert.notEqual(saved, draft);
  const original = structuredClone(initialDocuments["RH-01"]);
  const edited = validateDocument({
    ...initialDocuments["RH-01"][0],
    expiresOn: "2027-09-24",
    notes: " Renovado en la demo. ",
  });
  assert.equal(edited.id, initialDocuments["RH-01"][0].id);
  assert.equal(edited.notes, "Renovado en la demo.");
  assert.equal(expiryStatus(edited, "2026-09-24").key, "valid");
  assert.deepEqual(initialDocuments["RH-01"], original);
  assert.equal(validateDocument({ ...example, notes: undefined }).notes, "");
});

test("validación exige campos y ambas fechas reales en orden", () => {
  for (const edit of [
    { type: "unknown" },
    { type: null },
    { title: " " },
    { issuer: " " },
    { number: " " },
    { title: 123 },
    { issuedOn: "" },
    { expiresOn: "" },
    { issuedOn: "2026-02-29" },
    { expiresOn: "2026-02-30" },
    { issuedOn: "2026-9-01" },
    { expiresOn: "2026-13-01" },
    { issuedOn: "2026-09-25" },
  ]) {
    const draft = { ...example, ...edit };
    const snapshot = structuredClone(draft);
    assert.throws(() => validateDocument(draft), Error);
    assert.deepEqual(draft, snapshot);
  }
  assert.throws(() => validateDocument(null), Error);
  assert.equal(
    validateDocument({ ...example, issuedOn: example.expiresOn }).issuedOn,
    example.expiresOn,
  );
  assert.equal(
    validateDocument({
      ...example,
      issuedOn: "2028-02-29",
      expiresOn: "2028-03-01",
    }).issuedOn,
    "2028-02-29",
  );
  assert.equal(
    validateDocument({ ...example, issuedOn: "2000-02-29" }).issuedOn,
    "2000-02-29",
  );
});
