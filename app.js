import { buildAccessChanges } from "./access-policy.mjs";
const APP_VERSION = "ver1.3.0";
const ROOT_ADMIN_UID = "Bg6iUrQS9cg4irQ3QAtG5VFDR8E2";
const ROOT_ADMIN_EMAIL = "mhafize@jkr.gov.my";
const DEVELOPMENT_PREVIEW = ["localhost", "127.0.0.1", ""].includes(location.hostname) && new URLSearchParams(location.search).get("live") !== "1";
const FIREBASE_SDK_VERSION = "10.12.5";

const demoData = createDemoData();

const state = {
  firebaseEnabled: false,
  firebaseConfigured: false,
  firebaseLoading: true,
  firebaseError: false,
  firebaseReady: false,
  auth: null,
  db: null,
  sdk: null,
  currentUser: null,
  profile: {
    id: "demo-viewer",
    displayName: "Pengguna Demo",
    email: "viewer@example.com",
    role: "viewer",
    allowedVehicleIds: []
  },
  vehicles: demoData.vehicles,
  bookings: demoData.bookings,
  users: demoData.users,
  activeView: "calendarView",
  selectedDate: toDateKey(new Date()),
  selectedVehicleId: "",
  calendarCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  unsubscribers: [],
  profileUnsubscribe: null,
  usersUnsubscribe: null
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  state.firebaseConfigured = !DEVELOPMENT_PREVIEW && hasFirebaseConfig(window.JADUAL_FIREBASE_CONFIG || {});
  state.firebaseLoading = state.firebaseConfigured;
  if (!DEVELOPMENT_PREVIEW) {
    state.vehicles = [];
    state.bookings = [];
    state.users = [];
    state.profile = null;
  }
  renderAll();
  if (!DEVELOPMENT_PREVIEW) initFirebase();
  setInterval(renderCalendar, 60000);
});

function cacheElements() {
  [
    "authPanel",
    "calendarSummary",
    "calendarPrev",
    "calendarNext",
    "calendarToday",
    "calendarMonthLabel",
    "calendarLegend",
    "syncStatus",
    "recordCount",
    "vehicleStatusList",
    "scheduleCalendar",
    "supervisorGate",
    "supervisorDashboard",
    "supervisorVehicleList",
    "bookingForm",
    "bookingId",
    "bookingVehicle",
    "bookingDriver",
    "bookingDestination",
    "bookingStart",
    "bookingEnd",
    "bookingNotes",
    "resetBookingForm",
    "supervisorRows",
    "adminGate",
    "adminDashboard",
    "adminSummary",
    "vehicleForm",
    "vehicleId",
    "vehicleModel",
    "vehicleRegistration",
    "vehicleProject",
    "vehicleContract",
    "vehiclePic",
    "vehicleDriver",
    "vehicleReceived",
    "vehicleProjectDone",
    "vehicleSupervisorName",
    "vehicleSupervisorPhone",
    "vehicleSupervisorEmail",
    "vehicleSupervisorId",
    "vehicleCapacity",
    "resetVehicleForm",
    "userForm",
    "userUid",
    "userName",
    "userEmail",
    "userVehicles",
    "adminVehicleRows",
    "adminUserRows",
    "toast"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  els.vehicleStatusList.addEventListener("click", (event) => {
    const vehicle = event.target.closest("[data-calendar-vehicle]");
    if (!vehicle) return;
    state.selectedVehicleId = vehicle.dataset.calendarVehicle;
    renderCalendar();
    document.getElementById("scheduleTableTitle").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.getElementById("clearCalendarVehicle").addEventListener("click", () => {
    state.selectedVehicleId = "";
    renderCalendar();
  });
  els.scheduleCalendar.addEventListener("click", (event) => {
    const day = event.target.closest("[data-date]");
    if (!day) return;
    state.selectedDate = day.dataset.date;
    renderCalendar();
  });
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => setActiveView(button.dataset.view));
  });

  els.calendarPrev.addEventListener("click", () => {
    moveCalendarMonth(-1);
  });

  els.calendarNext.addEventListener("click", () => {
    moveCalendarMonth(1);
  });

  els.calendarToday.addEventListener("click", () => {
    state.calendarCursor = startOfMonth(new Date());
    state.selectedDate = toDateKey(new Date());
    renderCalendar();
  });

  els.bookingForm.addEventListener("submit", handleBookingSubmit);
  els.bookingVehicle.addEventListener("change", () => {
    const vehicle = findVehicle(els.bookingVehicle.value);
    if (vehicle && !els.bookingId.value) {
      els.bookingDriver.value = vehicle.driverName || "";
    }
  });
  els.resetBookingForm.addEventListener("click", resetBookingForm);
  els.vehicleForm.addEventListener("submit", handleVehicleSubmit);
  els.resetVehicleForm.addEventListener("click", resetVehicleForm);
  els.userForm.addEventListener("submit", handleUserSubmit);
  document.getElementById("resetUserForm").addEventListener("click", resetUserForm);
  els.adminUserRows.addEventListener("click", handleUserAction);
  document.getElementById("registerForm").addEventListener("submit", handleRegistration);
  document.getElementById("closeRegisterDialog").addEventListener("click", () => document.getElementById("registerDialog").close());
  document.getElementById("registerDialog").addEventListener("close", () => document.getElementById("registerForm").reset());
  document.getElementById("passwordForm").addEventListener("submit", handlePasswordChange);
  document.getElementById("closePasswordDialog").addEventListener("click", () => document.getElementById("passwordDialog").close());
  document.getElementById("passwordDialog").addEventListener("close", () => document.getElementById("passwordForm").reset());

  els.supervisorRows.addEventListener("click", handleBookingAction);
  els.adminVehicleRows.addEventListener("click", handleVehicleAction);
}

