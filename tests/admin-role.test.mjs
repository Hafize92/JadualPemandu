import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const fn = source.slice(source.indexOf('function isAdmin()'), source.indexOf('async function confirmAdminPassword()'));
function permitted(role, verified, disabled = false) {
  const context = vm.createContext({ DEVELOPMENT_PREVIEW: false, ROOT_ADMIN_UID: 'root', ROOT_ADMIN_EMAIL: 'root@example.com',
    state: { currentUser: { uid: 'second', email: 'second@example.com', emailVerified: verified } },
    hasWritableSession: () => !disabled, currentRole: () => role });
  vm.runInContext(fn, context);
  return Boolean(context.isAdmin());
}
test('verified active additional admin has Admin capability', () => assert.equal(permitted('admin', true), true));
test('unverified, disabled and supervisor accounts cannot act as Admin', () => {
  assert.equal(permitted('admin', false), false);
  assert.equal(permitted('admin', true, true), false);
  assert.equal(permitted('supervisor', true), false);
});
test('role management requires reauthentication and server-side recent login', () => {
  assert.ok(source.includes('await state.sdk.reauthenticateWithCredential(state.currentUser, credential)'));
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.ok(rules.includes('recentAdminConfirmation()'));
  assert.ok(rules.includes('request.auth.token.auth_time * 1000'));
  assert.ok(rules.includes('profile().role == "admin" && profile().disabled == false'));
});
