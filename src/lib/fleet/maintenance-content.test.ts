import test from "node:test";
import assert from "node:assert/strict";
import { buildSergioFleet } from "./sergio";
import { CHECKLIST_VERSION, maintenanceChecklist } from "./maintenance-checklists";

test("all 48 curated maintenance plans cover the 114 assignments in Sergio's fleet", () => {
  const fleet = buildSergioFleet();
  const assignments = fleet.flatMap((unit) => unit.fleet_profile!.maintenance_plans);
  assert.equal(fleet.length, 23);
  assert.equal(assignments.length, 114);
  assert.equal(new Set(assignments.map((plan) => plan.id)).size, 48);
  for (const plan of assignments) {
    assert.equal(plan.checklist_version, CHECKLIST_VERSION);
    assert.ok(plan.checklist_steps!.length >= 8 && plan.checklist_steps!.length <= 15, plan.id);
    assert.equal(new Set(plan.checklist_steps!.map((item) => item.id)).size, plan.checklist_steps!.length, plan.id);
  }
});

test("every checklist starts with one manual gate and requires directed photographic evidence", () => {
  for (const unit of buildSergioFleet()) {
    const profile = unit.fleet_profile!;
    for (const plan of profile.maintenance_plans) {
      const items = plan.checklist_steps!;
      const gate = items[0];
      assert.equal(gate.requires_manual_confirmation, true, plan.id);
      assert.equal(gate.response_type, "texto", plan.id);
      assert.equal(gate.critical, true, plan.id);
      assert.equal(gate.min_photos, 2, plan.id);
      assert.match(gate.photo_requirements[0], /Placa/);
      assert.match(gate.photo_requirements[1], /manual/);
      assert.equal(items.filter((item) => item.requires_manual_confirmation).length, 1, plan.id);
      for (const item of items) {
        assert.ok(item.instructions && item.procedure_steps.length >= 3, item.id);
        assert.ok(item.min_photos >= 1 && item.min_photos <= 8, item.id);
        assert.equal(item.photo_requirements.length, item.min_photos, item.id);
        assert.ok(item.photo_requirements.every((requirement) => requirement.trim().length > 15), item.id);
        assert.ok(item.photo_hint.length > 20, item.id);
        assert.ok(item.reference_locator.length > 30, item.id);
        assert.ok(item.source_ids.length > 0, item.id);
        for (const id of item.source_ids) {
          assert.ok(plan.source_ids.includes(id), `${item.id}: ${id}`);
          const source = profile.sources.find((source) => source.id === id);
          assert.ok(source, `${item.id}: ${id}`);
          assert.equal(new URL(source!.url).protocol, "https:");
        }
        // No unverified measurements or automatic acceptance thresholds are imported.
        assert.equal(item.min_value, null, item.id);
        assert.equal(item.max_value, null, item.id);
      }
    }
  }
});

test("component checks stay separate and evidence increases where multiple views are needed", () => {
  const fleet = buildSergioFleet();
  const plans = fleet.flatMap((unit) => unit.fleet_profile!.maintenance_plans);
  const brakes = plans.find((plan) => plan.id === "ford-brakes-running-gear")!.checklist_steps!;
  for (const suffix of [":brakes", ":steering", ":suspension", ":tires"]) {
    assert.equal(brakes.filter((item) => item.id.endsWith(suffix)).length, 1);
  }
  assert.equal(brakes.find((item) => item.id.endsWith(":tires"))!.min_photos, 4);
  const engine = plans.find((plan) => plan.id === "truck-engine")!.checklist_steps!;
  assert.equal(engine.find((item) => item.id.endsWith(":oilChange"))!.min_photos, 3);
  const hiab = plans.find((plan) => plan.id === "hiab-preuse")!.checklist_steps!;
  assert.ok(!hiab.some((item) => [":rope", ":winch", ":sheaves"].some((suffix) => item.id.endsWith(suffix))));
  const trailer = plans.find((plan) => plan.id === "trailer-structure")!.checklist_steps!;
  assert.ok(trailer.some((item) => item.id.endsWith(":trailerSupports")));
  assert.ok(!trailer.some((item) => ["Pluma", "Izaje", "Telescopaje"].includes(item.section)));
});

test("optional equipment has a documented alternative instead of requiring a nonexistent component", () => {
  const fleet = buildSergioFleet();
  const figo = fleet.find((unit) => unit.code === "PEND-FIGO")!;
  const load = figo.fleet_profile!.maintenance_plans.find((plan) => plan.id === "ford-preuse")!.checklist_steps!.find((item) => item.id.endsWith(":load"))!;
  assert.match(load.instructions, /No equipado, confirmado en manual/);
  assert.ok(load.photo_requirements.every((requirement) => /o carrocería|o segunda vista/.test(requirement)));
  const cat = fleet.find((unit) => unit.code === "GR-19")!;
  const supports = cat.fleet_profile!.maintenance_plans.find((plan) => plan.id === "telehandler-boom")!.checklist_steps!.find((item) => item.id.endsWith(":outriggers"))!;
  assert.ok(supports.photo_requirements.every((requirement) => requirement.includes("si no equipa")));
  assert.equal(supports.critical, true, "An optional configuration must not suppress a genuine fault");
});

test("reference copies and procedure arrays do not leak edits between units or future runs", () => {
  const fleet = buildSergioFleet();
  const plan = fleet[0].fleet_profile!.maintenance_plans[0];
  const original = maintenanceChecklist(plan);
  const second = maintenanceChecklist(plan);
  original[1].procedure_steps[0] = "edited";
  original[1].photo_requirements[0] = "edited";
  original[1].source_ids.length = 0;
  assert.notEqual(second[1].procedure_steps[0], "edited");
  assert.notEqual(second[1].photo_requirements[0], "edited");
  assert.ok(second[1].source_ids.length > 0);
  assert.throws(() => maintenanceChecklist({ ...plan, id: "unmapped-plan" }), /No existe checklist curado/);
});