async function initFirebase() {
  const config = window.JADUAL_FIREBASE_CONFIG || {};

  if (!hasFirebaseConfig(config)) {
    state.firebaseEnabled = false;
    state.firebaseConfigured = false;
    state.firebaseLoading = false;
    renderAll();
    return;
  }

  try {
    const [
      firebaseApp,
      firebaseAuth,
      firebaseFirestore
    ] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`)
    ]);

    const app = firebaseApp.initializeApp(config);
    state.auth = firebaseAuth.getAuth(app);
    state.db = firebaseFirestore.getFirestore(app);
    state.sdk = { ...firebaseAuth, ...firebaseFirestore };
    state.firebaseEnabled = true;
    state.firebaseReady = true;
    state.firebaseLoading = false;
    state.firebaseError = false;

    subscribePublicData();
    state.sdk.onAuthStateChanged(state.auth, (user) => {
      state.currentUser = user;
      subscribeUserProfile(user);
      renderAll();
    });
  } catch (error) {
    console.error(error);
    state.firebaseEnabled = false;
    state.firebaseReady = false;
    state.firebaseLoading = false;
    state.firebaseError = true;
    showToast("Firebase tidak dapat dimuat. Sila refresh dan cuba lagi.");
    renderAll();
  }
}

function hasFirebaseConfig(config) {
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

function subscribePublicData() {
  clearPublicSubscriptions();
  const { collection, onSnapshot, orderBy, query } = state.sdk;
  const vehiclesQuery = query(collection(state.db, "vehicles"), orderBy("model"));
  const bookingsQuery = query(collection(state.db, "bookings"), orderBy("startAt"));

  state.unsubscribers.push(onSnapshot(vehiclesQuery, (snapshot) => {
    state.vehicles = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderAll();
  }));

  state.unsubscribers.push(onSnapshot(bookingsQuery, (snapshot) => {
    state.bookings = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderAll();
  }));
}

function clearPublicSubscriptions() {
  state.unsubscribers.forEach((unsubscribe) => unsubscribe());
  state.unsubscribers = [];
}

function subscribeUserProfile(user) {
  if (state.profileUnsubscribe) {
    state.profileUnsubscribe();
    state.profileUnsubscribe = null;
  }

  if (state.usersUnsubscribe) {
    state.usersUnsubscribe();
    state.usersUnsubscribe = null;
  }

  state.profile = null;
  state.users = [];

  if (!user || !state.firebaseReady) {
    return;
  }

  const { collection, doc, onSnapshot } = state.sdk;
  if (user.uid === ROOT_ADMIN_UID && user.email?.toLowerCase() === ROOT_ADMIN_EMAIL) {
    state.profile = { id: ROOT_ADMIN_UID, displayName: "Hafize", email: ROOT_ADMIN_EMAIL, role: "admin" };
    importLegacyAccess().catch(error => showToast(readableFirebaseError(error)));
    state.usersUnsubscribe = onSnapshot(collection(state.db, "access"), (snapshot) => {
      state.users = snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
      renderAdmin();
    }, error => showToast(readableFirebaseError(error)));
    return;
  }
  if (!user.emailVerified) return;
  state.profileUnsubscribe = onSnapshot(doc(state.db, "access", user.email.toLowerCase()), (snapshot) => {
    state.profile = snapshot.exists()
      ? { id: snapshot.id, ...snapshot.data() }
      : {
          id: user.uid,
          displayName: user.displayName || user.email,
          email: user.email,
          role: "viewer",
          allowedVehicleIds: []
        };

    renderAll();
  }, () => { state.profile = null; renderAll(); });
}

async function importLegacyAccess() {
  const { collection, getDocs, doc, runTransaction, serverTimestamp } = state.sdk;
  const legacy = await getDocs(collection(state.db, "users"));
  const vehicles = await getDocs(collection(state.db, "vehicles"));
  const byEmail = new Map();
  for (const row of legacy.docs) {
    const data = row.data();
    const email = String(data.email || "").toLowerCase();
    if (data.role !== "supervisor" || !email || email.includes("/") || email === ROOT_ADMIN_EMAIL) continue;
    byEmail.set(email, { data, uid: row.id });
  }
  for (const [email, { data, uid }] of byEmail) {
    const ref = doc(state.db, "access", email);
    await runTransaction(state.db, async tx => {
      if ((await tx.get(ref)).exists()) return;
      const currentVehicles = await Promise.all(vehicles.docs.map(v => tx.get(v.ref)));
      const owned = currentVehicles.filter(v => v.exists() && (v.data().supervisorEmail?.toLowerCase() === email || v.data().supervisorId === uid));
      tx.set(ref, { email, displayName: data.displayName || email, phone: data.phone || owned[0]?.data().supervisorPhone || "", role: "supervisor", disabled: data.disabled === true, allowedVehicleIds: owned.map(v => v.id), updatedAt: serverTimestamp() });
      for (const vehicle of owned) tx.update(vehicle.ref, { supervisorEmail: email });
    });
  }
}

function setActiveView(viewId) {
  if (DEVELOPMENT_PREVIEW) {
    state.activeView = viewId;
    setDemoRole(viewId === "adminView" ? "admin" : viewId === "supervisorView" ? "supervisor" : "viewer");
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (!canOpenView(viewId)) {
    state.activeView = "calendarView";
    showToast(restrictedViewMessage(viewId));
  } else {
    state.activeView = viewId;
  }

  syncActiveView();
}

function syncActiveView() {
  if (!canOpenView(state.activeView)) {
    state.activeView = "calendarView";
  }

  document.querySelectorAll(".tab").forEach((button) => {
    const canAccess = canOpenView(button.dataset.view);
    const restricted = button.dataset.view !== "calendarView";
    button.hidden = false;
    button.disabled = false;
    button.classList.toggle("is-active", button.dataset.view === state.activeView);
    button.setAttribute("aria-current", button.dataset.view === state.activeView ? "page" : "false");
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("is-active", view.id === state.activeView);
  });
}

function renderAll() {
  syncActiveView();
  renderAuth();
  renderCalendar();
  renderSupervisor();
  renderAdmin();
}

function renderAuth() {
  if (DEVELOPMENT_PREVIEW) {
    els.authPanel.innerHTML = '<span class="preview-label">Pratonton pembangunan</span>';
    els.syncStatus.textContent = "Data demo";
    return;
  }
  if (!state.firebaseReady && state.firebaseConfigured) {
    const message = state.firebaseError
      ? "Login Firebase tidak dapat dimuat. Sila refresh halaman."
      : "Login Firebase sedang dimuat...";
    els.authPanel.innerHTML = `
      <div class="signed-in">
        <div>
          <strong>Login</strong>
          <span class="muted-text">${escapeHtml(message)}</span>
        </div>
      </div>
    `;
    els.syncStatus.textContent = state.firebaseError ? "Offline" : "Menyambung";
    els.syncStatus.classList.remove("live");
    return;
  }

  if (!state.firebaseReady && !DEVELOPMENT_PREVIEW) {
    els.authPanel.textContent = "Sambungan tidak tersedia. Sila muat semula halaman.";
    els.syncStatus.textContent = "Offline";
    return;
  }
  if (!state.firebaseReady) {
    els.authPanel.innerHTML = `
      <div class="signed-in demo-auth">
        <div>
          <strong>Mod demo</strong>
          <span class="muted-text">${escapeHtml(roleLabel(currentRole()))} - isi firebase-config.js untuk sync live.</span>
        </div>
        <div class="row-actions">
          <button class="ghost-button small" type="button" data-demo-role="viewer">Pengguna</button>
          <button class="ghost-button small" type="button" data-demo-role="supervisor">Penyelia</button>
          <button class="ghost-button small" type="button" data-demo-role="admin">Admin</button>
        </div>
      </div>
    `;
    els.authPanel.querySelectorAll("[data-demo-role]").forEach((button) => {
      button.addEventListener("click", () => setDemoRole(button.dataset.demoRole));
    });
    els.syncStatus.textContent = "Demo";
    els.syncStatus.classList.remove("live");
    return;
  }

  els.syncStatus.textContent = "Live sync";
  els.syncStatus.classList.add("live");

  if (!state.currentUser) {
    els.authPanel.innerHTML = `
      <form id="loginForm">
        <label>
          Emel
          <input type="email" id="loginEmail" autocomplete="email" required>
        </label>
        <label>
          Password
          <input type="password" id="loginPassword" autocomplete="current-password" required>
        </label>
        <button class="primary-button" type="submit">Log Masuk</button>
      </form>
      <div class="row-actions"><button type="button" class="ghost-button small" id="registerButton">Daftar Penyelia</button><button type="button" class="ghost-button small" id="forgotPasswordButton">Lupa Password</button></div>
    `;
    document.getElementById("registerButton").addEventListener("click", () => document.getElementById("registerDialog").showModal());
    document.getElementById("forgotPasswordButton").addEventListener("click", async () => {
      const input = document.getElementById("loginEmail");
      if (!input.reportValidity()) return;
      try { await state.sdk.sendPasswordResetEmail(state.auth, input.value.trim()); showToast("Jika akaun wujud, semak emel reset password."); }
      catch (error) { showToast(readableFirebaseError(error)); }
    });

    document.getElementById("loginForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value;
      try {
        await state.sdk.signInWithEmailAndPassword(state.auth, email, password);
        showToast("Log masuk berjaya.");
      } catch (error) {
        showToast(readableFirebaseError(error));
      }
    });
    return;
  }

  const name = state.profile?.displayName || state.currentUser.email;
  els.authPanel.innerHTML = `
    <div class="signed-in">
      <div>
        <strong>${escapeHtml(name)}</strong>
        <span class="muted-text">${escapeHtml(state.currentUser.email || "")}</span>
      </div>
      <div class="row-actions">
        <span class="role-chip">${escapeHtml(roleLabel(currentRole()))}</span>
        <button class="ghost-button small" type="button" id="logoutButton">Log Keluar</button>
        <button class="ghost-button small" type="button" id="changePasswordButton">Tukar Password</button>
      </div>
    </div>
  `;

  document.getElementById("changePasswordButton").addEventListener("click", () => document.getElementById("passwordDialog").showModal());
  if (!state.currentUser.emailVerified && state.currentUser.uid !== ROOT_ADMIN_UID) {
    const notice = document.createElement("p");
    notice.textContent = "Sahkan emel anda untuk mengakses dashboard penyelia.";
    els.authPanel.append(notice);
    const send = document.createElement("button");
    send.className = "ghost-button small";
    send.textContent = "Hantar emel pengesahan";
    send.addEventListener("click", async () => {
      send.disabled = true;
      try { await state.sdk.sendEmailVerification(state.currentUser); showToast("Emel pengesahan dihantar."); }
      catch (error) { showToast(readableFirebaseError(error)); }
      finally { send.disabled = false; }
    });
    const refresh = document.createElement("button");
    refresh.className = "ghost-button small";
    refresh.textContent = "Saya sudah sahkan emel";
    refresh.addEventListener("click", async () => {
      try {
        await state.sdk.reload(state.currentUser);
        await state.currentUser.getIdToken(true);
        subscribeUserProfile(state.currentUser);
        renderAll();
      } catch (error) { showToast(readableFirebaseError(error)); }
    });
    els.authPanel.append(send, refresh);
  } else if ((!state.profile || state.profile.role === "viewer") && state.currentUser.uid !== ROOT_ADMIN_UID) {
    const notice = document.createElement("p");
    notice.textContent = "Akses penyelia belum diluluskan oleh Admin.";
    els.authPanel.append(notice);
  }
  if (state.profile?.disabled) {
    const notice = document.createElement("p");
    notice.textContent = "Akses akaun dinyahaktifkan. Hubungi Admin.";
    els.authPanel.append(notice);
  }

  document.getElementById("logoutButton").addEventListener("click", async () => {
    await state.sdk.signOut(state.auth);
    showToast("Anda telah log keluar.");
  });
}

function setDemoRole(role) {
  const profiles = {
    viewer: {
      id: "demo-viewer",
      displayName: "Pengguna Demo",
      email: "viewer@example.com",
      role: "viewer",
      allowedVehicleIds: []
    },
    supervisor: {
      id: "demo-supervisor",
      displayName: "Nur Hafiza",
      email: "hafiza@example.com",
      role: "supervisor",
      allowedVehicleIds: ["hilux-kws-1024"]
    },
    admin: {
      id: "demo-admin",
      displayName: "Admin Demo",
      email: "admin@example.com",
      role: "admin",
      allowedVehicleIds: []
    }
  };

  state.profile = profiles[role] || profiles.viewer;
  state.currentUser = role === "viewer"
    ? null
    : { uid: state.profile.id, email: state.profile.email };
  renderAll();
  if (!DEVELOPMENT_PREVIEW) showToast(`Paparan demo: ${roleLabel(role)}.`);
}

function renderCalendar() {
  if (state.selectedVehicleId && !findVehicle(state.selectedVehicleId)) state.selectedVehicleId = "";
  const selectedVehicle = findVehicle(state.selectedVehicleId);
  document.getElementById("scheduleTableTitle").textContent = selectedVehicle
    ? `${selectedVehicle.registrationNo} (${selectedVehicle.model})` : "Jadual";
  document.getElementById("clearCalendarVehicle").hidden = !selectedVehicle;
  const bookings = filteredBookings();
  const now = new Date();
  const activeCount = state.bookings.filter((booking) => bookingStatus(booking, now).key === "active").length;
  const futureCount = state.bookings.filter((booking) => bookingStatus(booking, now).key === "booked").length;
  const availableCount = state.vehicles.filter((vehicle) => vehicleAvailability(vehicle.id).key !== "active").length;

  els.calendarSummary.innerHTML = [
    summaryCard("Jumlah kenderaan", state.vehicles.length),
    summaryCard("Kenderaan kosong", availableCount),
    summaryCard("Sedang digunakan", activeCount),
    summaryCard("Tempahan akan datang", futureCount)
  ].join("");

  els.vehicleStatusList.innerHTML = state.vehicles.length
    ? state.vehicles.map(renderVehicleItem).join("")
    : `<div class="empty-state">Belum ada rekod kenderaan.</div>`;

  renderScheduleCalendar(bookings);
}

function filteredBookings() {
  return state.bookings
    .filter((booking) => !state.selectedVehicleId || booking.vehicleId === state.selectedVehicleId)
    .sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
}

function moveCalendarMonth(offset) {
  state.calendarCursor = new Date(
    state.calendarCursor.getFullYear(),
    state.calendarCursor.getMonth() + offset,
    1
  );
  state.selectedDate = toDateKey(state.calendarCursor);
  renderCalendar();
}

function renderScheduleCalendar(bookings) {
  const monthStart = startOfMonth(state.calendarCursor);
  const monthEnd = endOfMonth(monthStart);
  const gridStart = startOfWeek(monthStart);
  const gridDays = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const gridEnd = endOfDay(gridDays[gridDays.length - 1]);
  const visibleBookings = bookings.filter((booking) => {
    const start = new Date(booking.startAt);
    const end = new Date(booking.endAt || booking.startAt);
    return start <= gridEnd && end >= gridStart;
  });
  const monthBookings = bookings.filter((booking) => {
    const start = new Date(booking.startAt);
    const end = new Date(booking.endAt || booking.startAt);
    return start <= endOfDay(monthEnd) && end >= monthStart;
  });

  els.calendarMonthLabel.textContent = formatMonthYear(monthStart);
  els.recordCount.textContent = `${monthBookings.length} rekod bulan ini`;
  els.calendarLegend.innerHTML = state.vehicles.length
    ? state.vehicles.filter((vehicle) => !state.selectedVehicleId || vehicle.id === state.selectedVehicleId).map((vehicle) => {
      const color = vehicleColor(vehicle.id);
      return `
        <span class="legend-item">
          <span class="vehicle-color-dot" style="--vehicle-color: ${color}"></span>
          ${escapeHtml(vehicleLabel(vehicle))}
        </span>
      `;
    }).join("")
    : "";

  els.scheduleCalendar.innerHTML = `
    <div class="calendar-weekdays">
      ${["Isn", "Sel", "Rab", "Kha", "Jum", "Sab", "Aha"].map((day) => `<div>${day}</div>`).join("")}
    </div>
    <div class="calendar-grid">
      ${gridDays.map((day) => renderCalendarDay(day, monthStart, visibleBookings)).join("")}
    </div>
  `;
  const selectedBookings = bookings.filter((booking) => bookingTouchesDate(booking, new Date(`${state.selectedDate}T12:00:00`)));
  document.getElementById("dayAgenda").innerHTML = `
    <div class="agenda-heading"><h3>${escapeHtml(formatDate(state.selectedDate))}</h3><span class="muted-text">${selectedBookings.length} perjalanan</span></div>
    ${selectedBookings.length ? selectedBookings.map((booking) => `
      <article class="agenda-item" style="--vehicle-color:${vehicleColor(booking.vehicleId)}">
        <strong>${escapeHtml(vehicleLabel(findVehicle(booking.vehicleId), booking.vehicleLabel))}</strong>
        <p>${escapeHtml(booking.destination || "-")}</p>
        <p class="record-meta">Pemandu: ${escapeHtml(booking.driverName || "-")}</p>
        <p class="record-meta">Penyelia: ${escapeHtml(booking.supervisorName || findVehicle(booking.vehicleId)?.supervisorName || "-")}</p>
        <p class="record-meta">${formatDateTime(booking.startAt)} &ndash; ${formatDateTime(booking.endAt)}</p>
      </article>`).join("") : '<div class="empty-state">Tiada perjalanan pada tarikh ini.</div>'}
  `;
}

function renderCalendarDay(day, monthStart, bookings) {
  const dayKey = toDateKey(day);
  const todayKey = toDateKey(new Date());
  const dayBookings = bookings.filter((booking) => bookingTouchesDate(booking, day));
  const classes = [
    "calendar-day",
    day.getMonth() !== monthStart.getMonth() ? "is-outside" : "",
    dayKey === todayKey ? "is-today" : "",
    dayKey === state.selectedDate ? "is-selected" : ""
  ].filter(Boolean).join(" ");

  return `
    <button type="button" class="${classes}" data-date="${dayKey}" aria-pressed="${dayKey === state.selectedDate}" aria-label="${escapeAttr(formatDate(dayKey))}, ${dayBookings.length} perjalanan">
      <div class="calendar-date">${day.getDate()}</div>
      <div class="calendar-events">
        ${dayBookings.slice(0, 3).map((booking) => `<span class="day-marker" style="--vehicle-color:${vehicleColor(booking.vehicleId)}"><span>${escapeHtml(findVehicle(booking.vehicleId)?.registrationNo || "Kenderaan")}</span></span>`).join("")}
        ${dayBookings.length > 3 ? `<span class="more-events">+${dayBookings.length - 3}</span>` : ""}
      </div>
    </button>
  `;
}

function renderCalendarEvent(booking) {
  const vehicle = findVehicle(booking.vehicleId);
  const color = vehicleColor(booking.vehicleId || booking.vehicleLabel || booking.id);
  return `
    <div class="calendar-event" style="--vehicle-color: ${color}; --vehicle-soft: ${hexToRgba(color, 0.13)}">
      <strong>${escapeHtml(vehicleLabel(vehicle, booking.vehicleLabel))}</strong>
      <span>${escapeHtml(booking.driverName || "-")} ke ${escapeHtml(booking.destination || "-")}</span>
      <span>${formatTime(booking.startAt)} - ${formatTime(booking.endAt)}</span>
    </div>
  `;
}

function renderVehicleItem(vehicle) {
  const availability = vehicleAvailability(vehicle.id);
  const color = vehicleColor(vehicle.id);
  const phone = whatsappNumber(vehicle.supervisorPhone);
  return `
    <article class="vehicle-item vehicle-calendar-button" style="--vehicle-color: ${color}">
      <button type="button" class="vehicle-title vehicle-calendar-trigger" data-calendar-vehicle="${escapeAttr(vehicle.id)}"
        aria-pressed="${state.selectedVehicleId === vehicle.id}" aria-label="Lihat kalendar ${escapeAttr(vehicle.registrationNo || vehicle.model)}">
        ${escapeHtml(vehicle.registrationNo || "-")} (${escapeHtml(vehicle.model || "-")}) <span aria-hidden="true" class="vehicle-open-arrow">&rsaquo;</span>
      </button>
      <span class="vehicle-meta">${escapeHtml([vehicle.projectDistrict, vehicle.projectState].filter(Boolean).join(", ") || "Lokasi belum ditetapkan")}</span>
      <span class="record-meta">Penyelia: ${escapeHtml(vehicle.supervisorName || "-")}<br>No. telefon: ${phone
        ? `<a class="supervisor-whatsapp" href="https://wa.me/${phone}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" aria-label="WhatsApp ${escapeAttr(vehicle.supervisorName || "penyelia")}">${escapeHtml(vehicle.supervisorPhone)}</a>`
        : escapeHtml(vehicle.supervisorPhone || "-")}</span>
      <span class="vehicle-usage"><span class="record-meta">Status Penggunaan</span><span class="status-chip ${availability.key}">${escapeHtml(availability.label)}</span></span>
      ${availability.booking ? `
        <span class="record-meta">${escapeHtml(availability.booking.destination || "-")}</span>
        <span class="record-meta">${escapeHtml(formatUsageDateTime(availability.booking.startAt))} Bertolak</span>
        <span class="record-meta">${escapeHtml(formatUsageDateTime(availability.booking.endAt))} Balik</span>
      ` : `<span class="record-meta">${escapeHtml(availability.detail)}</span>`}
    </article>
  `;
}

function whatsappNumber(value) {
  const raw = String(value || "").trim();
  if (!/^\+?[\d\s()-]+$/.test(raw)) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `60${digits.slice(1)}`;
  return /^601\d{8,9}$/.test(digits) ? digits : "";
}

function formatUsageDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const hour = date.getHours();
  const period = hour < 12 ? "Pagi" : hour < 14 ? "Tengah Hari" : hour < 19 ? "Petang" : "Malam";
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} - ${hour % 12 || 12}.${String(date.getMinutes()).padStart(2, "0")} ${period}`;
}

function renderScheduleRow(booking) {
  const vehicle = findVehicle(booking.vehicleId);
  const status = bookingStatus(booking);
  return `
    <tr>
      <td>
        <strong>${escapeHtml(vehicleLabel(vehicle, booking.vehicleLabel))}</strong>
        <div class="record-meta">${escapeHtml(vehicle?.projectName || "")}</div>
      </td>
      <td>${escapeHtml(booking.driverName || "-")}</td>
      <td>${escapeHtml(booking.supervisorName || vehicle?.supervisorName || "-")}</td>
      <td>${escapeHtml(booking.destination || "-")}</td>
      <td>${formatDateTime(booking.startAt)}</td>
      <td>${formatDateTime(booking.endAt)}</td>
      <td><span class="status-chip ${status.key}">${escapeHtml(status.label)}</span></td>
    </tr>
  `;
}

function renderSupervisor() {
  const canAccess = isSupervisor() || isAdmin();
  els.supervisorDashboard.style.display = canAccess ? "grid" : "none";
  els.supervisorGate.classList.toggle("is-visible", !canAccess);
  els.supervisorGate.textContent = state.firebaseReady
    ? "Sila log masuk sebagai penyelia atau admin untuk mengisi jadual."
    : state.firebaseConfigured
      ? "Login Firebase sedang disediakan. Sila refresh jika mesej ini berterusan."
      : "Mod demo: isi firebase-config.js dan log masuk melalui Firebase Authentication untuk menggunakan dashboard penyelia.";

  if (!canAccess) return;

  const vehicles = supervisorVehicles();
  els.supervisorVehicleList.innerHTML = vehicles.length
    ? vehicles.map(renderSupervisorVehicleItem).join("")
    : `<div class="empty-state">Tiada kenderaan dipautkan kepada akaun ini.</div>`;

  populateBookingVehicleOptions(vehicles);

  const rows = state.bookings
    .filter((booking) => isAdmin() || vehicles.some((vehicle) => vehicle.id === booking.vehicleId))
    .sort((a, b) => String(b.startAt).localeCompare(String(a.startAt)))
    .map(renderSupervisorRow)
    .join("");

  els.supervisorRows.innerHTML = rows || `<tr><td colspan="6"><div class="empty-state">Belum ada rekod penggunaan.</div></td></tr>`;
}

function renderSupervisorVehicleItem(vehicle) {
  return `
    <article class="vehicle-item">
      <header>
        <div>
          <div class="vehicle-title">${escapeHtml(vehicleLabel(vehicle))}</div>
          <div class="vehicle-meta">${escapeHtml(vehicle.projectName || "-")}</div>
        </div>
        <span class="role-chip">${escapeHtml(vehicle.contractNo || "Kontrak")}</span>
      </header>
      <div class="record-meta">
        PIC: ${escapeHtml(vehicle.picName || "-")}<br>
        Pemandu: ${escapeHtml(vehicle.driverName || "-")}<br>
        Terima: ${formatDate(vehicle.receivedDate)}<br>
        Siap projek: ${formatDate(vehicle.projectReadyDate)}
      </div>
    </article>
  `;
}

function populateBookingVehicleOptions(vehicles) {
  const currentValue = els.bookingVehicle.value;
  els.bookingVehicle.innerHTML = vehicles.map((vehicle) => (
    `<option value="${escapeAttr(vehicle.id)}">${escapeHtml(vehicleLabel(vehicle))}</option>`
  )).join("");

  if (vehicles.some((vehicle) => vehicle.id === currentValue)) {
    els.bookingVehicle.value = currentValue;
  } else if (vehicles[0]) {
    els.bookingVehicle.value = vehicles[0].id;
  }
}

function renderSupervisorRow(booking) {
  const vehicle = findVehicle(booking.vehicleId);
  return `
    <tr>
      <td>${escapeHtml(vehicleLabel(vehicle, booking.vehicleLabel))}</td>
      <td>${escapeHtml(booking.driverName || "-")}</td>
      <td>${escapeHtml(booking.destination || "-")}</td>
      <td>${formatDateTime(booking.startAt)}</td>
      <td>${formatDateTime(booking.endAt)}</td>
      <td>
        <div class="row-actions">
          <button class="ghost-button small" type="button" data-action="edit-booking" data-id="${escapeAttr(booking.id)}">Edit</button>
          <button class="danger-button small" type="button" data-action="delete-booking" data-id="${escapeAttr(booking.id)}">Padam</button>
        </div>
      </td>
    </tr>
  `;
}

function renderAdmin() {
  const canAccess = isAdmin();
  els.adminDashboard.style.display = canAccess ? "grid" : "none";
  els.adminGate.classList.toggle("is-visible", !canAccess);
  els.adminGate.textContent = state.firebaseReady
    ? "Sila log masuk sebagai admin untuk mengurus keseluruhan jadual."
    : state.firebaseConfigured
      ? "Login Firebase sedang disediakan. Sila refresh jika mesej ini berterusan."
      : "Mod demo: dashboard admin aktif selepas Firebase dikonfigurasi dan akaun admin diwujudkan.";

  if (!canAccess) return;
  const selected = [...els.userVehicles.selectedOptions].map(option => option.value);
  els.userVehicles.innerHTML = state.vehicles.map(vehicle => `<option value="${escapeAttr(vehicle.id)}" ${selected.includes(vehicle.id) ? "selected" : ""}>${escapeHtml(vehicleLabel(vehicle))}</option>`).join("");

  const totalCapacity = state.vehicles.reduce((sum, vehicle) => sum + Number(vehicle.capacity || 0), 0);
  els.adminSummary.innerHTML = [
    summaryCard("Jumlah kenderaan", state.vehicles.length),
    summaryCard("Jumlah kapasiti", totalCapacity),
    summaryCard("Jumlah penggunaan", state.bookings.length),
    summaryCard("Akaun akses", state.users.length)
  ].join("");

  els.adminVehicleRows.innerHTML = state.vehicles.length
    ? state.vehicles.map(renderAdminVehicleRow).join("")
    : `<tr><td colspan="7"><div class="empty-state">Belum ada rekod kenderaan.</div></td></tr>`;

  els.adminUserRows.innerHTML = state.users.length
    ? state.users.map(renderAdminUserRow).join("")
    : `<tr><td colspan="5"><div class="empty-state">Senarai akses akan dipaparkan selepas profil admin boleh membaca koleksi users.</div></td></tr>`;
}

function renderAdminVehicleRow(vehicle) {
  return `
    <tr>
      <td>
        <strong>${escapeHtml(vehicleLabel(vehicle))}</strong>
        <div class="record-meta">Pemandu: ${escapeHtml(vehicle.driverName || "-")}</div>
      </td>
      <td>${escapeHtml(vehicle.projectName || "-")}</td>
      <td>${escapeHtml(vehicle.contractNo || "-")}</td>
      <td>${escapeHtml(vehicle.picName || "-")}</td>
      <td>${escapeHtml(vehicle.supervisorName || "-")}</td>
      <td>${escapeHtml(String(vehicle.capacity || "-"))}</td>
      <td>
        <div class="row-actions">
          <button class="ghost-button small" type="button" data-action="edit-vehicle" data-id="${escapeAttr(vehicle.id)}">Edit</button>
          <button class="danger-button small" type="button" data-action="delete-vehicle" data-id="${escapeAttr(vehicle.id)}">Padam</button>
        </div>
      </td>
    </tr>
  `;
}

function renderAdminUserRow(user) {
  return `
    <tr>
      <td>${escapeHtml(user.displayName || "-")}</td>
      <td>${escapeHtml(user.email || "-")}</td>
      <td><span class="role-chip">${escapeHtml(roleLabel(user.role))}</span></td>
      <td>${escapeHtml((user.allowedVehicleIds || []).map(id => vehicleLabel(findVehicle(id), id)).join(", ") || "-")}</td>
      <td>${user.id === ROOT_ADMIN_UID || user.role === "admin" ? "Admin utama" : `<span>${user.disabled ? "Tidak aktif" : "Aktif"}</span><div class="row-actions"><button type="button" class="ghost-button small" data-user-action="edit" data-id="${escapeAttr(user.id)}">Edit akses</button><button type="button" class="ghost-button small" data-user-action="reset" data-id="${escapeAttr(user.id)}">Hantar emel reset</button></div>`}</td>
    </tr>
  `;
}

async function handleBookingSubmit(event) {
  event.preventDefault();
  if (!(isSupervisor() || isAdmin())) {
    showToast("Akses penyelia diperlukan.");
    return;
  }

  const vehicle = findVehicle(els.bookingVehicle.value);
  if (!vehicle) {
    showToast("Sila pilih kenderaan.");
    return;
  }

  if (!isAdmin() && !supervisorVehicles().some((item) => item.id === vehicle.id)) {
    showToast("Kenderaan ini tidak dipautkan kepada akaun anda.");
    return;
  }

  const startAt = els.bookingStart.value;
  const endAt = els.bookingEnd.value;
  if (new Date(startAt) >= new Date(endAt)) {
    showToast("Masa selesai mesti selepas masa guna.");
    return;
  }

  const payload = {
    vehicleId: vehicle.id,
    vehicleLabel: vehicleLabel(vehicle),
    driverName: els.bookingDriver.value.trim(),
    supervisorId: state.currentUser?.uid || vehicle.supervisorId || "",
    supervisorName: state.profile?.displayName || vehicle.supervisorName || "",
    supervisorEmail: state.currentUser?.email || vehicle.supervisorEmail || "",
    destination: els.bookingDestination.value.trim(),
    startAt,
    endAt,
    notes: els.bookingNotes.value.trim(),
    updatedAt: nowValue()
  };

  const id = els.bookingId.value;

  try {
    if (state.firebaseReady) {
      const { addDoc, collection, doc, serverTimestamp, updateDoc } = state.sdk;
      const firebasePayload = { ...payload, updatedAt: serverTimestamp() };
      if (id) {
        await updateDoc(doc(state.db, "bookings", id), firebasePayload);
      } else {
        await addDoc(collection(state.db, "bookings"), {
          ...firebasePayload,
          createdAt: serverTimestamp()
        });
      }
    } else if (id) {
      state.bookings = state.bookings.map((booking) => (
        booking.id === id ? { ...booking, ...payload } : booking
      ));
    } else {
      state.bookings.push({ id: crypto.randomUUID(), ...payload, createdAt: nowValue() });
    }

    resetBookingForm();
    renderAll();
    showToast("Rekod penggunaan telah disimpan.");
  } catch (error) {
    showToast(readableFirebaseError(error));
  }
}

function handleBookingAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  if (!(isSupervisor() || isAdmin())) {
    showToast("Akses penyelia diperlukan.");
    return;
  }

  const booking = state.bookings.find((item) => item.id === button.dataset.id);
  if (!booking) return;
  if (!canManageBooking(booking)) {
    showToast("Kenderaan ini tidak dipautkan kepada akaun anda.");
    return;
  }

  if (button.dataset.action === "edit-booking") {
    els.bookingId.value = booking.id;
    els.bookingVehicle.value = booking.vehicleId;
    els.bookingDriver.value = booking.driverName || "";
    els.bookingDestination.value = booking.destination || "";
    els.bookingStart.value = booking.startAt || "";
    els.bookingEnd.value = booking.endAt || "";
    els.bookingNotes.value = booking.notes || "";
    els.bookingForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (button.dataset.action === "delete-booking") {
    deleteBooking(booking.id);
  }
}

async function deleteBooking(id) {
  if (!(isSupervisor() || isAdmin())) {
    showToast("Akses penyelia diperlukan.");
    return;
  }

  const booking = state.bookings.find((item) => item.id === id);
  if (booking && !canManageBooking(booking)) {
    showToast("Kenderaan ini tidak dipautkan kepada akaun anda.");
    return;
  }

  const confirmed = window.confirm("Padam rekod penggunaan ini?");
  if (!confirmed) return;

  try {
    if (state.firebaseReady) {
      const { deleteDoc, doc } = state.sdk;
      await deleteDoc(doc(state.db, "bookings", id));
    } else {
      state.bookings = state.bookings.filter((booking) => booking.id !== id);
    }

    renderAll();
    showToast("Rekod penggunaan dipadam.");
  } catch (error) {
    showToast(readableFirebaseError(error));
  }
}

function resetBookingForm() {
  els.bookingForm.reset();
  els.bookingId.value = "";
  const vehicles = supervisorVehicles();
  if (vehicles[0]) {
    els.bookingVehicle.value = vehicles[0].id;
    els.bookingDriver.value = vehicles[0].driverName || "";
  }
}

async function handleVehicleSubmit(event) {
  event.preventDefault();
  if (!isAdmin()) {
    showToast("Akses admin diperlukan.");
    return;
  }

  const id = els.vehicleId.value;
  const payload = {
    model: els.vehicleModel.value.trim(),
    registrationNo: els.vehicleRegistration.value.trim().toUpperCase(),
    projectName: els.vehicleProject.value.trim(),
    contractNo: els.vehicleContract.value.trim(),
    picName: els.vehiclePic.value.trim(),
    driverName: els.vehicleDriver.value.trim(),
    receivedDate: els.vehicleReceived.value,
    projectReadyDate: els.vehicleProjectDone.value,
    supervisorName: els.vehicleSupervisorName.value.trim(),
    supervisorPhone: els.vehicleSupervisorPhone.value.trim(),
    supervisorEmail: els.vehicleSupervisorEmail.value.trim().toLowerCase(),
    supervisorId: els.vehicleSupervisorId.value.trim(),
    capacity: Number(els.vehicleCapacity.value || 0),
    updatedAt: nowValue()
  };

  try {
    if (state.firebaseReady) {
      const { addDoc, collection, doc, serverTimestamp, setDoc } = state.sdk;
      const firebasePayload = { ...payload, updatedAt: serverTimestamp() };
      if (id) {
        await setDoc(doc(state.db, "vehicles", id), firebasePayload, { merge: true });
      } else {
        await addDoc(collection(state.db, "vehicles"), {
          ...firebasePayload,
          createdAt: serverTimestamp()
        });
      }
    } else if (id) {
      state.vehicles = state.vehicles.map((vehicle) => (
        vehicle.id === id ? { ...vehicle, ...payload } : vehicle
      ));
    } else {
      state.vehicles.push({ id: crypto.randomUUID(), ...payload, createdAt: nowValue() });
    }

    resetVehicleForm();
    renderAll();
    showToast("Maklumat kenderaan disimpan.");
  } catch (error) {
    showToast(readableFirebaseError(error));
  }
}

function handleVehicleAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  if (!isAdmin()) {
    showToast("Akses admin diperlukan.");
    return;
  }

  const vehicle = findVehicle(button.dataset.id);
  if (!vehicle) return;

  if (button.dataset.action === "edit-vehicle") {
    fillVehicleForm(vehicle);
  }

  if (button.dataset.action === "delete-vehicle") {
    deleteVehicle(vehicle.id);
  }
}

