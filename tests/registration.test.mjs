import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const fn = source.slice(source.indexOf('async function approveRegistration('), source.indexOf('\nfunction vehicleAvailability('));

function setup({ existing = false, mailFails = false, accountExists = false } = {}) {
  const calls = [];
  const pending = { id: 'test@example.com', email: 'test@example.com', status: 'pending' };
  const mainAuth = { app: { options: {} } };
  const sdk = {
    initializeApp: () => (calls.push('secondary'), {}), initializeAuth: () => ({}), inMemoryPersistence: {},
    createUserWithEmailAndPassword: async (auth, email, password) => {
      assert.notEqual(auth, mainAuth); assert.ok(password.length >= 64); calls.push('create');
      if (accountExists) throw { code: 'auth/email-already-in-use' };
    },
    signOut: async auth => { assert.notEqual(auth, mainAuth); calls.push('signOut'); },
    doc: (...args) => args.slice(1).join('/'), serverTimestamp: () => 'timestamp',
    runTransaction: async (_db, f) => f({ get: async () => ({ exists: () => existing }), set: (ref, data) => {
      assert.equal(data.role, 'supervisor'); assert.deepEqual([...data.allowedVehicleIds], []); calls.push('grant');
    } }),
    sendPasswordResetEmail: async () => { calls.push('mail'); if (mailFails) throw new Error('mail failed'); },
    updateDoc: async () => calls.push('approved'), deleteApp: async () => calls.push('cleanup')
  };
  const ctx = vm.createContext({ state: { registrationRequests: [pending], auth: mainAuth, sdk },
    ROOT_ADMIN_EMAIL: 'mhafize@jkr.gov.my', DEVELOPMENT_PREVIEW: false,
    crypto: webcrypto, confirm: () => true, showToast: () => {}, readableFirebaseError: e => e.message });
  vm.runInContext(fn, ctx);
  return { ctx, calls, button: { dataset: { id: pending.id }, disabled: false } };
}
test('approval isolates Auth and sends link after grant, without vehicle privileges', async () => {
  const { ctx, calls, button } = setup(); await ctx.approveRegistration(button);
  assert.deepEqual(calls, ['secondary','create','signOut','grant','mail','approved','cleanup']);
  assert.equal(button.disabled, false);
});
test('existing account and access are preserved on retry', async () => {
  const { ctx, calls, button } = setup({ existing: true, accountExists: true }); await ctx.approveRegistration(button);
  assert.ok(!calls.includes('grant')); assert.ok(calls.includes('approved'));
});
test('mail failure keeps pending request and cleans up isolated Auth', async () => {
  const { ctx, calls, button } = setup({ mailFails: true }); await ctx.approveRegistration(button);
  assert.ok(!calls.includes('approved')); assert.equal(calls.at(-1), 'cleanup'); assert.equal(button.disabled, false);
});
test('registration asks only for email and does not send mail or create Auth', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!html.includes('id="registerPassword"')); assert.ok(!html.includes('id="registerConfirm"'));
  const registration = source.slice(source.indexOf('async function handleRegistration('), source.indexOf('async function approveRegistration('));
  assert.ok(!registration.includes('createUserWithEmailAndPassword'));
  assert.ok(!registration.includes('sendPasswordResetEmail'));
});
