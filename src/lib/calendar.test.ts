import test from "node:test";
import assert from "node:assert/strict";
import { resolveCalendarRange } from "./calendar";
import { dayKey, fromDayKey } from "./time";

const now = fromDayKey("2026-11-08", 12);

test("month navigation selects a day whose events are loaded, not today in another month", () => {
  for (const d of [undefined, "2026-11-08"]) {
    const range = resolveCalendarRange({ m: "2026-12", d }, now);
    assert.equal(range.selected, "2026-12-01");
    assert.equal(dayKey(range.rangeStart), "2026-11-30");
    assert.equal(dayKey(range.rangeEnd), "2027-01-11");
  }
  assert.equal(resolveCalendarRange({ m: "2026-11" }, now).selected, "2026-11-08");
});

test("a clicked spillover day is retained inside the six-week grid, with an exclusive end", () => {
  assert.equal(resolveCalendarRange({ m: "2026-11", d: "2026-10-26" }, now).selected, "2026-10-26");
  assert.equal(resolveCalendarRange({ m: "2026-11", d: "2026-12-06" }, now).selected, "2026-12-06");
  assert.equal(resolveCalendarRange({ m: "2026-11", d: "2026-12-07" }, now).selected, "2026-11-08");
});

test("a valid selected day anchors the month when no valid month was supplied", () => {
  for (const m of [undefined, "invalid", "2026-13"]) {
    const range = resolveCalendarRange({ m, d: "2028-02-29" }, now);
    assert.equal(range.monthKey, "2028-02");
    assert.equal(range.selected, "2028-02-29");
    assert.equal(dayKey(range.weekStart), "2028-02-28");
  }
});

test("malformed or normalized dates fall back safely without crashing", () => {
  const invalidDays = ["foo", "", "2026-1-08", "2026-11-8", "2026-00-01", "2026-13-01", "2026-02-30", "2026-04-31", "2026-11-00", "2026-11-32", "2026-11-08T12:00", "2026-11-08 "];
  for (const date of invalidDays) {
    const range = resolveCalendarRange({ view: "invalid", m: date, w: date, d: date }, now);
    assert.equal(range.view, "mes", date);
    assert.equal(range.monthKey, "2026-11", date);
    assert.equal(range.selected, "2026-11-08", date);
    const timeline = resolveCalendarRange({ view: "linea", w: date, d: date }, now);
    assert.equal(dayKey(timeline.weekStart), "2026-11-02", date);
    assert.equal(timeline.selected, "2026-11-08", date);
  }
  for (const m of ["2026-00", "2026-13", "2026-1", "2026-11-01", "2026-11 "]) {
    assert.equal(resolveCalendarRange({ m }, now).monthKey, "2026-11", m);
  }
});

test("leap dates are validated against the actual calendar", () => {
  assert.equal(resolveCalendarRange({ d: "2028-02-29" }, now).selected, "2028-02-29");
  assert.equal(resolveCalendarRange({ d: "2000-02-29" }, now).selected, "2000-02-29");
  assert.equal(resolveCalendarRange({ d: "2027-02-29" }, now).selected, "2026-11-08");
  assert.equal(resolveCalendarRange({ d: "2100-02-29" }, now).selected, "2026-11-08");
});

test("an explicit week wins and retains a selected day within its two-week range", () => {
  const range = resolveCalendarRange({ view: "linea", w: "2026-12-10", d: "2026-12-18" }, now);
  assert.equal(range.view, "linea");
  assert.equal(dayKey(range.weekStart), "2026-12-07");
  assert.equal(dayKey(range.rangeStart), "2026-12-07");
  assert.equal(dayKey(range.rangeEnd), "2026-12-21");
  assert.equal(range.selected, "2026-12-18");
});

test("a selected day outside an explicit week falls back to its Monday", () => {
  for (const d of [undefined, "2026-12-06", "2026-12-21", "2026-11-08"]) {
    assert.equal(resolveCalendarRange({ view: "linea", w: "2026-12-10", d }, now).selected, "2026-12-07");
  }
});

test("timeline navigation can start from a selected day without an explicit week", () => {
  for (const w of [undefined, "invalid", "2026-02-30"]) {
    const range = resolveCalendarRange({ view: "linea", w, d: "2026-12-18" }, now);
    assert.equal(dayKey(range.weekStart), "2026-12-14");
    assert.equal(range.selected, "2026-12-18");
  }
  assert.equal(resolveCalendarRange({ view: "linea", w: "2026-12-10" }, now).monthKey, "2026-12");
});