function fillVehicleForm(vehicle) {
  els.vehicleId.value = vehicle.id;
  els.vehicleModel.value = vehicle.model || "";
  els.vehicleRegistration.value = vehicle.registrationNo || "";
  els.vehicleProject.value = vehicle.projectName || "";
  els.vehicleContract.value = vehicle.contractNo || "";
  els.vehiclePic.value = vehicle.picName || "";
  els.vehicleDriver.value = vehicle.driverName || "";
  els.vehicleReceived.value = vehicle.receivedDate || "";
  els.vehicleProjectDone.value = vehicle.projectReadyDate || "";
  els.vehicleSupervisorName.value = vehicle.supervisorName || "";
  els.vehicleSupervisorPhone.value = vehicle.supervisorPhone || "";
  els.vehicleSupervisorEmail.value = vehicle.supervisorEmail || "";
  els.vehicleSupervisorId.value = vehicle.supervisorId || "";
  els.vehicleCapacity.value = vehicle.capacity || 4;
  els.vehicleForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteVehicle(id) {
  if (!isAdmin()) {
    showToast("Akses admin diperlukan.");
    return;
  }

  const confirmed = window.confirm("Padam rekod kenderaan ini? Rekod penggunaan berkaitan tidak dipadam secara automatik.");
  if (!confirmed) return;

  try {
    if (state.firebaseReady) {
      const { deleteDoc, doc } = state.sdk;
      await deleteDoc(doc(state.db, "vehicles", id));
    } else {
      state.vehicles = state.vehicles.filter((vehicle) => vehicle.id !== id);
    }

    resetVehicleForm();
    renderAll();
    showToast("Rekod kenderaan dipadam.");
  } catch (error) {
    showToast(readableFirebaseError(error));
  }
}

function resetVehicleForm() {
  els.vehicleForm.reset();
  els.vehicleId.value = "";
  els.vehicleCapacity.value = 4;
}

async function handleUserSubmit(event) {
  event.preventDefault();
  if (!isAdmin()) {
    showToast("Akses admin diperlukan.");
    return;
  }

  const uid = els.userUid.value.trim();
  const payload = {
    displayName: els.userName.value.trim(),
    email: els.userEmail.value.trim().toLowerCase(),
    phone: document.getElementById("userPhone").value.trim(),
    disabled: document.getElementById("userDisabled").checked,
    allowedVehicleIds: [...els.userVehicles.selectedOptions].map(option => option.value)
  };

  try {
    if (state.firebaseReady) {
      const writes = buildAccessChanges(state.users, state.vehicles, uid, payload);
      const batch = state.sdk.writeBatch(state.db);
      for (const write of writes) {
        const { id: ignored, ...data } = write.data;
        batch.set(state.sdk.doc(state.db, write.collection, write.id), { ...data, updatedAt: state.sdk.serverTimestamp() }, { merge: true });
      }
      await batch.commit();
    } else {
      const writes = buildAccessChanges(state.users, state.vehicles, uid, payload);
      for (const write of writes) {
        const list = write.collection === "access" ? state.users : state.vehicles;
        const existing = list.find(item => item.id === write.id);
        if (existing) Object.assign(existing, write.data);
        else list.push({ ...write.data, id: write.id });
      }
    }

    resetUserForm();
    renderAll();
    showToast("Akses pengguna disimpan.");
  } catch (error) {
    showToast(readableFirebaseError(error));
  }
}

function summaryCard(label, value) {
  return `
    <article class="summary-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </article>
  `;
}

function resetUserForm() {
  els.userForm.reset();
  els.userUid.value = "";
  document.getElementById("userFormTitle").textContent = "Tambah Penyelia";
}

async function handleUserAction(event) {
  const button = event.target.closest("[data-user-action]");
  if (!button || !isAdmin()) return;
  const user = state.users.find(item => item.id === button.dataset.id);
  if (!user || user.id === ROOT_ADMIN_UID || user.role === "admin") return;
  if (button.dataset.userAction === "edit") {
    els.userUid.value = user.id;
    els.userName.value = user.displayName || "";
    els.userEmail.value = user.email || "";
    document.getElementById("userPhone").value = user.phone || state.vehicles.find(vehicle => vehicle.supervisorId === user.id)?.supervisorPhone || "";
    document.getElementById("userDisabled").checked = user.disabled === true;
    [...els.userVehicles.options].forEach(option => { option.selected = (user.allowedVehicleIds || []).includes(option.value); });
    document.getElementById("userFormTitle").textContent = "Edit Penyelia";
    els.userForm.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (button.dataset.userAction === "reset") {
    if (!confirm(`Hantar emel penetapan semula password kepada ${user.email}?`)) return;
    if (DEVELOPMENT_PREVIEW) { showToast("Pratonton: tiada emel dihantar."); return; }
    button.disabled = true;
    try {
      await state.sdk.sendPasswordResetEmail(state.auth, user.email);
      showToast("Permintaan emel reset dihantar.");
    } catch (error) { showToast(readableFirebaseError(error)); }
    finally { button.disabled = false; }
  }
}

async function handlePasswordChange(event) {
  event.preventDefault();
  const password = document.getElementById("newPassword").value;
  if (password !== document.getElementById("confirmPassword").value) { showToast("Pengesahan password tidak sepadan."); return; }
  const submit = event.submitter;
  submit.disabled = true;
  try {
    if (!DEVELOPMENT_PREVIEW) {
      const credential = state.sdk.EmailAuthProvider.credential(state.currentUser.email, document.getElementById("currentPassword").value);
      await state.sdk.reauthenticateWithCredential(state.currentUser, credential);
      await state.sdk.updatePassword(state.currentUser, password);
      await state.sdk.signOut(state.auth);
    }
    document.getElementById("passwordDialog").close();
    showToast("Password ditukar. Sila log masuk dengan password baharu.");
  } catch (error) { showToast(readableFirebaseError(error)); }
  finally { submit.disabled = false; }
}

async function handleRegistration(event) {
  event.preventDefault();
  const email = document.getElementById("registerEmail").value.trim().toLowerCase();
  const password = document.getElementById("registerPassword").value;
  if (email === ROOT_ADMIN_EMAIL) { showToast("Admin utama menggunakan akaun sedia ada. Sila log masuk."); return; }
  if (password !== document.getElementById("registerConfirm").value) { showToast("Password tidak sepadan."); return; }
  const submit = event.submitter;
  submit.disabled = true;
  try {
    const result = await state.sdk.createUserWithEmailAndPassword(state.auth, email, password);
    document.getElementById("registerDialog").close();
    // Registration authenticates the account but never grants supervisor privileges.
    try { await state.sdk.sendEmailVerification(result.user); showToast("Akaun didaftarkan. Semak emel pengesahan."); }
    catch { showToast("Akaun didaftarkan. Tekan Hantar emel pengesahan untuk cuba semula."); }
  } catch (error) { showToast(readableFirebaseError(error)); }
  finally { submit.disabled = false; }
}

function vehicleAvailability(vehicleId) {
  const now = new Date();
  const vehicleBookings = state.bookings
    .filter((booking) => booking.vehicleId === vehicleId)
    .sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));

  const active = vehicleBookings.find((booking) => {
    const start = new Date(booking.startAt);
    const end = new Date(booking.endAt);
    return start <= now && now <= end;
  });

  if (active) {
    return {
      key: "active",
      label: "Digunakan",
      booking: active,
      detail: `Sehingga ${formatDateTime(active.endAt)} ke ${active.destination || "-"}`
    };
  }

  const next = vehicleBookings.find((booking) => new Date(booking.startAt) > now);
  if (next) {
    return {
      key: "free",
      label: "Kosong",
      booking: next,
      detail: `Tempahan seterusnya ${formatDateTime(next.startAt)}`
    };
  }

  return {
    key: "free",
    label: "Kosong",
    detail: "Tiada tempahan aktif atau akan datang."
  };
}

