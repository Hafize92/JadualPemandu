export const ADMIN_EMAIL = "mhafize@jkr.gov.my";

export function buildAccessChanges(grants, vehicles, previousEmail, input) {
  const email = String(input.email || "").trim().toLowerCase();
  const name = String(input.displayName || "").trim();
  const phone = String(input.phone || "").trim();
  const ids = input.allowedVehicleIds;
  if (email === ADMIN_EMAIL || previousEmail === ADMIN_EMAIL) throw new Error("Akaun Admin utama dilindungi.");
  if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email) || email.length > 254) throw new Error("Emel tidak sah.");
  if (!name || name.length > 100) throw new Error("Nama diperlukan (maksimum 100 aksara).");
  if (phone.length > 30 || (phone && !/^\+?[\d\s()-]+$/.test(phone))) throw new Error("No. telefon tidak sah.");
  if (typeof input.disabled !== "boolean" || !Array.isArray(ids) || ids.length > 30 || ids.some(id => !vehicles.some(v => v.id === id))) throw new Error("Pilihan akses tidak sah.");
  if (previousEmail !== email && grants.some(g => g.email === email)) throw new Error("Emel sudah diluluskan. Edit rekod sedia ada.");
  const profile = { email, displayName: name, phone, disabled: input.disabled, role: "supervisor", allowedVehicleIds: [...new Set(ids)] };
  const writes = [{ collection: "access", id: email, data: profile }];
  for (const grant of grants) {
    if (grant.email === email) continue;
    const remaining = (grant.allowedVehicleIds || []).filter(id => !ids.includes(id));
    if (grant.email === previousEmail) writes.push({ collection: "access", id: grant.email, data: { ...grant, disabled: true, allowedVehicleIds: [] } });
    else if (remaining.length !== (grant.allowedVehicleIds || []).length) writes.push({ collection: "access", id: grant.email, data: { ...grant, allowedVehicleIds: remaining } });
  }
  for (const vehicle of vehicles) {
    if (ids.includes(vehicle.id)) writes.push({ collection: "vehicles", id: vehicle.id, data: { supervisorEmail: email, supervisorName: name, supervisorPhone: phone, supervisorId: "" } });
    else if (vehicle.supervisorEmail && [previousEmail, email].includes(vehicle.supervisorEmail.toLowerCase())) writes.push({ collection: "vehicles", id: vehicle.id, data: { supervisorEmail: "", supervisorName: "", supervisorPhone: "", supervisorId: "" } });
  }
  return writes;
}
