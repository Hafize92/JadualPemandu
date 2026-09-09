import { test } from "node:test";
import assert from "node:assert/strict";
import { reportRows } from "../supervisor-report.mjs";
test("monthly template includes blank days, separate user and blank signature", () => {
  const rows = reportRows([{ vehicleId: "a", startAt: "2026-09-09T10:00", endAt: "2026-09-09T11:00", driverName: "Driver", destination: "Site" }], "a", "2026-09");
  assert.equal(rows.length, 30);
  assert.equal(rows[8].values[2], "");
  assert.equal(rows[8].values[3], "10.00 Pagi");
  assert.equal(rows[8].values[8], "");
  assert.equal(rows[8].values[5], "Site");
});
test("cross-month trips and multiple daily records are preserved", () => {
  const bookings = [{ vehicleId: "a", startAt: "2026-08-31T10:00", endAt: "2026-09-02T11:00" }, { vehicleId: "a", startAt: "2026-09-02T12:00", endAt: "2026-09-02T13:00" }];
  const rows = reportRows(bookings, "a", "2026-09");
  assert.equal(rows.length, 31);
  assert.equal(rows[0].values[3], "");
  assert.equal(rows[1].values[4], "11.00 Pagi");
  assert.equal(reportRows([], "a", "2028-02").length, 29);
  assert.deepEqual(reportRows([], "a", ""), []);
});