function bookingStatus(booking, now = new Date()) {
  const start = new Date(booking.startAt);
  const end = new Date(booking.endAt);
  if (start <= now && now <= end) return { key: "active", label: "Sedang digunakan" };
  if (start > now) return { key: "booked", label: "Akan datang" };
  return { key: "done", label: "Selesai" };
}

function supervisorVehicles() {
  if (isAdmin()) return state.vehicles;
  const allowed = state.profile?.allowedVehicleIds || [];
  return state.vehicles.filter((vehicle) => allowed.includes(vehicle.id));
}

function canManageBooking(booking) {
  if (isAdmin()) return true;
  return supervisorVehicles().some((vehicle) => vehicle.id === booking.vehicleId);
}

function canOpenView(viewId) {
  if (DEVELOPMENT_PREVIEW) return ["calendarView", "supervisorView", "adminView"].includes(viewId);
  if (viewId === "calendarView") return true;
  if (viewId === "supervisorView") return isSupervisor() || isAdmin();
  if (viewId === "adminView") return isAdmin();
  return false;
}

function restrictedViewMessage(viewId) {
  if (viewId === "adminView") {
    return "Sila log masuk sebagai admin dahulu.";
  }

  if (viewId === "supervisorView") {
    return "Sila log masuk sebagai penyelia atau admin dahulu.";
  }

  return "Akses tidak dibenarkan.";
}

