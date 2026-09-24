import test from "node:test";
import assert from "node:assert/strict";
import {
  shoppingList,
  attentionItems,
  prepareEvent,
  voiceExample,
  initialEvents,
} from "../dist/executive-model.js";
import {
  initialInventory,
  completeService,
  serviceOrders,
  adjustStock,
} from "../dist/inventory.js";
import { initialRecords, initialFleet, profitability } from "../dist/model.js";
test("consumo único, registro de costo y compras solo hasta mínimo", () => {
  const done = completeService(initialInventory, [], "MT-026");
  assert.deepEqual(
    ["aceite-h", "filtro-h", "grasa", "filtro-a"].map(
      (id) => done.items.find((i) => i.id === id).quantity,
    ),
    [12, 2, 8, 4],
  );
  assert.equal(done.record.cost, 4410);
  assert.equal(done.movements.length, 3);
  assert.deepEqual(
    shoppingList(done.items)
      .filter((i) => i.id === "aceite-h")
      .map((i) => [i.id, i.missing]),
    [["aceite-h", 3]],
  );
  assert.throws(() => completeService(done.items, done.completed, "MT-026"));
  assert.equal(
    shoppingList(
      adjustStock(done.items, "aceite-h", 15, "Reposición").items,
    ).filter((i) => i.id === "aceite-h").length,
    0,
  );
});
test("faltantes bloquean toda la operación y ajustes rechazan negativos y fracciones de piezas", () => {
  const insufficient = adjustStock(
    initialInventory,
    "aceite-h",
    10,
    "Conteo",
  ).items;
  assert.throws(() => completeService(insufficient, [], "MT-026"));
  assert.deepEqual(
    ["aceite-h", "filtro-h", "grasa", "filtro-a"].map(
      (id) => insufficient.find((i) => i.id === id).quantity,
    ),
    [10, 3, 10, 4],
  );
  assert.throws(() => adjustStock(initialInventory, "filtro-h", 1.5, "Conteo"));
  assert.throws(() => adjustStock(initialInventory, "grasa", -1, "Conteo"));
});
test("atención depende de registros y se resuelve al cerrar y corregir", () => {
  const records = initialRecords.map((r) => ({
    ...r,
    closed: r.id !== 109,
    observations: r.id === 109 ? "" : "Finalizado",
  }));
  let alerts = attentionItems(records, serviceOrders, []);
  assert.equal(alerts.find((i) => i.id === "109").reasons.length, 3);
  const r = records.find((r) => r.id === 109);
  Object.assign(r, { income: 10000, closed: true, observations: "Finalizado" });
  alerts = attentionItems(records, serviceOrders, ["MT-026"]);
  assert.deepEqual(
    alerts.map((a) => a.id),
    ["MT-027"],
  );
});
test("nota editada conserva datos y rechaza duplicados de nota y de evento", () => {
  const draft = {
    ...voiceExample,
    date: "2026-10-03",
    time: "10:30",
    details: "Detalle editado",
  };
  const event = prepareEvent(
    initialEvents,
    draft,
    initialFleet,
    voiceExample.id,
  );
  assert.equal(event.details, "Detalle editado");
  assert.equal(event.date, "2026-10-03");
  const events = [...initialEvents, { ...event, id: "nuevo" }];
  assert.throws(() =>
    prepareEvent(events, draft, initialFleet, voiceExample.id),
  );
  assert.throws(() => prepareEvent(events, draft, initialFleet));
  assert.equal(
    prepareEvent(
      events,
      { ...draft, time: "11:00" },
      initialFleet,
      voiceExample.id,
      "nuevo",
    ).time,
    "11:00",
  );
});
test("eventos rechazan fechas, horas y grúas inválidas", () => {
  for (const values of [
    { date: "2026-02-30" },
    { time: "25:10" },
    { crane: "RH-99" },
    { details: " " },
  ])
    assert.throws(() =>
      prepareEvent(initialEvents, { ...voiceExample, ...values }, initialFleet),
    );
});
test("rentabilidad conserva cálculo y detección de pérdida", () => {
  const result = profitability({
    fixed: 28000,
    hours: 80,
    variable: 650,
    margin: 30,
    rate: 900,
  });
  assert.equal(result.cost, 1000);
  assert.equal(result.profit, -100);
  assert.ok(Math.abs(result.suggested - 1428.5714) < 0.001);
});

