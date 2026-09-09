const { test } = require("node:test");
const assert = require("node:assert/strict");
const { manageSupervisor, changeOwnPassword } = require("./index");
test("management rejects unauthenticated callers before touching the database", async () => {
  await assert.rejects(manageSupervisor.run({ data: {} }), { code: "permission-denied" });
});
test("management rejects supervisors even with a forged admin role in payload", async () => {
  await assert.rejects(manageSupervisor.run({ auth: { uid: "supervisor", token: { email: "wmashraf@jkr.gov.my", role: "admin" } }, data: { role: "admin" } }), { code: "permission-denied" });
});
test("changing a password requires authentication", async () => {
  await assert.rejects(changeOwnPassword.run({ data: { password: "test-password-only" } }), { code: "unauthenticated" });
});
