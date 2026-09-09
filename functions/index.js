const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { randomBytes } = require("node:crypto");
const { isRoot, validateSupervisor } = require("./validation");
initializeApp();
const db = getFirestore();
const auth = getAuth();
const options = { region: "asia-southeast1", maxInstances: 2, timeoutSeconds: 60 };

async function requireSession(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sila log masuk.");
  const user = await auth.getUser(request.auth.uid);
  const validAfter = new Date(user.tokensValidAfterTime || 0).getTime() / 1000;
  if (user.disabled || request.auth.token.auth_time < validAfter) throw new HttpsError("unauthenticated", "Sesi tamat. Sila log masuk semula.");
  return user;
}

async function rateLimit(uid) {
  const ref = db.doc(`accountLimits/${uid}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const previous = snap.data() || {};
    const now = Date.now();
    const sameWindow = now - (previous.startedAt || 0) < 60000;
    const count = sameWindow ? previous.count + 1 : 1;
    if (count > 20) throw new HttpsError("resource-exhausted", "Terlalu banyak perubahan. Cuba semula sebentar lagi.");
    tx.set(ref, { count, startedAt: sameWindow ? previous.startedAt : now });
  });
}

exports.manageSupervisor = onCall(options, async request => {
  if (!isRoot(request.auth)) throw new HttpsError("permission-denied", "Hanya Admin utama boleh mengurus penyelia.");
  await requireSession(request);
  await rateLimit(request.auth.uid);
  let data;
  try { data = validateSupervisor(request.data || {}); }
  catch (error) { throw new HttpsError("invalid-argument", error.message); }
  const vehicles = await db.collection("vehicles").get();
  if (data.allowedVehicleIds.some(id => !vehicles.docs.some(v => v.id === id))) throw new HttpsError("invalid-argument", "Kenderaan tidak lagi wujud.");
  let uid = data.uid;
  let temporaryPassword;
  let lockRef;
  let lockAcquired = false;
  const operationId = randomBytes(16).toString("hex");
  try {
    if (!uid) {
      temporaryPassword = randomBytes(18).toString("base64url");
      const account = await auth.createUser({ email: data.email, displayName: data.displayName, password: temporaryPassword, disabled: true });
      uid = account.uid;
    } else {
      const existing = await auth.getUser(uid);
      if (existing.email?.toLowerCase() === "mhafize@jkr.gov.my") throw new HttpsError("permission-denied", "Admin utama dilindungi.");
    }
    const ref = db.doc(`users/${uid}`);
    lockRef = db.doc(`accountMutations/${uid}`);
    // Deny access before changing Auth; failed operations stay disabled and can be retried.
    await db.runTransaction(async tx => {
      const lock = await tx.get(lockRef);
      if ((lock.data()?.expiresAt || 0) > Date.now()) throw new HttpsError("aborted", "Akaun ini sedang dikemas kini. Cuba semula sebentar lagi.");
      tx.set(lockRef, { operationId, expiresAt: Date.now() + 120000 });
      tx.set(ref, { disabled: true, ...(temporaryPassword ? { displayName: data.displayName, email: data.email, role: "supervisor", allowedVehicleIds: [], mustChangePassword: true } : {}), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    lockAcquired = true;
    await auth.updateUser(uid, { email: data.email, displayName: data.displayName, disabled: data.disabled });
    await auth.revokeRefreshTokens(uid);
    await db.runTransaction(async tx => {
      const allUsers = await tx.get(db.collection("users"));
      const allVehicles = await tx.get(db.collection("vehicles"));
      if (allUsers.size + allVehicles.size > 400) throw new HttpsError("resource-exhausted", "Had pengurusan akaun dicapai.");
      if (data.allowedVehicleIds.some(id => !allVehicles.docs.some(v => v.id === id))) throw new HttpsError("failed-precondition", "Senarai kenderaan berubah. Cuba semula.");
      const selected = new Set(data.allowedVehicleIds);
      for (const other of allUsers.docs) {
        if (other.id === uid) continue;
        const old = other.data().allowedVehicleIds || [];
        const remaining = old.filter(id => !selected.has(id));
        if (remaining.length !== old.length) tx.update(other.ref, { allowedVehicleIds: remaining });
      }
      for (const vehicle of allVehicles.docs) {
        if (selected.has(vehicle.id)) tx.update(vehicle.ref, { supervisorId: uid, supervisorName: data.displayName, supervisorEmail: data.email, supervisorPhone: data.phone });
        else if (vehicle.data().supervisorId === uid) tx.update(vehicle.ref, { supervisorId: "", supervisorName: "", supervisorEmail: "", supervisorPhone: "" });
      }
      const { uid: ignored, ...profile } = data;
      tx.set(ref, { ...profile, role: "supervisor", updatedAt: FieldValue.serverTimestamp(), ...(temporaryPassword ? { mustChangePassword: true, createdAt: FieldValue.serverTimestamp() } : {}) }, { merge: true });
      tx.set(db.collection("accountAudit").doc(), { actorUid: request.auth.uid, targetUid: uid, action: temporaryPassword ? "create" : "update", disabled: data.disabled, at: FieldValue.serverTimestamp() });
    });
    return { uid, ...(temporaryPassword ? { temporaryPassword } : {}) };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error.code === "auth/email-already-exists") throw new HttpsError("already-exists", "Emel ini sudah mempunyai akaun. Edit akaun sedia ada.");
    throw new HttpsError("failed-precondition", "Perubahan akaun tidak selesai. Muat semula senarai dan cuba lagi. Akaun yang sedang dikemas kini mungkin dinyahaktifkan sementara.");
  } finally {
    if (lockAcquired) {
      await db.runTransaction(async tx => {
        const lock = await tx.get(lockRef);
        if (lock.data()?.operationId === operationId) tx.delete(lockRef);
      }).catch(() => {});
    }
  }
});

exports.changeOwnPassword = onCall(options, async request => {
  await requireSession(request);
  const profile = (await db.doc(`users/${request.auth.uid}`).get()).data();
  if (!isRoot(request.auth) && (!profile || profile.disabled === true || profile.role !== "supervisor")) throw new HttpsError("permission-denied", "Akaun tiada akses.");
  if (Date.now() / 1000 - request.auth.token.auth_time > 300) throw new HttpsError("unauthenticated", "Sila log masuk semula sebelum menukar password.");
  const password = request.data?.password;
  if (typeof password !== "string" || password.length < 12 || password.length > 128) throw new HttpsError("invalid-argument", "Password mestilah 12 hingga 128 aksara.");
  await rateLimit(request.auth.uid);
  await auth.updateUser(request.auth.uid, { password });
  await auth.revokeRefreshTokens(request.auth.uid);
  await db.doc(`users/${request.auth.uid}`).set({ mustChangePassword: false, passwordChangedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { success: true };
});
