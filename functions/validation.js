const ROOT_UID = "Bg6iUrQS9cg4irQ3QAtG5VFDR8E2";
const ROOT_EMAIL = "mhafize@jkr.gov.my";

function isRoot(auth) {
  return auth?.uid === ROOT_UID && auth.token?.email?.toLowerCase() === ROOT_EMAIL;
}

function validateSupervisor(data) {
  const uid = String(data.uid || "");
  const email = String(data.email || "").trim().toLowerCase();
  const displayName = String(data.displayName || "").trim();
  const phone = String(data.phone || "").trim();
  const allowedVehicleIds = data.allowedVehicleIds;
  if (uid === ROOT_UID || email === ROOT_EMAIL) throw new Error("Akaun Admin utama tidak boleh diubah di sini.");
  if (uid && !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error("ID akaun tidak sah.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("Emel tidak sah.");
  if (!displayName || displayName.length > 100) throw new Error("Nama diperlukan (maksimum 100 aksara).");
  if (phone.length > 30 || (phone && !/^\+?[\d\s()-]+$/.test(phone))) throw new Error("Nombor telefon tidak sah.");
  if (!Array.isArray(allowedVehicleIds) || allowedVehicleIds.length > 30 || allowedVehicleIds.some(id => typeof id !== "string" || !id || id.includes("/") || id.length > 128)) throw new Error("Pilihan kenderaan tidak sah (maksimum 30).");
  if (typeof data.disabled !== "boolean") throw new Error("Status akaun tidak sah.");
  return { uid, email, displayName, phone, disabled: data.disabled, allowedVehicleIds: [...new Set(allowedVehicleIds)] };
}

module.exports = { ROOT_UID, ROOT_EMAIL, isRoot, validateSupervisor };