import {
  checklistItems,
  checklistTypes,
  validateInspection,
} from "../dist/checklist-model.js";
import { occursOn } from "../dist/executive-model.js";
import { existsSync } from "node:fs";
test("catálogo completo, fotos locales y referencias íntegras", () => {
  assert.equal(initialFleet.length, 15);
  assert.ok(new Set(initialFleet.map((f) => f.family)).size >= 6);
  for (const f of initialFleet) {
    assert.ok(existsSync(new URL("../dist/" + f.photo, import.meta.url)));
    assert.ok(f.meterHours > f.hours);
  }
  assert.equal(initialInventory.length, 36);
  assert.equal(new Set(initialInventory.map((i) => i.id)).size, 36);
  for (const r of [...initialRecords, ...initialEvents, ...serviceOrders])
    assert.ok(initialFleet.some((f) => f.id === r.crane));
  assert.ok(initialEvents.length >= 35);
});
test("checklist valida lecturas, fechas, respuestas y hallazgos sin alterar el equipo", () => {
  const f = initialFleet[0],
    snapshot = structuredClone(f),
    type = checklistTypes[0];
  const d = {
    crane: f.id,
    type,
    operator: "Operador de prueba",
    place: "Patio de prueba",
    date: "2026-09-25",
    meter: f.meterHours + 2,
    answers: Object.fromEntries(
      checklistItems(f, type).map((i) => [i.id, "ok"]),
    ),
    notes: "",
    confirmed: true,
  };
  assert.equal(validateInspection(d, initialFleet).needsReview, false);
  for (const edit of [
    { meter: f.meterHours - 1 },
    { meter: "" },
    { meter: Infinity },
    { date: "2026-02-30" },
    { answers: {} },
    { confirmed: false },
  ])
    assert.throws(() => validateInspection({ ...d, ...edit }, initialFleet));
  const issue = { ...d, answers: { ...d.answers, hydraulic: "issue" } };
  assert.throws(() => validateInspection(issue, initialFleet));
  assert.equal(
    validateInspection(
      { ...issue, notes: "Humedad en unión. Solicitar revisión." },
      initialFleet,
    ).needsReview,
    true,
  );
  assert.deepEqual(f, snapshot);
  for (const type of checklistTypes)
    assert.ok(
      checklistItems(initialFleet[9], type).some((i) => i.id === "rope"),
    );
});
test("calendario admite rangos y conserva tipo; rechaza fin anterior y fechas inexistentes", () => {
  const draft = {
    ...voiceExample,
    title: "Reserva de prueba",
    date: "2026-10-10",
    time: "08:00",
    endDate: "2026-10-12",
    endTime: "17:00",
    kind: "Reserva",
  };
  const ev = prepareEvent(initialEvents, draft, initialFleet);
  assert.equal(ev.kind, "Reserva");
  assert.ok(occursOn(ev, "2026-10-11"));
  assert.equal(occursOn(ev, "2026-10-13"), false);
  for (const edit of [
    { endDate: "2026-10-09" },
    { endDate: draft.date, endTime: "07:00" },
    { endDate: "2026-02-30" },
    { kind: "Inválido" },
  ])
    assert.throws(() =>
      prepareEvent(initialEvents, { ...draft, ...edit }, initialFleet),
    );
});
test("insumos ajenos al servicio no cambian y el fallo deja todos intactos", () => {
  const snapshot = structuredClone(initialInventory),
    done = completeService(initialInventory, [], "MT-026");
  for (const item of snapshot.filter(
    (i) => !["aceite-h", "filtro-h", "grasa"].includes(i.id),
  ))
    assert.deepEqual(
      done.items.find((i) => i.id === item.id),
      item,
    );
  const insufficient = adjustStock(
      initialInventory,
      "aceite-h",
      0,
      "Prueba de faltante",
    ).items,
    copy = structuredClone(insufficient);
  assert.throws(() => completeService(insufficient, [], "MT-026"));
  assert.deepEqual(insufficient, copy);
  assert.deepEqual(initialInventory, snapshot);
});
