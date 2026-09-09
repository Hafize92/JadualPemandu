const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { ROOT_UID, ROOT_EMAIL } = require("./validation");

function harness() {
  const docs = new Map([
    ["users/old", { role: "supervisor", email: "old@example.com", allowedVehicleIds: ["car"], disabled: false }],
    ["vehicles/car", { supervisorId: "old" }]
  ]);
  const accounts = new Map([[ROOT_UID, { uid: ROOT_UID, email: ROOT_EMAIL }], ["old", { uid: "old", email: "old@example.com" }]]);
  const revoked = [];
  let failUpdate = false;
  let sequence = 0;
  const ref = path => ({ path, id: path.split("/").pop(), get: async () => snap(path), set: async (data, opts) => write(path, data, opts) });
  const snap = path => ({ id: path.split("/").pop(), exists: docs.has(path), data: () => docs.get(path), ref: ref(path) });
  const write = (path, data, opts) => docs.set(path, opts?.merge ? { ...docs.get(path), ...data } : data);
  const collection = name => ({ name, doc: () => ref(`${name}/auto${++sequence}`), get: async () => query(name) });
  const query = name => { const result = [...docs.keys()].filter(path => path.startsWith(`${name}/`)).map(snap); return { docs: result, size: result.length }; };
  const db = {
    doc: ref, collection,
    runTransaction: async work => work({
      get: async target => target.name ? query(target.name) : snap(target.path),
      set: (target, data, opts) => write(target.path, data, opts),
      update: (target, data) => write(target.path, data, { merge: true }),
      delete: target => docs.delete(target.path)
    })
  };
  const auth = {
    getUser: async uid => accounts.get(uid),
    createUser: async data => { const uid = `new${++sequence}`; accounts.set(uid, { uid, ...data }); return accounts.get(uid); },
    updateUser: async (uid, data) => { if (failUpdate) throw new Error("simulated failure"); accounts.set(uid, { ...accounts.get(uid), ...data }); },
    revokeRefreshTokens: async uid => revoked.push(uid)
  };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const exports = {};
  const modules = {
    "firebase-admin/app": { initializeApp() {} },
    "firebase-admin/auth": { getAuth: () => auth },
    "firebase-admin/firestore": { getFirestore: () => db, FieldValue: { serverTimestamp: () => "timestamp" } },
    "firebase-functions/v2/https": { onCall: (_, handler) => handler, HttpsError },
    "node:crypto": require("node:crypto"),
    "./validation": require("./validation")
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("./index"), "utf8"), { exports, require: name => modules[name], Date, Set });
  const root = { uid: ROOT_UID, token: { email: ROOT_EMAIL, auth_time: Math.floor(Date.now() / 1000) } };
  return { exports, docs, accounts, revoked, root, failUpdate: () => { failUpdate = true; } };
}
const supervisor = { displayName: "New Supervisor", email: "new@example.com", phone: "0123456789", disabled: false, allowedVehicleIds: ["car"] };

test("creation moves ownership, removes former access and never stores a password in Firestore", async () => {
  const h = harness();
  const result = await h.exports.manageSupervisor({ auth: h.root, data: supervisor });
  assert.ok(result.temporaryPassword.length >= 24);
  assert.equal(h.docs.get(`users/${result.uid}`).mustChangePassword, true);
  assert.equal(h.docs.get(`users/${result.uid}`).disabled, false);
  assert.equal(h.docs.get("vehicles/car").supervisorId, result.uid);
  assert.equal(h.docs.get("users/old").allowedVehicleIds.length, 0);
  assert.equal(JSON.stringify([...h.docs]).includes(result.temporaryPassword), false);
});
test("disabling changes both Auth and the profile and revokes sessions", async () => {
  const h = harness();
  await h.exports.manageSupervisor({ auth: h.root, data: { ...supervisor, uid: "old", email: "old@example.com", disabled: true } });
  assert.equal(h.docs.get("users/old").disabled, true);
  assert.equal(h.accounts.get("old").disabled, true);
  assert.ok(h.revoked.includes("old"));
});
test("Auth failure leaves profile access disabled", async () => {
  const h = harness(); h.failUpdate();
  await assert.rejects(h.exports.manageSupervisor({ auth: h.root, data: { ...supervisor, uid: "old" } }), { code: "failed-precondition" });
  assert.equal(h.docs.get("users/old").disabled, true);
});
test("password change clears first-login flag and revokes sessions", async () => {
  const h = harness();
  const session = { uid: "old", token: { email: "old@example.com", auth_time: Math.floor(Date.now() / 1000) } };
  await h.exports.changeOwnPassword({ auth: session, data: { password: "new-test-password" } });
  assert.equal(h.docs.get("users/old").mustChangePassword, false);
  assert.ok(h.revoked.includes("old"));
});
