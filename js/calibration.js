// M5 — Calibration Testing
import { db } from "./config.js";
import { collection, getDocs, doc, addDoc, updateDoc, serverTimestamp, query, where }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { t } from "./i18n.js";

let allCycles = [], allTools = [], allUsers = [];
let selectedCycle = null, selectedTool = null;
let editingResultId = null;

export async function init() {
  window.CVS_Cal = { onCycleChange, selectTool, calculate, submit, loadRejected };

  const [cs, ts, us] = await Promise.all([
    getDocs(collection(db, "cycles")),
    getDocs(collection(db, "tools")),
    getDocs(collection(db, "users")),
  ]);
  allCycles = cs.docs.map(d => ({ id: d.id, ...d.data() }));
  allTools  = ts.docs.map(d => ({ id: d.id, ...d.data() }));
  allUsers  = us.docs.map(d => ({ id: d.id, ...d.data() }));

  buildCycleDropdown();
  buildPointRows();
  await loadRejected();
}

function buildCycleDropdown() {
  const sel = document.getElementById("cal-cycle");
  if (!sel) return;
  const uid = window.CVS?.uid;
  const role = window.CVS?.role;
  // Technician sees their assigned cycles; Admin sees all
  const visible = allCycles.filter(c =>
    (c.status === "planned" || c.status === "in_progress") &&
    (role === "admin" || c.technicianId === uid)
  );
  sel.innerHTML = `<option value="">— เลือกรอบ —</option>` +
    visible.map(c => `<option value="${c.id}">${c.code} — ${c.name}</option>`).join("");
}

function onCycleChange() {
  const id = document.getElementById("cal-cycle").value;
  selectedCycle = allCycles.find(c => c.id === id) || null;
  selectedTool = null;
  document.getElementById("test-form-panel").classList.add("hidden");
  renderToolList();
}

function renderToolList() {
  const panel = document.getElementById("tool-list-panel");
  if (!panel) return;
  if (!selectedCycle) { panel.innerHTML = `<div class="text-muted" style="padding:8px;">${t("calSelectCycle")}</div>`; return; }
  const toolIds = selectedCycle.toolIds || [];
  if (toolIds.length === 0) { panel.innerHTML = `<div class="text-muted" style="padding:8px;">${t("noData")}</div>`; return; }

  panel.innerHTML = toolIds.map(tid => {
    const tool = allTools.find(t => t.id === tid);
    if (!tool) return "";
    return `<div onclick="window.CVS_Cal.selectTool('${tid}')"
      style="padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer;border-radius:var(--radius);margin-bottom:2px;"
      class="tool-list-item" id="tli-${tid}">
      <div style="font-weight:600;">${tool.code || tid}</div>
      <div style="font-size:12px;color:var(--text-muted);">${tool.name || ""}</div>
    </div>`;
  }).join("");
}

function selectTool(toolId) {
  selectedTool = allTools.find(t => t.id === toolId);
  if (!selectedTool) return;
  editingResultId = null;

  // Highlight selected
  document.querySelectorAll(".tool-list-item").forEach(el => el.style.background = "");
  const el = document.getElementById(`tli-${toolId}`);
  if (el) el.style.background = "var(--card-alt)";

  // Fill form header
  document.getElementById("form-tool-name").textContent = selectedTool.name || "-";
  document.getElementById("form-tool-code").textContent = selectedTool.code || "-";
  document.getElementById("cal-tolerance").value = selectedTool.tolerance || "";
  document.getElementById("cal-date").value = new Date().toISOString().split("T")[0];
  document.getElementById("cal-refstd").value = "";
  document.getElementById("cal-env").value = "";
  document.getElementById("cal-remarks").value = "";

  // Reset rows
  clearPoints();
  document.getElementById("test-form-panel").classList.remove("hidden");
  resetBanner();
}

