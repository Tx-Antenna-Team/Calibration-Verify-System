// M7 — Reports & Certificate Export
import { db } from "./config.js";
import { collection, getDocs, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { t } from "./i18n.js";

let allResults = [], allTools = [], allCycles = [], allUsers = [];
let filtered = [];
let chartPass = null, chartError = null;

export async function init() {
  window.CVS_Reports = { applyFilter, toggleAll, exportSelected, print: printReport, exportSingle, deleteResult, renderCharts };

  const [rs, ts, cs, us] = await Promise.all([
    getDocs(collection(db, "testResults")),
    getDocs(collection(db, "tools")),
    getDocs(collection(db, "cycles")),
    getDocs(collection(db, "users")),
  ]);
  allResults = rs.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.status === "approved");
  allTools   = ts.docs.map(d => ({ id: d.id, ...d.data() }));
  allCycles  = cs.docs.map(d => ({ id: d.id, ...d.data() }));
  allUsers   = us.docs.map(d => ({ id: d.id, ...d.data() }));

  buildCycleFilter();
  filtered = [...allResults];
  renderTable();
  updateStats();

  await loadChartJS();
  buildTrendToolDropdown();
  renderCharts();
}

async function loadChartJS() {
  if (window.Chart) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function buildCycleFilter() {
  const sel = document.getElementById("filter-cycle");
  if (!sel) return;
  sel.innerHTML = `<option value="">${t("reportFilterCycle")}</option>` +
    allCycles.map(c => `<option value="${c.id}">${c.code} — ${c.name}</option>`).join("");
}

function applyFilter() {
  const cycleId = document.getElementById("filter-cycle")?.value || "";
  const from    = document.getElementById("filter-from")?.value || "";
  const to      = document.getElementById("filter-to")?.value || "";
  const result  = document.getElementById("filter-result")?.value || "";
  const search  = (document.getElementById("filter-search")?.value || "").toLowerCase();

  filtered = allResults.filter(r => {
    if (cycleId && r.cycleId !== cycleId) return false;
    if (from && r.testDate < from) return false;
    if (to   && r.testDate > to)   return false;
    if (result === "pass" && !r.overallPass) return false;
    if (result === "fail" && r.overallPass)  return false;
    if (search) {
      const tool = allTools.find(t => t.id === r.toolId);
      const txt  = `${tool?.code||""} ${tool?.name||""} ${r.certNo||""} ${r.testDate||""}`.toLowerCase();
      if (!txt.includes(search)) return false;
    }
    return true;
  });

  renderTable();
  updateStats();
  buildTrendToolDropdown();
  renderCharts();
}

function updateStats() {
  const pass = filtered.filter(r => r.overallPass).length;
  const fail = filtered.length - pass;
  const rate = filtered.length ? Math.round((pass / filtered.length) * 100) : 0;
  setText("stat-total", filtered.length);
  setText("stat-pass",  pass);
  setText("stat-fail",  fail);
  setText("stat-rate",  rate + "%");
}

function renderTable() {
  const tbody = document.getElementById("report-tbody");
  if (!tbody) return;
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">${t("noData")}</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(r => {
    const tool  = allTools.find(t => t.id === r.toolId);
    const cycle = allCycles.find(c => c.id === r.cycleId);
    const tech  = allUsers.find(u => u.id === r.technicianId);
    const cls   = r.overallPass ? "badge-success" : "badge-danger";
    const lbl   = r.overallPass ? t("calPass") : t("calFail");
    return `<tr>
      <td><input type="checkbox" class="row-chk" value="${r.id}" style="accent-color:var(--primary);" /></td>
      <td><code style="font-size:11px;">${r.certNo||"-"}</code></td>
      <td><strong>${tool?.name||r.toolId}</strong><br><span style="font-size:11px;color:var(--text-muted);">${tool?.code||""}</span></td>
      <td>${cycle?.code||r.cycleId||"-"}</td>
      <td>${tech?.employeeId||""} ${tech?.name||r.technicianId||"-"}</td>
      <td>${r.testDate||"-"}</td>
      <td class="text-center">${r.tolerance||"-"}%</td>
      <td><span class="badge ${cls}">${lbl}</span></td>
      <td style="white-space:nowrap;">
        <button class="btn btn-ghost btn-sm" onclick="window.CVS_Reports.exportSingle('${r.id}')">📄 PDF</button>
        ${window.CVS?.role === "admin"
          ? `<button class="btn btn-danger btn-sm" onclick="window.CVS_Reports.deleteResult('${r.id}','${(r.certNo||"-").replace(/'/g,"\\'")}')">🗑️</button>`
          : ""}
      </td>
    </tr>`;
  }).join("");
}

function toggleAll(checked) {
  document.querySelectorAll(".row-chk").forEach(cb => cb.checked = checked);
}

// ── jsPDF Certificate ──
async function loadJsPDF() {
  if (window.jspdf) return window.jspdf.jsPDF;
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
  return window.jspdf.jsPDF;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function exportSingle(resultId) {
  const r = allResults.find(x => x.id === resultId);
  if (!r) return;
  await generateCertificate(r);
}

async function exportSelected() {
  const ids = [...document.querySelectorAll(".row-chk:checked")].map(cb => cb.value);
  if (ids.length === 0) { showToast("กรุณาเลือกรายการก่อน", "warning"); return; }
  for (const id of ids) {
    const r = allResults.find(x => x.id === id);
    if (r) await generateCertificate(r);
  }
}

async function generateCertificate(r) {
  const JsPDF = await loadJsPDF();
  const tool  = allTools.find(t => t.id === r.toolId);
  const cycle = allCycles.find(c => c.id === r.cycleId);
  const tech  = allUsers.find(u => u.id === r.technicianId);
  const sup   = allUsers.find(u => u.id === r.supervisorId);

  const pdf = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, PX = 15;
  let y = 0;

  // ── Header band ──
  pdf.setFillColor(26, 39, 68);
  pdf.rect(0, 0, W, 28, "F");
  pdf.setTextColor(240, 224, 64);
  pdf.setFontSize(20); pdf.setFont("helvetica", "bold");
  pdf.text("CVS", PX, 13);
  pdf.setFontSize(9); pdf.setFont("helvetica", "normal");
  pdf.setTextColor(180, 200, 230);
  pdf.text("Calibration Verification System", PX, 20);
  pdf.setFontSize(14); pdf.setFont("helvetica", "bold");
  pdf.setTextColor(255, 255, 255);
  pdf.text("CALIBRATION CERTIFICATE", W / 2, 17, { align: "center" });
  y = 36;

  // ── Cert info ──
  pdf.setFontSize(9); pdf.setFont("helvetica", "normal"); pdf.setTextColor(80, 80, 80);
  pdf.text(`Certificate No: ${r.certNo || "-"}`, PX, y);
  pdf.text(`Issue Date: ${new Date().toLocaleDateString("th-TH")}`, W - PX, y, { align: "right" });
  y += 8;

  // ── Tool info box ──
  pdf.setFillColor(240, 244, 255);
  pdf.roundedRect(PX, y, W - PX * 2, 28, 2, 2, "F");
  pdf.setFontSize(10); pdf.setFont("helvetica", "bold"); pdf.setTextColor(30, 45, 74);
  pdf.text("TOOL INFORMATION", PX + 4, y + 7);
  pdf.setFontSize(9); pdf.setFont("helvetica", "normal"); pdf.setTextColor(60, 60, 60);
  const col2 = W / 2 + 5;
  pdf.text(`Tool Code : ${tool?.code || "-"}`,   PX + 4, y + 14);
  pdf.text(`Tool Name : ${tool?.name || "-"}`,   PX + 4, y + 20);
  pdf.text(`Type      : ${tool?.type || "-"}`,   col2,   y + 14);
  pdf.text(`Serial No : ${tool?.serialNo || "-"}`, col2,  y + 20);
  y += 34;

  // ── Test details ──
  pdf.setFontSize(10); pdf.setFont("helvetica", "bold"); pdf.setTextColor(30, 45, 74);
  pdf.text("TEST DETAILS", PX, y + 6);
  pdf.setFontSize(9); pdf.setFont("helvetica", "normal"); pdf.setTextColor(60, 60, 60);
  y += 10;
  pdf.text(`Test Date      : ${r.testDate || "-"}`,          PX, y);
  pdf.text(`Ref. Standard  : ${r.refStandard || "-"}`,       col2, y); y += 6;
  pdf.text(`Technician     : ${tech?.employeeId||""} ${tech?.name || "-"}`, PX, y);
  pdf.text(`Environment    : ${r.environment || "-"}`,        col2, y); y += 6;
  pdf.text(`Tolerance      : ${r.tolerance || "-"} %`,        PX, y);
  pdf.text(`Cycle          : ${cycle?.code || "-"}`,          col2, y);
  y += 10;

  // ── 5-Point table ──
  pdf.setFontSize(10); pdf.setFont("helvetica", "bold"); pdf.setTextColor(30, 45, 74);
  pdf.text("MEASUREMENT DATA", PX, y); y += 4;

  const tableBody = (r.points || []).map((pt, i) => [
    i + 1,
    (pt.ref ?? "-").toString(),
    (pt.measured ?? "-").toString(),
    (pt.error ?? 0).toFixed(4),
    (pt.pctError ?? 0).toFixed(4) + "%",
    pt.pass ? "PASS" : "FAIL",
  ]);

  pdf.autoTable({
    startY: y,
    head: [["Point", "Reference", "Measured", "Error", "% Error", "Result"]],
    body: tableBody,
    theme: "grid",
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [40, 40, 40] },
    columnStyles: { 5: { fontStyle: "bold" } },
    didDrawCell(data) {
      if (data.section === "body" && data.column.index === 5) {
        const val = data.cell.raw;
        data.cell.styles.textColor = val === "PASS" ? [34, 197, 94] : [239, 68, 68];
      }
    },
    margin: { left: PX, right: PX },
  });

  y = pdf.lastAutoTable.finalY + 8;

  // ── Overall result banner ──
  const pass = r.overallPass;
  pdf.setFillColor(...(pass ? [34, 197, 94] : [239, 68, 68]));
  pdf.roundedRect(PX, y, W - PX * 2, 14, 2, 2, "F");
  pdf.setFontSize(13); pdf.setFont("helvetica", "bold"); pdf.setTextColor(255, 255, 255);
  pdf.text(`OVERALL RESULT: ${pass ? "PASS" : "FAIL"}`, W / 2, y + 9.5, { align: "center" });
  y += 22;

  // ── Signatures ──
  pdf.setFontSize(9); pdf.setFont("helvetica", "normal"); pdf.setTextColor(80, 80, 80);
  const sigW = (W - PX * 2) / 2 - 5;
  // Left sig
  pdf.line(PX, y + 14, PX + sigW, y + 14);
  pdf.text("Technician", PX + sigW / 2, y + 19, { align: "center" });
  pdf.text(tech?.name || "-", PX + sigW / 2, y + 24, { align: "center" });
  // Right sig
  const sigX2 = W / 2 + 5;
  pdf.line(sigX2, y + 14, sigX2 + sigW, y + 14);
  pdf.text("Supervisor / Approver", sigX2 + sigW / 2, y + 19, { align: "center" });
  pdf.text(sup?.name || "-", sigX2 + sigW / 2, y + 24, { align: "center" });

  // ── Footer ──
  pdf.setFontSize(8); pdf.setTextColor(150, 150, 150);
  pdf.text("Generated by CVS — Calibration Verification System", W / 2, 290, { align: "center" });

  pdf.save(`${r.certNo || "certificate"}.pdf`);
  showToast(`ดาวน์โหลด ${r.certNo || "certificate"}.pdf`, "success");
}

// ── Print Report ──
function printReport() {
  const printEl = document.getElementById("print-area");
  if (!printEl) return;

  const rows = filtered.map(r => {
    const tool  = allTools.find(t => t.id === r.toolId);
    const cycle = allCycles.find(c => c.id === r.cycleId);
    const tech  = allUsers.find(u => u.id === r.technicianId);
    return `<tr>
      <td>${r.certNo||"-"}</td>
      <td>${tool?.code||"-"} ${tool?.name||""}</td>
      <td>${cycle?.code||"-"}</td>
      <td>${tech?.name||"-"}</td>
      <td>${r.testDate||"-"}</td>
      <td>${r.tolerance||"-"}%</td>
      <td style="color:${r.overallPass?"#16a34a":"#dc2626"};font-weight:bold;">${r.overallPass?"PASS":"FAIL"}</td>
    </tr>`;
  }).join("");

  const pass = filtered.filter(r => r.overallPass).length;
  const rate = filtered.length ? Math.round(pass / filtered.length * 100) : 0;

  printEl.innerHTML = `
    <style>
      @media print {
        body > *:not(#print-area) { display:none!important; }
        #print-area { display:block!important; font-family:sans-serif; color:#000; }
        table { width:100%; border-collapse:collapse; font-size:11px; }
        th, td { border:1px solid #ccc; padding:5px 8px; }
        th { background:#1a2744; color:#fff; }
        .summary { margin:12px 0; font-size:13px; }
      }
    </style>
    <h2 style="text-align:center;">CVS — Calibration Report</h2>
    <p style="text-align:center;font-size:12px;color:#666;">Generated: ${new Date().toLocaleString("th-TH")}</p>
    <div class="summary">
      Total: <strong>${filtered.length}</strong> &nbsp;|&nbsp;
      Pass: <strong style="color:#16a34a;">${pass}</strong> &nbsp;|&nbsp;
      Fail: <strong style="color:#dc2626;">${filtered.length - pass}</strong> &nbsp;|&nbsp;
      Pass Rate: <strong>${rate}%</strong>
    </div>
    <table>
      <thead><tr>
        <th>Cert No.</th><th>Tool</th><th>Cycle</th><th>Technician</th>
        <th>Test Date</th><th>Tolerance</th><th>Result</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="7" style="text-align:center;">No data</td></tr>`}</tbody>
    </table>`;

  window.print();
}

async function deleteResult(id, certNo) {
  if (!confirm(`ลบรายงาน "${certNo}" ใช่หรือไม่?\nข้อมูลจะถูกลบถาวร`)) return;
  try {
    await deleteDoc(doc(db, "testResults", id));
    showToast("ลบรายงานเรียบร้อย", "success");
    allResults = allResults.filter(r => r.id !== id);
    filtered   = filtered.filter(r => r.id !== id);
    renderTable();
    updateStats();
  } catch (err) {
    showToast(err.message || t("errSave"), "error");
  }
}

// ── Trends & Forecast ──

function buildTrendToolDropdown() {
  const sel = document.getElementById("trend-tool");
  if (!sel) return;
  const prev = sel.value;
  const toolIds = [...new Set(filtered.map(r => r.toolId).filter(Boolean))];
  const opts = toolIds
    .map(id => allTools.find(t => t.id === id))
    .filter(Boolean)
    .sort((a, b) => (a.code || "").localeCompare(b.code || ""));
  sel.innerHTML = `<option value="">${t("reportTrendAllTools")}</option>` +
    opts.map(o => `<option value="${o.id}">${o.code || ""} — ${o.name || ""}</option>`).join("");
  if (prev && opts.find(o => o.id === prev)) sel.value = prev;
}

function bucketKey(dateStr, bucket) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const y = d.getFullYear();
  const m = d.getMonth();
  if (bucket === "month") {
    return `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  if (bucket === "quarter") {
    return `${y}-Q${Math.floor(m / 3) + 1}`;
  }
  // ISO week
  const tmp = new Date(Date.UTC(y, m, d.getDate()));
  const dow = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function nextBucketKey(lastKey, bucket) {
  if (bucket === "month") {
    const [y, m] = lastKey.split("-").map(Number);
    const d = new Date(y, m, 1); // m is 1..12, this gives next month
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  if (bucket === "quarter") {
    const [yStr, qStr] = lastKey.split("-Q");
    let y = +yStr, q = +qStr + 1;
    if (q > 4) { q = 1; y++; }
    return `${y}-Q${q}`;
  }
  // week
  const [yStr, wStr] = lastKey.split("-W");
  let y = +yStr, w = +wStr + 1;
  // 52 or 53 weeks — assume 52, edge cases acceptable for forecast labels
  if (w > 52) { w = 1; y++; }
  return `${y}-W${String(w).padStart(2, "0")}`;
}

function linearRegression(points) {
  const n = points.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const p of points) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  let ss = 0;
  for (const p of points) { const yhat = slope * p.x + intercept; ss += (p.y - yhat) ** 2; }
  const se = n > 2 ? Math.sqrt(ss / (n - 2)) : 0;
  return { slope, intercept, se, n };
}

function aggregateTrend() {
  const bucket = document.getElementById("trend-bucket")?.value || "month";
  const toolId = document.getElementById("trend-tool")?.value || "";

  const subset = toolId ? filtered.filter(r => r.toolId === toolId) : filtered;
  const buckets = new Map(); // key -> { pass, total, errSum, errN }

  for (const r of subset) {
    const key = bucketKey(r.testDate, bucket);
    if (!key) continue;
    if (!buckets.has(key)) buckets.set(key, { pass: 0, total: 0, errSum: 0, errN: 0 });
    const b = buckets.get(key);
    b.total += 1;
    if (r.overallPass) b.pass += 1;
    for (const p of (r.points || [])) {
      if (typeof p.pctError === "number" && !isNaN(p.pctError)) {
        b.errSum += Math.abs(p.pctError);
        b.errN += 1;
      }
    }
  }

  const keys = [...buckets.keys()].sort();
  const passRate = keys.map(k => buckets.get(k).total ? (buckets.get(k).pass / buckets.get(k).total) * 100 : 0);
  const avgErr = keys.map(k => buckets.get(k).errN ? buckets.get(k).errSum / buckets.get(k).errN : 0);
  return { bucket, toolId, keys, passRate, avgErr, counts: keys.map(k => buckets.get(k).total) };
}

function renderCharts() {
  if (!window.Chart) return;
  const emptyEl = document.getElementById("trend-empty");
  const chartsEl = document.getElementById("trend-charts");
  const summaryEl = document.getElementById("forecast-summary");
  if (!emptyEl || !chartsEl || !summaryEl) return;

  const data = aggregateTrend();
  if (data.keys.length < 2) {
    emptyEl.classList.remove("hidden");
    chartsEl.style.display = "none";
    summaryEl.innerHTML = "";
    if (chartPass) { chartPass.destroy(); chartPass = null; }
    if (chartError) { chartError.destroy(); chartError = null; }
    return;
  }
  emptyEl.classList.add("hidden");
  chartsEl.style.display = "grid";

  const horizon = parseInt(document.getElementById("trend-forecast")?.value || "3", 10);

  const passPts  = data.passRate.map((y, i) => ({ x: i, y }));
  const errPts   = data.avgErr.map((y, i) => ({ x: i, y }));
  const passReg  = linearRegression(passPts);
  const errReg   = linearRegression(errPts);

  // Build forecast keys + values
  const allLabels = [...data.keys];
  const futureLabels = [];
  let last = data.keys[data.keys.length - 1];
  for (let i = 0; i < horizon; i++) {
    last = nextBucketKey(last, data.bucket);
    futureLabels.push(last);
  }

  const forecastPass = passReg
    ? futureLabels.map((_, i) => {
        const x = data.keys.length + i;
        const y = passReg.slope * x + passReg.intercept;
        return Math.max(0, Math.min(100, y));
      })
    : [];
  const forecastErr = errReg
    ? futureLabels.map((_, i) => {
        const x = data.keys.length + i;
        const y = errReg.slope * x + errReg.intercept;
        return Math.max(0, y);
      })
    : [];

  const combinedLabels = horizon > 0 ? [...allLabels, ...futureLabels] : allLabels;

  // Tolerance reference line (only when single tool selected)
  let tolRef = null;
  if (data.toolId) {
    const tool = allTools.find(t => t.id === data.toolId);
    if (tool?.tolerance) tolRef = Number(tool.tolerance);
  }

  renderPassRateChart(combinedLabels, data.passRate, forecastPass, horizon);
  renderErrorChart(combinedLabels, data.avgErr, forecastErr, horizon, tolRef);
  renderForecastSummary(data, passReg, errReg, horizon, futureLabels, forecastPass, forecastErr, tolRef);
}

function renderPassRateChart(labels, history, forecast, horizon) {
  const ctx = document.getElementById("chart-passrate");
  if (!ctx) return;
  if (chartPass) chartPass.destroy();

  // Build padded arrays so history and forecast align as separate datasets
  const histData = [...history, ...new Array(horizon).fill(null)];
  // bridge point so forecast line connects to history
  const fcData = horizon > 0
    ? [...new Array(history.length - 1).fill(null), history[history.length - 1], ...forecast]
    : [];

  chartPass = new window.Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: t("reportTrendPassRate"),
          data: histData,
          borderColor: "#22c55e",
          backgroundColor: "rgba(34,197,94,0.15)",
          tension: 0.25,
          fill: true,
          pointRadius: 3,
        },
        ...(horizon > 0 ? [{
          label: t("reportTrendForecast"),
          data: fcData,
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245,158,11,0.10)",
          borderDash: [6, 4],
          tension: 0.15,
          pointRadius: 3,
          pointStyle: "triangle",
          fill: false,
        }] : []),
      ],
    },
    options: chartOptions({ yMax: 100, yLabel: "%", yMin: 0 }),
  });
}

function renderErrorChart(labels, history, forecast, horizon, tolRef) {
  const ctx = document.getElementById("chart-error");
  if (!ctx) return;
  if (chartError) chartError.destroy();

  const histData = [...history, ...new Array(horizon).fill(null)];
  const fcData = horizon > 0
    ? [...new Array(history.length - 1).fill(null), history[history.length - 1], ...forecast]
    : [];

  const datasets = [
    {
      label: t("reportTrendError"),
      data: histData,
      borderColor: "#38bdf8",
      backgroundColor: "rgba(56,189,248,0.15)",
      tension: 0.25,
      fill: true,
      pointRadius: 3,
    },
  ];
  if (horizon > 0) {
    datasets.push({
      label: t("reportTrendForecast"),
      data: fcData,
      borderColor: "#f59e0b",
      backgroundColor: "rgba(245,158,11,0.10)",
      borderDash: [6, 4],
      tension: 0.15,
      pointRadius: 3,
      pointStyle: "triangle",
      fill: false,
    });
  }
  if (tolRef && tolRef > 0) {
    datasets.push({
      label: `${t("calTolerance")} (${tolRef}%)`,
      data: new Array(labels.length).fill(tolRef),
      borderColor: "#ef4444",
      borderDash: [4, 4],
      borderWidth: 1.5,
      pointRadius: 0,
      fill: false,
    });
  }

  chartError = new window.Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: chartOptions({ yLabel: "%", yMin: 0 }),
  });
}

function chartOptions({ yMax, yMin, yLabel } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { labels: { color: "#cbd5e1", font: { size: 11 } } },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y == null ? "-" : ctx.parsed.y.toFixed(2)}${yLabel || ""}`,
        },
      },
    },
    scales: {
      x: { ticks: { color: "#94a3b8", font: { size: 10 } }, grid: { color: "rgba(148,163,184,0.1)" } },
      y: {
        min: yMin,
        max: yMax,
        ticks: { color: "#94a3b8", font: { size: 10 }, callback: v => `${v}${yLabel || ""}` },
        grid: { color: "rgba(148,163,184,0.1)" },
      },
    },
  };
}

