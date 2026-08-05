const APP_VERSION = "ver1.0.1";
const FIREBASE_SDK_VERSION = "10.12.5";

const demoData = createDemoData();

const state = {
  firebaseEnabled: false,
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
  calendarCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  unsubscribers: [],
  profileUnsubscribe: null,
  usersUnsubscribe: null
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  renderAll();
  initFirebase();
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
    "userRole",
    "userVehicles",
    "adminVehicleRows",
    "adminUserRows",
    "toast"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
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

  els.supervisorRows.addEventListener("click", handleBookingAction);
  els.adminVehicleRows.addEventListener("click", handleVehicleAction);
}

async function initFirebase() {
  const config = window.JADUAL_FIREBASE_CONFIG || {};

  if (!hasFirebaseConfig(config)) {
    state.firebaseEnabled = false;
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

    subscribePublicData();
    state.sdk.onAuthStateChanged(state.auth, (user) => {
      state.currentUser = user;
      subscribeUserProfile(user);
      renderAll();
    });
  } catch (error) {
    console.error(error);
    state.firebaseEnabled = false;
    showToast("Firebase tidak dapat dimuat. Paparan demo digunakan.");
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
  state.profileUnsubscribe = onSnapshot(doc(state.db, "users", user.uid), (snapshot) => {
    state.profile = snapshot.exists()
      ? { id: snapshot.id, ...snapshot.data() }
      : {
          id: user.uid,
          displayName: user.displayName || user.email,
          email: user.email,
          role: "viewer",
          allowedVehicleIds: []
        };

    if (state.usersUnsubscribe) {
      state.usersUnsubscribe();
      state.usersUnsubscribe = null;
    }

    if (isAdmin()) {
      state.usersUnsubscribe = onSnapshot(collection(state.db, "users"), (usersSnapshot) => {
        state.users = usersSnapshot.docs.map((userDoc) => ({ id: userDoc.id, ...userDoc.data() }));
        renderAdmin();
      });
    }

    renderAll();
  });
}

function setActiveView(viewId) {
  state.activeView = viewId;
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === viewId);
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("is-active", view.id === viewId);
  });
}

function renderAll() {
  renderAuth();
  renderCalendar();
  renderSupervisor();
  renderAdmin();
}

function renderAuth() {
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
    `;

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
      </div>
    </div>
  `;

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
  showToast(`Paparan demo: ${roleLabel(role)}.`);
}

function renderCalendar() {
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
    .sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
}

function moveCalendarMonth(offset) {
  state.calendarCursor = new Date(
    state.calendarCursor.getFullYear(),
    state.calendarCursor.getMonth() + offset,
    1
  );
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
    ? state.vehicles.map((vehicle) => {
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
}

function renderCalendarDay(day, monthStart, bookings) {
  const dayKey = toDateKey(day);
  const todayKey = toDateKey(new Date());
  const dayBookings = bookings.filter((booking) => bookingTouchesDate(booking, day));
  const classes = [
    "calendar-day",
    day.getMonth() !== monthStart.getMonth() ? "is-outside" : "",
    dayKey === todayKey ? "is-today" : ""
  ].filter(Boolean).join(" ");

  return `
    <article class="${classes}" aria-label="${escapeAttr(formatDate(dayKey))}">
      <div class="calendar-date">${day.getDate()}</div>
      <div class="calendar-events">
        ${dayBookings.length ? dayBookings.map(renderCalendarEvent).join("") : ""}
      </div>
    </article>
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
  return `
    <article class="vehicle-item" style="--vehicle-color: ${color}">
      <header>
        <div>
          <div class="vehicle-title">${escapeHtml(vehicleLabel(vehicle))}</div>
          <div class="vehicle-meta project-name">${escapeHtml(vehicle.projectName || "Tiada nama projek")}</div>
        </div>
        <span class="status-chip ${availability.key}">${escapeHtml(availability.label)}</span>
      </header>
      <div class="record-meta">
        Penyelia: ${escapeHtml(vehicle.supervisorName || "-")}
        <br>No. telefon: ${escapeHtml(vehicle.supervisorPhone || "-")}
        <br>PIC: ${escapeHtml(vehicle.picName || "-")}
      </div>
      <div class="record-meta">${escapeHtml(availability.detail)}</div>
    </article>
  `;
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
    : "Mod demo: dashboard admin aktif selepas Firebase dikonfigurasi dan akaun admin diwujudkan.";

  if (!canAccess) return;

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
      <td>${escapeHtml((user.allowedVehicleIds || []).join(", ") || "-")}</td>
      <td>${escapeHtml(user.id || "-")}</td>
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

  const booking = state.bookings.find((item) => item.id === button.dataset.id);
  if (!booking) return;

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
    role: els.userRole.value,
    allowedVehicleIds: els.userVehicles.value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    updatedAt: nowValue()
  };

  try {
    if (state.firebaseReady) {
      const { doc, serverTimestamp, setDoc } = state.sdk;
      await setDoc(doc(state.db, "users", uid), {
        ...payload,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } else {
      const existing = state.users.find((user) => user.id === uid);
      if (existing) {
        Object.assign(existing, payload);
      } else {
        state.users.push({ id: uid, ...payload });
      }
    }

    els.userForm.reset();
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
      detail: `Sehingga ${formatDateTime(active.endAt)} ke ${active.destination || "-"}`
    };
  }

  const next = vehicleBookings.find((booking) => new Date(booking.startAt) > now);
  if (next) {
    return {
      key: "free",
      label: "Kosong",
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
  const uid = state.currentUser?.uid;
  const email = state.currentUser?.email?.toLowerCase();

  return state.vehicles.filter((vehicle) => (
    allowed.includes(vehicle.id) ||
    vehicle.supervisorId === uid ||
    String(vehicle.supervisorEmail || "").toLowerCase() === email
  ));
}

function currentRole() {
  return state.profile?.role || "viewer";
}

function isSupervisor() {
  return currentRole() === "supervisor";
}

function isAdmin() {
  return currentRole() === "admin";
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
        id: "demo-supervisor",
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
