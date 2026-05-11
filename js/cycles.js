// M4 — Test Cycle Management
import { db } from "./config.js";
import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, query, where }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { t } from "./i18n.js";

let allCycles = [], allTools = [], allUsers = [], allResults = [];
let editingId = null;

export async function init() {
  window.CVS_Cycles = { openCreate, openEdit, closeModal, save, addDueTools, deleteCycle };
  const role = window.CVS?.role;
  const canEdit = role === "admin";
  const addBtn = document.getElementById("btn-add-cycle");
  if (addBtn) addBtn.classList.toggle("hidden", !canEdit);

  const [cs, ts, us, rs] = await Promise.all([
    getDocs(collection(db, "cycles")),
    getDocs(collection(db, "tools")),
    getDocs(collection(db, "users")),
    getDocs(collection(db, "testResults")),
  ]);
  allCycles = cs.docs.map(d => ({ id: d.id, ...d.data() }));
  allTools  = ts.docs.map(d => ({ id: d.id, ...d.data() }));
  allUsers  = us.docs.map(d => ({ id: d.id, ...d.data() }));
  allResults = rs.docs.map(d => ({ id: d.id, ...d.data() }));

  applyAutoToolStatus();
  renderTable();
}

function applyAutoToolStatus() {
  const today = new Date(); today.setHours(0,0,0,0);
  allTools.forEach(tool => {
    if (tool.status === "in_repair" || tool.status === "retired") return;
    if (!tool.nextCalDate) return;
    const diff = Math.ceil((new Date(tool.nextCalDate) - today) / 86400000);
    tool._dynStatus = diff > 30 ? "active" : diff >= 1 ? "due_soon" : "overdue";
  });
}

function renderTable() {
  const tbody = document.getElementById("cycle-tbody");
  if (!tbody) return;
  const role = window.CVS?.role;
  const canEdit = role === "admin";
  const userMap = {};
  allUsers.forEach(u => userMap[u.id] = u);
  const toolMap = {};
  allTools.forEach(tool => toolMap[tool.id] = tool);

  if (allCycles.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">${t("noData")}</td></tr>`;
    return;
  }

  tbody.innerHTML = allCycles.map(cycle => {
    const tech = userMap[cycle.technicianId];
    const toolIds = cycle.toolIds || [];
    const approved = allResults.filter(r => r.cycleId === cycle.id && r.status === "approved").length;
    const pct = toolIds.length ? Math.round((approved / toolIds.length) * 100) : 0;
    const barCls = pct === 100 ? "success" : pct > 50 ? "" : "warning";
    const sCls = { planned:"badge-info", in_progress:"badge-warning", completed:"badge-success", cancelled:"badge-muted" }[cycle.status] || "badge-muted";
    const sLbl = { planned:t("cyclePlanned"), in_progress:t("cycleInProgress"), completed:t("cycleCompleted"), cancelled:t("cycleCancelled") }[cycle.status] || cycle.status;

    return `<tr>
      <td><code>${cycle.code||"-"}</code></td>
      <td><strong>${cycle.name||"-"}</strong></td>
      <td>${cycle.startDate||"-"}</td>
      <td>${cycle.dueDate||"-"}</td>
      <td>${tech?.name || cycle.technicianId || "-"}</td>
      <td class="text-center">${toolIds.length}</td>
      <td style="min-width:120px;">
        <div class="d-flex align-center gap-8">
          <div class="progress-wrap" style="flex:1;">
            <div class="progress-bar ${barCls}" style="width:${pct}%"></div>
          </div>
          <span style="font-size:12px;width:36px;text-align:right;">${pct}%</span>
        </div>
      </td>
      <td><span class="badge ${sCls}">${sLbl}</span></td>
      <td>${canEdit ? `
        <button class="btn btn-ghost btn-sm" onclick="window.CVS_Cycles.openEdit('${cycle.id}')">✏️ ${t("edit")}</button>
        <button class="btn btn-danger btn-sm" onclick="window.CVS_Cycles.deleteCycle('${cycle.id}','${(cycle.name||cycle.code||"").replace(/'/g,"\\'")}')">🗑️ ${t("delete")}</button>
      ` : "-"}</td>
    </tr>`;
  }).join("");
}

