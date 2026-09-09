const { initializeApp, applicationDefault } = require("../functions/node_modules/firebase-admin/app");
const { getAuth } = require("../functions/node_modules/firebase-admin/auth");
const { getFirestore, FieldValue } = require("../functions/node_modules/firebase-admin/firestore");
const { ROOT_UID, ROOT_EMAIL } = require("../functions/validation");
initializeApp({ credential: applicationDefault(), projectId: "jadualpemandu-223c0" });
async function main() {
  const admin = await getAuth().getUserByEmail(ROOT_EMAIL);
  if (admin.uid !== ROOT_UID) throw new Error("Admin UID differs from the existing trusted account. Deployment stopped.");
  const db = getFirestore();
  const users = await db.collection("users").get();
  const vehicles = await db.collection("vehicles").get();
  const batch = db.batch();
  batch.set(db.doc(`users/${admin.uid}`), { email: ROOT_EMAIL, displayName: "Hafize", role: "admin", disabled: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  for (const user of users.docs) {
    if (user.id === admin.uid) continue;
    const data = user.data();
    const allowed = new Set(data.allowedVehicleIds || []);
    for (const vehicle of vehicles.docs) {
      const v = vehicle.data();
      if (v.supervisorId === user.id || (data.email && v.supervisorEmail?.toLowerCase() === data.email.toLowerCase())) allowed.add(vehicle.id);
    }
    batch.set(user.ref, { role: data.role === "viewer" ? "viewer" : "supervisor", allowedVehicleIds: [...allowed], disabled: data.disabled === true }, { merge: true });
  }
  await batch.commit();
  console.log("Admin identity verified; existing supervisor assignments preserved.");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