function renderForecastSummary(data, passReg, errReg, horizon, futureLabels, fcPass, fcErr, tolRef) {
  const el = document.getElementById("forecast-summary");
  if (!el) return;
  const lines = [];

  lines.push(`📅 ${t("reportTrendDataRange")}: <strong>${data.keys[0]} → ${data.keys[data.keys.length - 1]}</strong> · ${t("reportTrendBuckets")}: <strong>${data.keys.length}</strong> · ${t("reportTotal")}: <strong>${data.counts.reduce((a,b)=>a+b,0)}</strong>`);

  if (passReg) {
    const dir = passReg.slope > 0.1 ? `↗️ ${t("reportTrendImproving")}` : passReg.slope < -0.1 ? `↘️ ${t("reportTrendDeclining")}` : `→ ${t("reportTrendStable")}`;
    lines.push(`✅ ${t("reportTrendPassRate")}: ${dir} (slope ${passReg.slope.toFixed(2)}%/period, ±${passReg.se.toFixed(2)})`);
  }
  if (errReg) {
    const dir = errReg.slope > 0.005 ? `↗️ ${t("reportTrendWorsening")}` : errReg.slope < -0.005 ? `↘️ ${t("reportTrendImproving")}` : `→ ${t("reportTrendStable")}`;
    lines.push(`📏 ${t("reportTrendError")}: ${dir} (slope ${errReg.slope.toFixed(4)}%/period, ±${errReg.se.toFixed(4)})`);
  }
  if (horizon > 0 && fcPass.length && fcErr.length) {
    lines.push(`🔮 ${t("reportTrendNext")} (${futureLabels[futureLabels.length - 1]}): ${t("reportTrendPassRate")} ≈ <strong>${fcPass[fcPass.length - 1].toFixed(1)}%</strong> · ${t("reportTrendError")} ≈ <strong>${fcErr[fcErr.length - 1].toFixed(3)}%</strong>`);
    if (tolRef && errReg && errReg.slope > 0) {
      // Estimate when forecast crosses tolerance
      const x = (tolRef - errReg.intercept) / errReg.slope;
      const periodsAhead = x - (data.keys.length - 1);
      if (periodsAhead > 0 && periodsAhead < 60) {
        lines.push(`⚠️ <span style="color:var(--warning);">${t("reportTrendCrossTol")}: ${periodsAhead.toFixed(1)} ${t("reportTrendPeriods")}</span>`);
      }
    }
  }
  if (data.keys.length < 4) {
    lines.push(`<span style="color:var(--warning);">⚠️ ${t("reportTrendWarnFew")}</span>`);
  }

  el.innerHTML = lines.join("<br>");
}

function setText(id, v) { const e = document.getElementById(id); if(e) e.textContent = v; }