function buildToolChecklist(selectedIds = []) {
  const el = document.getElementById("tool-checklist");
  if (!el) return;
  const today = new Date(); today.setHours(0,0,0,0);
  el.innerHTML = allTools.map(tool => {
    const checked = selectedIds.includes(tool.id) ? "checked" : "";
    const s = tool._dynStatus || tool.status;
    const badge = s === "overdue" ? "badge-danger" : s === "due_soon" ? "badge-warning" : "badge-muted";
    const lbl   = s === "overdue" ? t("statusOverdue") : s === "due_soon" ? t("statusDueSoon") : t("statusActive");
    return `<label style="display:flex;align-items:center;gap:10px;padding:7px 4px;border-bottom:1px solid var(--border);cursor:pointer;">
      <input type="checkbox" value="${tool.id}" ${checked} style="width:16px;height:16px;accent-color:var(--primary);" />
      <span style="flex:1;"><strong>${tool.code||"-"}</strong> ${tool.name||""}</span>
      <span class="badge ${badge}" style="font-size:10px;">${lbl}</span>
    </label>`;
  }).join("");
}

function addDueTools() {
  document.querySelectorAll("#tool-checklist input[type=checkbox]").forEach(cb => {
    const tool = allTools.find(t => t.id === cb.value);
    if (tool && (tool._dynStatus === "overdue" || tool._dynStatus === "due_soon")) cb.checked = true;
  });
}

function openCreate() {
  editingId = null;
  ["cycle-id","cycle-code","cycle-name","cycle-start","cycle-due"].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = "";
  });
  document.getElementById("cycle-code").disabled = false;
  fillTechDropdown("");
  buildToolChecklist([]);
  document.getElementById("cycle-modal-title").textContent = t("cycleCreateTitle");
  document.getElementById("cycle-modal").classList.add("open");
}

function openEdit(id) {
  const cycle = allCycles.find(c => c.id === id);
  if (!cycle) return;
  editingId = id;
  document.getElementById("cycle-id").value = id;
  document.getElementById("cycle-code").value = cycle.code || "";
  document.getElementById("cycle-code").disabled = true;
  document.getElementById("cycle-name").value = cycle.name || "";
  document.getElementById("cycle-start").value = cycle.startDate || "";
  document.getElementById("cycle-due").value = cycle.dueDate || "";
  fillTechDropdown(cycle.technicianId || "");
  buildToolChecklist(cycle.toolIds || []);
  document.getElementById("cycle-modal-title").textContent = t("cycleEditTitle");
  document.getElementById("cycle-modal").classList.add("open");
}

function fillTechDropdown(selectedId) {
  const sel = document.getElementById("cycle-tech");
  if (!sel) return;
  const techs = allUsers.filter(u => u.role === "technician" || u.role === "admin");
  sel.innerHTML = `<option value="">— เลือกช่างเทคนิค —</option>` +
    techs.map(u => `<option value="${u.id}" ${u.id === selectedId ? "selected" : ""}>${u.employeeId} — ${u.name}</option>`).join("");
}

async function deleteCycle(id, name) {
  if (!confirm(`ลบรอบการทดสอบ "${name}" ใช่หรือไม่?\nผลการสอบเทียบทั้งหมดในรอบนี้จะถูกลบด้วย`)) return;
  try {
    // Delete all testResults belonging to this cycle first
    const snap = await getDocs(query(collection(db, "testResults"), where("cycleId", "==", id)));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    await deleteDoc(doc(db, "cycles", id));
    showToast("ลบรอบการทดสอบเรียบร้อย", "success");
    allCycles  = allCycles.filter(c => c.id !== id);
    allResults = allResults.filter(r => r.cycleId !== id);
    renderTable();
  } catch (err) {
    showToast(err.message || t("errSave"), "error");
  }
}

function closeModal() {
  document.getElementById("cycle-modal").classList.remove("open");
  editingId = null;
}

async function save() {
  const code        = document.getElementById("cycle-code").value.trim();
  const name        = document.getElementById("cycle-name").value.trim();
  const startDate   = document.getElementById("cycle-start").value;
  const dueDate     = document.getElementById("cycle-due").value;
  const technicianId = document.getElementById("cycle-tech").value;
  const toolIds     = [...document.querySelectorAll("#tool-checklist input:checked")].map(cb => cb.value);

  if (!name || !startDate || !dueDate) { showToast(t("errRequired"), "warning"); return; }
  if (!editingId && !code) { showToast(t("errRequired"), "warning"); return; }

  const data = { name, startDate, dueDate, technicianId, toolIds, status: "planned" };

  try {
    if (!editingId) {
      data.code = code;
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "cycles"), data);
    } else {
      const existing = allCycles.find(c => c.id === editingId);
      await updateDoc(doc(db, "cycles", editingId), { name, startDate, dueDate, technicianId, toolIds, status: existing?.status || "planned" });
    }
    showToast(t("cycleSaved"), "success");
    closeModal();
    const [cs, rs] = await Promise.all([getDocs(collection(db, "cycles")), getDocs(collection(db, "testResults"))]);
    allCycles = cs.docs.map(d => ({ id: d.id, ...d.data() }));
    allResults = rs.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTable();
  } catch (err) {
    showToast(err.message || t("errSave"), "error");
  }
}
