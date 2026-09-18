export const headings = ["Bil.", "Tarikh", "Nama Pengguna", "Dari", "Hingga", "Destinasi / Tempat", "Tujuan", "Nama Pegawai", "Tandatangan", "Perbatuan / Mileage (bacaan odometer)", "Catatan"];
const zone = "Asia/Kuala_Lumpur";
export function dayKey(value) {
  if (!value) return "";
  if (/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(+date) ? "" : new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function time(value) {
  if (!value) return "";
  const local = /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value) ? value.slice(11) : new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
  const [h, m] = local.split(":").map(Number);
  return `${h % 12 || 12}.${String(m).padStart(2, "0")} ${h < 12 ? "Pagi" : h < 19 ? "Petang" : "Malam"}`;
}
export function reportRows(bookings, vehicleId, month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  const [year, m] = month.split("-").map(Number);
  const rows = [];
  let number = 0;
  for (let d = 1; d <= new Date(year, m, 0).getDate(); d++) {
    const key = `${month}-${String(d).padStart(2, "0")}`;
    const date = new Date(`${key}T12:00:00+08:00`);
    const weekend = [0, 6].includes(date.getUTCDay());
    const matches = bookings.filter(b => b.vehicleId === vehicleId && dayKey(b.startAt) <= key && dayKey(b.endAt) >= key && dayKey(b.startAt)).sort((a, b) => a.startAt.localeCompare(b.startAt));
    for (const b of matches.length ? matches : [null]) {
      rows.push({ dateKey: key, booking: b, weekend, values: [weekend && !b ? "" : ++number,
        new Intl.DateTimeFormat("ms-MY", { timeZone: zone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date).replace(", ", ",\n"),
        b?.userName || b?.officerName || "", b && dayKey(b.startAt) === key ? time(b.startAt) : "", b && dayKey(b.endAt) === key ? time(b.endAt) : "",
        b?.destination || "", b?.purpose || "", b?.userName || b?.officerName || "", "", b?.mileage ?? "", b?.notes || ""] });
    }
  }
  return rows;
}
export function usageRows(bookings, vehicleId, month) {
  return reportRows(bookings, vehicleId, month).filter(row => row.booking)
    .map((row, index) => ({ ...row, values: [index + 1, ...row.values.slice(1)] }));
}
export function dailyReportRows(bookings, vehicleId, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Tarikh tidak sah.");
  const rows = reportRows(bookings, vehicleId, date.slice(0, 7)).filter(row => row.dateKey === date);
  if (!rows.length) throw new Error("Tarikh tidak sah.");
  return rows.map((row, i) => ({ ...row, values: [row.booking ? i + 1 : "", ...row.values.slice(1)] }));
}
export function driverWhatsAppUrl(phone, message, mobile = false) {
  if (!/^601\d{8,9}$/.test(phone)) throw new Error("Invalid driver phone");
  return mobile ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    : `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
}
export function driverMessage(vehicle, booking) {
  const start = dayKey(booking.startAt);
  const end = dayKey(booking.endAt);
  const date = key => key ? key.split("-").reverse().map(Number).join("/") : "-";
  const dated = key => `${date(key)} ${key ? new Intl.DateTimeFormat("ms-MY", { weekday: "long", timeZone: zone }).format(new Date(`${key}T12:00:00+08:00`)) : ""}`.trim();
  const clock = value => time(value).replace(".", ":").replace(" ", "");
  return [`1. *(${dated(start)}${start !== end ? ` hingga ${dated(end)}` : ""})*`, "",
    `    \u23f0 jam pergi = ${clock(booking.startAt)}`,
    `    \u23f0 jam pulang = ${clock(booking.endAt)}${start !== end ? ` (${date(end)})` : ""}`, "",
    `    \ud83d\udccc ${booking.destination || "-"}`, "",
    `    \ud83d\udc64 ${booking.userName || booking.officerName || "-"} (${booking.purpose || "-"})`, "",
    "Sila nyatakan bacaan odometer sebelum dan selepas penggunaan ini."].join("\n");
}
let excelReady;
export async function downloadReport(vehicle, month, rows, selectedDate = "") {
  if (!excelReady) excelReady = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
    script.onload = resolve;
    script.onerror = () => { excelReady = null; script.remove(); reject(new Error("Pustaka Excel gagal dimuat. Sila cuba semula.")); };
    document.head.append(script);
  });
  await excelReady;
  let binary = "";
  if (!selectedDate) {
    const response = await fetch(new URL("./jkr-report-logo.png", import.meta.url));
    if (!response.ok) throw new Error("Logo laporan gagal dimuat. Sila cuba semula.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    for (const byte of bytes) binary += String.fromCharCode(byte);
  }
  const book = buildReportWorkbook(window.ExcelJS, vehicle, month, rows, btoa(binary), selectedDate);
  const blob = new Blob([await book.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `Rekod-${vehicle.registrationNo.replace(/[^a-z0-9]/gi, "")}-${selectedDate || month}.xlsx`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function mergedText(sheet, range, value, size = 11, horizontal = "left") {
  sheet.mergeCells(range);
  const cell = sheet.getCell(range.split(":")[0]);
  cell.value = value || "";
  cell.font = { name: "Arial", size, bold: true };
  cell.alignment = { horizontal, vertical: "middle", wrapText: true };
  return cell;
}

function addCover(book, vehicle, logo) {
  const sheet = book.addWorksheet("Muka Depan", {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 1, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1,
      printArea: "A1:N24", horizontalCentered: true, verticalCentered: true,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0, footer: 0 } }
  });
  sheet.columns = Array.from({ length: 14 }, () => ({ width: 8 }));
  for (let r = 1; r <= 24; r++) sheet.getRow(r).height = 20;
  // Border is on the outside cells, leaving the editable text areas unframed.
  for (let r = 1; r <= 24; r++) for (let c = 1; c <= 14; c++) {
    const border = {};
    for (const [side, edge] of [["top", r === 1], ["bottom", r === 24], ["left", c === 1], ["right", c === 14]]) {
      if (edge) border[side] = { style: "double", color: { argb: "FF000000" } };
    }
    sheet.getCell(r, c).border = border;
  }
  const imageId = book.addImage({ base64: logo, extension: "png" });
  sheet.addImage(imageId, { tl: { nativeCol: 4, nativeColOff: 433388, nativeRow: 1, nativeRowOff: 101600 }, ext: { width: 275, height: 205 }, editAs: "oneCell" });
  mergedText(sheet, "B11:M12", "JABATAN KERJA RAYA MALAYSIA", 16, "center");
  mergedText(sheet, "B13:M14", "BUKU LOG KENDERAAN", 21, "center");
  mergedText(sheet, "B16:F18", "NAMA PROJEK:");
  mergedText(sheet, "G16:M18", vehicle.projectName);
  for (const [row, label, value] of [
    [20, "NO. KONTRAK:", vehicle.contractNo],
    [21, "KONTRAKTOR:", vehicle.contractor],
    [22, "NAMA PEMANDU DAN NO. (H/P):", [vehicle.driverName, vehicle.driverPhone].filter(Boolean).join(" / ")],
    [23, "NO.PENDAFTARAN:", vehicle.registrationNo]
  ]) {
    mergedText(sheet, `B${row}:F${row}`, label, 10);
    mergedText(sheet, `G${row}:M${row}`, value, 10);
  }
}

function addAnnualConfirmation(book, vehicle, year) {
  const sheet = book.addWorksheet("Pengesahan", {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1,
      printArea: "A1:E19", horizontalCentered: true,
      margins: { left: 0.2, right: 0.2, top: 0.3, bottom: 0.3, header: 0, footer: 0 } }
  });
  sheet.columns = [7, 25, 29, 38, 37].map(width => ({ width }));
  mergedText(sheet, "A1:E1", "Lampiran 8", 9, "right");
  mergedText(sheet, "A2:E2", "(kepada SA KPKR Bil 3/2017)", 9, "right");
  const title = mergedText(sheet, "A3:E3", "PENGESAHAN DAN SEMAKAN BULANAN", 11, "center");
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDF0D2" } };
  title.border = Object.fromEntries(["top", "bottom", "left", "right"].map(side => [side, { style: "medium" }]));
  mergedText(sheet, "A4:C4", `JENIS KENDERAAN: ${vehicle.model || ""}`, 9);
  mergedText(sheet, "D4:E4", `NO.PENDAFTARAN KENDERAAN: ${vehicle.registrationNo || ""}`, 9);
  mergedText(sheet, "A6:C6", `PEGAWAI YANG BERTANGGUNGJAWAB : ${vehicle.supervisorName || ""}`, 9);
  mergedText(sheet, "D6:E6", "NAMA PEJABAT: CAWANGAN KEJURUTERAAN AWAM DAN STRUKTUR", 9);
  const months = ["JANUARI", "FEBRUARI", "MAC", "APRIL", "MEI", "JUN", "JULAI", "OGOS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DISEMBER"];
  sheet.getRow(7).values = ["Bil.", "Bulan / Tahun", "Disemak Oleh", "Tandatangan & Cop", "Ulasan / Catatan"];
  months.forEach((month, i) => { sheet.getRow(i + 8).values = [i + 1, `${month} / ${year}`, "", "", ""]; });
  for (let r = 1; r <= 19; r++) {
    sheet.getRow(r).height = r <= 2 ? 14 : r === 5 ? 10 : r === 6 ? 30 : r === 7 ? 30 : r >= 8 ? 29 : 22;
    if (r < 7) continue;
    for (let c = 1; c <= 5; c++) {
      const cell = sheet.getCell(r, c);
      cell.font = { name: "Arial", size: 10, bold: r === 7 || c === 2 };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = Object.fromEntries(["top", "bottom", "left", "right"].map(side => [side, { style: r === 7 ? "medium" : "thin", color: { argb: "FF000000" } }]));
      if (r === 7) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
    }
  }
}

export function buildReportWorkbook(ExcelJS, vehicle, month, rows, logo, selectedDate = "") {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Bulan laporan tidak sah.");
  if (selectedDate) {
    dailyReportRows([], vehicle.id, selectedDate);
    if (selectedDate.slice(0, 7) !== month || rows.some(row => row.dateKey !== selectedDate)) throw new Error("Tarikh rekod tidak sepadan.");
  }
  const book = new ExcelJS.Workbook();
  if (!selectedDate) addCover(book, vehicle, logo);
  const sheet = book.addWorksheet("Rekod Penggunaan", { views: [{ state: "frozen", ySplit: 5 }], pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:5" } });
  sheet.columns = [7, 29, 25, 16, 16, 32, 32, 24, 20, 22, 35].map(width => ({ width }));
  sheet.mergeCells("A1:K1"); sheet.getCell("A1").value = "REKOD PENGGUNAAN KENDERAAN";
  sheet.mergeCells("A2:K2"); sheet.getCell("A2").value = `${vehicle.registrationNo} (${vehicle.model})`;
  sheet.mergeCells("A3:K3"); sheet.getCell("A3").value = new Intl.DateTimeFormat("ms-MY", { ...(selectedDate ? { weekday: "long", day: "numeric" } : {}), month: "long", year: "numeric" }).format(new Date(`${selectedDate || `${month}-01`}T12:00:00`));
  for (const col of ["A", "B", "C", "F", "G", "J", "K"]) sheet.mergeCells(`${col}4:${col}5`);
  sheet.mergeCells("D4:E4"); sheet.getCell("D4").value = "Masa";
  sheet.mergeCells("H4:I4"); sheet.getCell("H4").value = "Nama dan Tandatangan Pegawai Yang Mengguna";
  headings.forEach((label, index) => sheet.getCell([3, 4, 7, 8].includes(index) ? 5 : 4, index + 1).value = label);
  rows.forEach(row => sheet.addRow(row.values));
  sheet.eachRow((row, n) => {
    row.height = n <= 3 ? 25 : n <= 5 ? 35 : 60;
    for (let c = 1; c <= 11; c++) {
      const cell = row.getCell(c);
      cell.font = { name: "Arial", size: 11, bold: n <= 5 };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = Object.fromEntries(["top", "bottom", "left", "right"].map(side => [side, { style: "thin", color: { argb: "FF444444" } }]));
      const color = n === 3 ? "FFDDF0D2" : n === 4 || n === 5 || rows[n - 6]?.weekend ? "FFD9D9D9" : "FFFFFFFF";
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    }
  });
  if (!selectedDate) addAnnualConfirmation(book, vehicle, month.slice(0, 4));
  return book;
}
