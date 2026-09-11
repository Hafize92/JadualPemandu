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
      rows.push({ booking: b, weekend, values: [weekend && !b ? "" : ++number,
        new Intl.DateTimeFormat("ms-MY", { timeZone: zone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date).replace(", ", ",\n"),
        b?.userName || b?.officerName || "", b && dayKey(b.startAt) === key ? time(b.startAt) : "", b && dayKey(b.endAt) === key ? time(b.endAt) : "",
        b?.destination || "", b?.purpose || "", b?.userName || b?.officerName || "", "", b?.mileage ?? "", b?.notes || ""] });
    }
  }
  return rows;
}
export function driverMessage(vehicle, booking) {
  const start = dayKey(booking.startAt);
  const end = dayKey(booking.endAt);
  const date = key => key ? key.split("-").reverse().map(Number).join("/") : "-";
  return [vehicle.registrationNo || "-", booking.destination || "-",
    start === end ? date(start) : `${date(start)} hingga ${date(end)}`,
    `${time(booking.startAt)} Bertolak - ${time(booking.endAt)} Balik`,
    booking.userName || booking.officerName || "-", booking.purpose || "-", "",
    "Sila nyatakan bacaan odometer sebelum dan selepas penggunaan ini."].join("\n");
}
let excelReady;
export async function downloadReport(vehicle, month, rows) {
  if (!excelReady) excelReady = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
    script.onload = resolve;
    script.onerror = () => { excelReady = null; script.remove(); reject(new Error("Pustaka Excel gagal dimuat. Sila cuba semula.")); };
    document.head.append(script);
  });
  await excelReady;
  const book = new window.ExcelJS.Workbook();
  const sheet = book.addWorksheet("Rekod Penggunaan", { views: [{ state: "frozen", ySplit: 5 }], pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:5" } });
  sheet.columns = [7, 29, 25, 16, 16, 32, 32, 24, 20, 22, 35].map(width => ({ width }));
  sheet.mergeCells("A1:K1"); sheet.getCell("A1").value = "REKOD PENGGUNAAN KENDERAAN";
  sheet.mergeCells("A2:K2"); sheet.getCell("A2").value = `${vehicle.registrationNo} (${vehicle.model})`;
  sheet.mergeCells("A3:K3"); sheet.getCell("A3").value = new Intl.DateTimeFormat("ms-MY", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`));
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
  const blob = new Blob([await book.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `Rekod-${vehicle.registrationNo.replace(/[^a-z0-9]/gi, "")}-${month}.xlsx`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