function buildPointRows() {
  const tbody = document.getElementById("points-tbody");
  if (!tbody) return;
  tbody.innerHTML = [1,2,3,4,5].map(i => `<tr id="row-${i}">
    <td style="font-weight:700;">${i}</td>
    <td><input type="number" id="ref-${i}" class="form-control" step="any" oninput="window.CVS_Cal.calculate()" /></td>
    <td><input type="number" id="meas-${i}" class="form-control" step="any" oninput="window.CVS_Cal.calculate()" /></td>
    <td class="calc-cell" id="err-${i}">—</td>
    <td class="calc-cell" id="pcterr-${i}">—</td>
    <td id="res-${i}">—</td>
  </tr>`).join("");
}

function clearPoints() {
  for (let i = 1; i <= 5; i++) {
    const r = document.getElementById(`ref-${i}`);
    const m = document.getElementById(`meas-${i}`);
    if (r) r.value = "";
    if (m) m.value = "";
    setCell(`err-${i}`, "—");
    setCell(`pcterr-${i}`, "—");
    setCell(`res-${i}`, "—");
  }
}

function calculate() {
  const tol = parseFloat(document.getElementById("cal-tolerance")?.value) || 0;
  let allPass = true, anyFilled = false;

  for (let i = 1; i <= 5; i++) {
    const ref  = parseFloat(document.getElementById(`ref-${i}`)?.value);
    const meas = parseFloat(document.getElementById(`meas-${i}`)?.value);
    if (isNaN(ref) || isNaN(meas)) { setCell(`err-${i}`,"—"); setCell(`pcterr-${i}`,"—"); setCell(`res-${i}`,"—"); allPass = false; continue; }
    anyFilled = true;
    const err = meas - ref;
    const pctErr = ref !== 0 ? (Math.abs(err) / Math.abs(ref)) * 100 : 0;
    const pass = tol > 0 ? pctErr < tol : false;
    if (!pass) allPass = false;
    setCell(`err-${i}`, err.toFixed(4));
    setCell(`pcterr-${i}`, pctErr.toFixed(4) + "%");
    const row = document.getElementById(`row-${i}`);
    document.getElementById(`res-${i}`).innerHTML =
      `<span class="badge ${pass?"badge-success":"badge-danger"}">${pass?t("calPass"):t("calFail")}</span>`;
    if (row) row.style.background = pass ? "#22c55e08" : "#ef444408";
  }

  const banner = document.getElementById("overall-banner");
  if (!banner) return;
  if (!anyFilled || tol <= 0) { resetBanner(); return; }

  banner.className = `result-banner ${allPass ? "pass" : "fail"}`;
  banner.textContent = allPass ? `✅ ${t("calOverall")}: ${t("calPass")}` : `❌ ${t("calOverall")}: ${t("calFail")}`;
  return allPass;
}

function resetBanner() {
  const b = document.getElementById("overall-banner");
  if (b) { b.className = "result-banner pending"; b.setAttribute("data-i18n","calOverall"); b.textContent = t("calOverall"); }
}

