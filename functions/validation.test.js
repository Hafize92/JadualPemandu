const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ROOT_UID, ROOT_EMAIL, isRoot, validateSupervisor } = require("./validation");
const valid = { email: "supervisor@example.com", displayName: "Penyelia", phone: "012-3456789", disabled: false, allowedVehicleIds: ["vehicle-1"] };
test("only the existing root UID and email can manage accounts", () => {
  assert.equal(isRoot({ uid: ROOT_UID, token: { email: ROOT_EMAIL } }), true);
  assert.equal(isRoot({ uid: "attacker", token: { email: ROOT_EMAIL } }), false);
  assert.equal(isRoot({ uid: ROOT_UID, token: { email: "other@example.com" } }), false);
  assert.equal(isRoot(null), false);
});
test("root account cannot be changed through supervisor management", () => {
  assert.throws(() => validateSupervisor({ ...valid, uid: ROOT_UID }));
  assert.throws(() => validateSupervisor({ ...valid, email: ROOT_EMAIL.toUpperCase() }));
});
test("normalization drops extra privileges and duplicates", () => {
  const result = validateSupervisor({ ...valid, role: "admin", email: " SUPERVISOR@example.com ", allowedVehicleIds: ["v1", "v1"] });
  assert.equal(result.email, valid.email);
  assert.equal(result.role, undefined);
  assert.deepEqual(result.allowedVehicleIds, ["v1"]);
});
test("rejects malformed inputs and document path injection", () => {
  for (const change of [{ uid: "users/root" }, { allowedVehicleIds: ["../users/root"] }, { disabled: "false" }, { phone: "javascript:alert(1)" }, { email: "bad" }, { displayName: "" }, { allowedVehicleIds: Array(31).fill("v1") }]) {
    assert.throws(() => validateSupervisor({ ...valid, ...change }));
  }
});
