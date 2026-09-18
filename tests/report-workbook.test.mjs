import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { buildReportWorkbook, reportRows } from "../supervisor-report.mjs";

const require = createRequire(import.meta.url);
const ExcelJS = require(process.env.EXCELJS_PATH || "../tmp/exceljs.cjs");
const vehicle = { id: "test", model: "HONDA CRV", registrationNo: "JXE 5238",
  projectName: "PEMBINAAN BAHARU SEKOLAH MENENGAH KEBANGSAAN TANJUNG MINYAK, TANGGA BATU, MELAKA YANG MENGANDUNGI 24 BILIK DARJAH DAN LAIN-LAIN KEMUDAHAN MENGIKUT PIAWAI",
  contractNo: "JKR/TEST/2026/001", contractor: "KONTRAKTOR CONTOH SDN. BHD.",
  driverName: "NAMA PEMANDU CONTOH", driverPhone: "", supervisorName: "NAMA PENYELIA CONTOH" };
const logo = readFileSync(new URL("../jkr-report-logo.png", import.meta.url)).toString("base64");

test("workbook includes editable cover, complete monthly usage and one-page annual confirmation", async () => {
  const book = buildReportWorkbook(ExcelJS, vehicle, "2026-09", reportRows([], "test", "2026-09"), logo);
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(await book.xlsx.writeBuffer());
  assert.deepEqual(restored.worksheets.map(s => s.name), ["Muka Depan", "Rekod Penggunaan", "Pengesahan"]);
  const cover = restored.getWorksheet("Muka Depan");
  assert.equal(cover.getCell("G16").value, vehicle.projectName);
  assert.equal(cover.getCell("G20").value, vehicle.contractNo);
  assert.equal(cover.getCell("G21").value, vehicle.contractor);
  assert.equal(cover.getImages().length, 1);
  assert.equal(cover.pageSetup.fitToHeight, 1);
  assert.equal(restored.getWorksheet("Rekod Penggunaan").rowCount, 35);
  const annual = restored.getWorksheet("Pengesahan");
  assert.equal(annual.getCell("B8").value, "JANUARI / 2026");
  assert.equal(annual.getCell("B19").value, "DISEMBER / 2026");
  assert.equal(annual.pageSetup.fitToHeight, 1);
  assert.equal(annual.pageSetup.fitToWidth, 1);
  for (let row = 8; row <= 19; row++) {
    assert.equal(annual.getCell(row, 1).value, row - 7);
    for (let col = 3; col <= 5; col++) assert.ok(!annual.getCell(row, col).value);
  }
  writeFileSync(new URL("../tmp/report-preview.xlsx", import.meta.url), await book.xlsx.writeBuffer());
});

test("selected year is used, missing optional details stay blank and user text is not a formula", () => {
  const book = buildReportWorkbook(ExcelJS, { ...vehicle, contractNo: "=1+1", contractor: "" }, "2028-02", reportRows([], "test", "2028-02"), logo);
  assert.equal(book.getWorksheet("Muka Depan").getCell("G20").value, "=1+1");
  assert.equal(book.getWorksheet("Muka Depan").getCell("G21").value, "");
  assert.equal(book.getWorksheet("Pengesahan").getCell("B19").value, "DISEMBER / 2028");
  assert.equal(book.getWorksheet("Rekod Penggunaan").rowCount, 34);
  assert.throws(() => buildReportWorkbook(ExcelJS, vehicle, "2028-13", [], logo));
});