async function submit() {
  if (!selectedCycle || !selectedTool) { showToast(t("errRequired"), "warning"); return; }
  const tol  = parseFloat(document.getElementById("cal-tolerance")?.value) || 0;
  const date = document.getElementById("cal-date")?.value;
  if (!date || tol <= 0) { showToast(t("errRequired") + " (วันที่ / ค่าความเผื่อ)", "warning"); return; }

  const points = [];
  let allPass = true;
  for (let i = 1; i <= 5; i++) {
    const ref  = parseFloat(document.getElementById(`ref-${i}`)?.value);
    const meas = parseFloat(document.getElementById(`meas-${i}`)?.value);
    if (isNaN(ref) || isNaN(meas)) { showToast("กรุณากรอกข้อมูลครบทั้ง 5 จุด", "warning"); return; }
    const err = meas - ref;
    const pctErr = ref !== 0 ? (Math.abs(err) / Math.abs(ref)) * 100 : 0;
    const pass = pctErr < tol;
    if (!pass) allPass = false;
    points.push({ ref, measured: meas, error: err, pctError: pctErr, pass });
  }

  const certNo = `CERT-${selectedTool.code || selectedTool.id}-${date.replace(/-/g,"")}`;
  const data = {
    cycleId: selectedCycle.id, toolId: selectedTool.id,
    technicianId: window.CVS?.uid, testDate: date,
    refStandard: document.getElementById("cal-refstd")?.value || "",
    environment: document.getElementById("cal-env")?.value || "",
    tolerance: tol, points, overallPass: allPass,
    status: "pending_supervisor",
    remarks: document.getElementById("cal-remarks")?.value || "",
    certNo, createdAt: serverTimestamp(),
  };

  try {
    if (editingResultId) {
      await updateDoc(doc(db, "testResults", editingResultId), { ...data, status: "pending_supervisor" });
    } else {
      await addDoc(collection(db, "testResults"), data);
    }
    // Move cycle to in_progress
    if (selectedCycle.status === "planned") {
      await updateDoc(doc(db, "cycles", selectedCycle.id), { status: "in_progress" });
    }
    showToast(t("calSubmitted"), "success");
    editingResultId = null;
    clearPoints(); resetBanner();
    document.getElementById("test-form-panel").classList.add("hidden");
    selectedTool = null;
    await loadRejected();
    renderToolList();
  } catch (err) {
    showToast(err.message || t("errSave"), "error");
  }
}

async function loadRejected() {
  const uid = window.CVS?.uid;
  if (!uid) return;
  const snap = await getDocs(query(collection(db, "testResults"),
    where("technicianId", "==", uid), where("status", "==", "rejected")));
  const rejected = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const panel = document.getElementById("rejected-panel");
  const list  = document.getElementById("rejected-list");
  if (!panel || !list) return;
  if (rejected.length === 0) { panel.classList.add("hidden"); return; }
  panel.classList.remove("hidden");
  list.innerHTML = rejected.map(r => {
    const tool = allTools.find(t => t.id === r.toolId);
    return `<div style="padding:8px 0;border-bottom:1px solid var(--border);">
      <div style="font-weight:600;">${tool?.name || r.toolId}</div>
      <div style="font-size:12px;color:var(--danger);">💬 ${r.rejectedReason || "-"}</div>
      <button class="btn btn-danger btn-sm" style="margin-top:6px;"
        onclick="window.CVS_Cal.loadForEdit('${r.id}')">
        ✏️ ${t("calResubmit")}
      </button>
    </div>`;
  }).join("");
}

window.CVS_Cal = window.CVS_Cal || {};
window.CVS_Cal.loadForEdit = async function(resultId) {
  const snap = await getDocs(collection(db, "testResults"));
  const result = snap.docs.map(d => ({ id: d.id, ...d.data() })).find(r => r.id === resultId);
  if (!result) return;
  editingResultId = resultId;

  // Select cycle
  const cycSel = document.getElementById("cal-cycle");
  cycSel.value = result.cycleId;
  selectedCycle = allCycles.find(c => c.id === result.cycleId);
  renderToolList();
  selectTool(result.toolId);

  // Fill points
  setTimeout(() => {
    document.getElementById("cal-date").value = result.testDate || "";
    document.getElementById("cal-tolerance").value = result.tolerance || "";
    document.getElementById("cal-refstd").value = result.refStandard || "";
    document.getElementById("cal-env").value = result.environment || "";
    document.getElementById("cal-remarks").value = result.remarks || "";
    (result.points || []).forEach((pt, i) => {
      const idx = i + 1;
      const rEl = document.getElementById(`ref-${idx}`);
      const mEl = document.getElementById(`meas-${idx}`);
      if (rEl) rEl.value = pt.ref;
      if (mEl) mEl.value = pt.measured;
    });
    calculate();
  }, 100);
};

function setCell(id, val) { const e = document.getElementById(id); if(e) e.textContent = val; }