function hasWritableSession() {
  return (DEVELOPMENT_PREVIEW || Boolean(state.firebaseReady && state.currentUser)) && !state.profile?.disabled;
}

function currentRole() {
  if (state.firebaseConfigured && !state.currentUser) return "viewer";
  return state.profile?.role || "viewer";
}

function isSupervisor() {
  return hasWritableSession() && currentRole() === "supervisor" && (DEVELOPMENT_PREVIEW || state.currentUser.emailVerified);
}

function isAdmin() {
  return hasWritableSession() && (DEVELOPMENT_PREVIEW ? currentRole() === "admin" : state.currentUser?.uid === ROOT_ADMIN_UID && state.currentUser?.email?.toLowerCase() === ROOT_ADMIN_EMAIL);
}

function roleLabel(role) {
  return {
    admin: "Admin",
    supervisor: "Penyelia",
    viewer: "Pengguna"
  }[role] || "Pengguna";
}

function findVehicle(id) {
  return state.vehicles.find((vehicle) => vehicle.id === id);
}

function vehicleLabel(vehicle, fallback = "") {
  if (!vehicle) return fallback || "-";
  return `${vehicle.model || "Kenderaan"} ${vehicle.registrationNo ? `(${vehicle.registrationNo})` : ""}`.trim();
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ms-MY", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ms-MY", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function formatMonthYear(date) {
  return new Intl.DateTimeFormat("ms-MY", {
    month: "long",
    year: "numeric"
  }).format(date);
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ms-MY", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function toDateKey(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfWeek(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const mondayOffset = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - mondayOffset);
  return copy;
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function bookingTouchesDate(booking, date) {
  const start = new Date(booking.startAt);
  const end = new Date(booking.endAt || booking.startAt);
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayEnd = endOfDay(date);
  return start <= dayEnd && end >= dayStart;
}

function vehicleColor(seed = "") {
  const palette = [
    "#116a5c",
    "#b44a2f",
    "#2f65b4",
    "#8a5a12",
    "#6b4aa0",
    "#0f7c8a",
    "#9b355f",
    "#4f741f"
  ];
  const text = String(seed || "kenderaan");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % palette.length;
  }
  return palette[hash];
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function nowValue() {
  return toInputDateTime(new Date());
}

function toInputDateTime(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function createDemoData() {
  const today = new Date();
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  const nextWeek = addDays(today, 7);
  const projectDone = addDays(today, 90).toISOString().slice(0, 10);

  const vehicles = [
    {
      id: "hilux-kws-1024",
      model: "Toyota Hilux",
      registrationNo: "KWS 1024",
      projectName: "Projek Jalan Utama",
      projectDistrict: "Kuantan",
      projectState: "Pahang",
      contractNo: "KWS/JKR/2026/014",
      picName: "Aiman Hakim",
      driverName: "Azlan Rahim",
      receivedDate: "2026-07-15",
      projectReadyDate: projectDone,
      supervisorName: "Nur Hafiza",
      supervisorPhone: "012-3456789",
      supervisorEmail: "hafiza@example.com",
      supervisorId: "",
      capacity: 5
    },
    {
      id: "vios-kws-3388",
      model: "Toyota Vios",
      registrationNo: "KWS 3388",
      projectName: "Audit Tapak Selatan",
      projectDistrict: "Johor Bahru",
      projectState: "Johor",
      contractNo: "KWS/AUD/2026/006",
      picName: "Suresh Kumar",
      driverName: "Farid Zain",
      receivedDate: "2026-06-22",
      projectReadyDate: projectDone,
      supervisorName: "Rahman Salleh",
      supervisorPhone: "013-4567890",
      supervisorEmail: "rahman@example.com",
      supervisorId: "",
      capacity: 4
    },
    {
      id: "alza-kws-7710",
      model: "Perodua Alza",
      registrationNo: "KWS 7710",
      projectName: "Mobilisasi Projek Baharu",
      projectDistrict: "Seremban",
      projectState: "Negeri Sembilan",
      contractNo: "KWS/OPS/2026/019",
      picName: "Liyana Rosli",
      driverName: "Hadi Ismail",
      receivedDate: "2026-08-01",
      projectReadyDate: projectDone,
      supervisorName: "Mei Lin",
      supervisorPhone: "014-5678901",
      supervisorEmail: "meilin@example.com",
      supervisorId: "",
      capacity: 7
    }
  ];

  const bookings = [
    {
      id: "demo-1",
      vehicleId: "hilux-kws-1024",
      vehicleLabel: "Toyota Hilux (KWS 1024)",
      driverName: "Azlan Rahim",
      supervisorName: "Nur Hafiza",
      supervisorEmail: "hafiza@example.com",
      destination: "Tapak Projek Jalan Utama",
      startAt: toInputDateTime(yesterday),
      endAt: toInputDateTime(addDays(today, 1)),
      notes: "Lawatan pemantauan kerja tanah."
    },
    {
      id: "demo-2",
      vehicleId: "vios-kws-3388",
      vehicleLabel: "Toyota Vios (KWS 3388)",
      driverName: "Farid Zain",
      supervisorName: "Rahman Salleh",
      supervisorEmail: "rahman@example.com",
      destination: "Pejabat Kontraktor Zon Selatan",
      startAt: toInputDateTime(tomorrow),
      endAt: toInputDateTime(addDays(tomorrow, 1)),
      notes: "Mesyuarat penyelarasan bulanan."
    },
    {
      id: "demo-3",
      vehicleId: "alza-kws-7710",
      vehicleLabel: "Perodua Alza (KWS 7710)",
      driverName: "Hadi Ismail",
      supervisorName: "Mei Lin",
      supervisorEmail: "meilin@example.com",
      destination: "Stor Pusat",
      startAt: toInputDateTime(nextWeek),
      endAt: toInputDateTime(addDays(nextWeek, 1)),
      notes: "Pengambilan peralatan tapak."
    }
  ];

  return {
    vehicles,
    bookings,
    users: [
      {
        id: "demo-admin",
        displayName: "Admin Demo",
        email: "admin@example.com",
        role: "admin",
        allowedVehicleIds: []
      },
      {
        id: "hafiza@example.com",
        displayName: "Nur Hafiza",
        email: "hafiza@example.com",
        role: "supervisor",
        allowedVehicleIds: ["hilux-kws-1024"]
      }
    ]
  };
}

function readableFirebaseError(error) {
  const code = error?.code || "";
  const messages = {
    "auth/invalid-credential": "Emel atau password tidak sah.",
    "auth/user-not-found": "Akaun tidak ditemui.",
    "auth/wrong-password": "Password tidak sah.",
    "auth/user-disabled": "Akses akaun dinyahaktifkan. Hubungi Admin.",
    "auth/too-many-requests": "Terlalu banyak percubaan. Cuba semula sebentar lagi.",
    "functions/unavailable": "Perkhidmatan pengurusan akaun belum tersedia. Cuba semula kemudian.",
    "permission-denied": "Akses tidak dibenarkan oleh Firestore rules."
  };
  return messages[code] || error?.message || "Ralat tidak dijangka.";
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    els.toast.classList.remove("is-visible");
  }, 3200);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

window.JADUAL_PEMANDU_VERSION = APP_VERSION;
