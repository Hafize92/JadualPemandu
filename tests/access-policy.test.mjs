import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAccessChanges, ADMIN_EMAIL } from "../access-policy.mjs";
const old = { email: "old@example.com", role: "supervisor", displayName: "Old", allowedVehicleIds: ["car"], disabled: false };
const vehicle = { id: "car", supervisorEmail: old.email };
const input = { email: "new@example.com", displayName: "New", phone: "0123456789", disabled: false, allowedVehicleIds: ["car"] };
test("root admin cannot be edited or recreated as supervisor", () => {
  assert.throws(() => buildAccessChanges([], [vehicle], "", { ...input, email: ADMIN_EMAIL }));
  assert.throws(() => buildAccessChanges([], [vehicle], ADMIN_EMAIL, input));
});
test("email replacement disables old approval and reassigns vehicle", () => {
  const changes = buildAccessChanges([old], [vehicle], old.email, input);
  assert.equal(changes.find(w => w.id === old.email).data.disabled, true);
  assert.equal(changes.find(w => w.id === old.email).data.allowedVehicleIds.length, 0);
  assert.equal(changes.find(w => w.id === "car").data.supervisorEmail, input.email);
});
test("moving a car to another supervisor removes prior assignment", () => {
  const changes = buildAccessChanges([old], [vehicle], "", input);
  assert.equal(changes.find(w => w.id === old.email).data.allowedVehicleIds.length, 0);
});
test("disabled flag is preserved and no password enters access documents", () => {
  const changes = buildAccessChanges([], [vehicle], "", { ...input, disabled: true, password: "never-save-this", role: "admin" });
  assert.equal(changes[0].data.disabled, true);
  assert.equal(changes[0].data.role, "supervisor");
  assert.equal(JSON.stringify(changes).includes("never-save-this"), false);
});
test("reject malformed input and duplicate approved emails", () => {
  for (const patch of [{ email: "x/y@example.com" }, { email: "bad" }, { disabled: "false" }, { allowedVehicleIds: ["missing"] }]) assert.throws(() => buildAccessChanges([], [vehicle], "", { ...input, ...patch }));
  assert.throws(() => buildAccessChanges([{ ...old, email: input.email }], [vehicle], "", input));
});
