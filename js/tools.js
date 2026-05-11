// M3 — Tool Registration
import { db } from "./config.js";
import { collection, getDocs, doc, addDoc, updateDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { t } from "./i18n.js";

let allTools = [];
let filterStatusVal = "";
let searchVal = "";
let editingId = null;

export async function init() {
  window.CVS_Tools = { openCreate, openEdit, closeModal, save, search, filterStatus, autoCalcNext };
  // Hide add/edit for non-admin roles
  const role = window.CVS?.role;
  const canEdit = role === "admin";
  const addBtn = document.getElementById("btn-add-tool");
  if (addBtn) addBtn.classList.toggle("hidden", !canEdit);
  await loadTools();
}

async function loadTools() {
  const snap = await getDocs(collection(db, "tools"));
  allTools = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  applyAutoStatus();
  renderTable();
}

function applyAutoStatus() {
  const today = new Date(); today.setHours(0,0,0,0);
  allTools.forEach(tool => {
    if (tool.status === "in_repair" || tool.status === "retired") return;
    if (!tool.nextCalDate) return;
    const next = new Date(tool.nextCalDate);
    const diff = Math.ceil((next - today) / 86400000);
    if (diff > 30)      tool._dynStatus = "active";
    else if (diff >= 1) tool._dynStatus = "due_soon";
    else                tool._dynStatus = "overdue";
  });
}

function statusBadge(tool) {
  const s = tool._dynStatus || tool.status;
  const map = {
    active:    ["badge-success", "statusActive"],
    due_soon:  ["badge-warning", "statusDueSoon"],
    overdue:   ["badge-danger",  "statusOverdue"],
    in_repair: ["badge-muted",   "statusInRepair"],
    retired:   ["badge-muted",   "statusRetired"],
  };
  const [cls, key] = map[s] || ["badge-muted", "statusActive"];
  return `<span class="badge ${cls}">${t(key)}</span>`;
}

function renderTable() {
  const tbody = document.getElementById("tool-tbody");
  if (!tbody) return;
  const role = window.CVS?.role;
  const canEdit = role === "admin";

  let list = allTools;
  if (filterStatusVal) list = list.filter(t => (t._dynStatus || t.status) === filterStatusVal);
  if (searchVal) {
    const q = searchVal.toLowerCase();
    list = list.filter(t =>
      (t.code||"").toLowerCase().includes(q) ||
      (t.name||"").toLowerCase().includes(q) ||
      (t.serialNo||"").toLowerCase().includes(q)
    );
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">${t("noData")}</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(tool => `<tr>
    <td><code>${tool.code||"-"}</code></td>
    <td><strong>${tool.name||"-"}</strong></td>
    <td>${t("type"+cap(tool.type))||tool.type||"-"}</td>
    <td><code>${tool.serialNo||"-"}</code></td>
    <td class="text-center">${tool.tolerance||"-"}%</td>
    <td>${tool.nextCalDate||"-"}</td>
    <td>${statusBadge(tool)}</td>
    <td>${tool.location||"-"}</td>
    <td>${canEdit
      ? `<button class="btn btn-ghost btn-sm" onclick="window.CVS_Tools.openEdit('${tool.id}')">✏️ ${t("edit")}</button>`
      : "-"}</td>
  </tr>`).join("");
}

function search(v) { searchVal = v; renderTable(); }
function filterStatus(v) { filterStatusVal = v; renderTable(); }

function autoCalcNext() {
  const lastCal  = document.getElementById("tool-lastcal")?.value;
  const interval = parseInt(document.getElementById("tool-interval")?.value || "12");
  if (!lastCal) return;
  const d = new Date(lastCal);
  d.setMonth(d.getMonth() + interval);
  document.getElementById("tool-nextcal").value = d.toISOString().split("T")[0];
}

function openCreate() {
  editingId = null;
  ["tool-id","tool-code","tool-name","tool-model","tool-serial","tool-location","tool-lastcal","tool-nextcal"]
    .forEach(id => { const el = document.getElementById(id); if(el) el.value = ""; });
  setEl("tool-type", "length");
  setEl("tool-interval", "12");
  setEl("tool-tolerance", "");
  setEl("tool-status-select", "active");
  setEl("tool-code", ""); document.getElementById("tool-code").disabled = false;
  setText("tool-modal-title", t("toolCreateTitle"));
  document.getElementById("tool-modal").classList.add("open");
}

function openEdit(id) {
  const tool = allTools.find(t => t.id === id);
  if (!tool) return;
  editingId = id;
  document.getElementById("tool-id").value = id;
  document.getElementById("tool-code").value = tool.code||"";
  document.getElementById("tool-code").disabled = true;
  document.getElementById("tool-name").value = tool.name||"";
  document.getElementById("tool-type").value = tool.type||"length";
  document.getElementById("tool-model").value = tool.model||"";
  document.getElementById("tool-serial").value = tool.serialNo||"";
  document.getElementById("tool-tolerance").value = tool.tolerance||"";
  document.getElementById("tool-interval").value = tool.interval||"12";
  document.getElementById("tool-lastcal").value = tool.lastCalDate||"";
  document.getElementById("tool-nextcal").value = tool.nextCalDate||"";
  document.getElementById("tool-location").value = tool.location||"";
  document.getElementById("tool-status-select").value =
    (tool.status === "in_repair" || tool.status === "retired") ? tool.status : "active";
  setText("tool-modal-title", t("toolEditTitle"));
  document.getElementById("tool-modal").classList.add("open");
}

function closeModal() {
  document.getElementById("tool-modal").classList.remove("open");
  editingId = null;
}

async function save() {
  const code      = document.getElementById("tool-code").value.trim();
  const name      = document.getElementById("tool-name").value.trim();
  const type      = document.getElementById("tool-type").value;
  const model     = document.getElementById("tool-model").value.trim();
  const serialNo  = document.getElementById("tool-serial").value.trim();
  const tolerance = parseFloat(document.getElementById("tool-tolerance").value) || 0;
  const interval  = parseInt(document.getElementById("tool-interval").value) || 12;
  const lastCalDate = document.getElementById("tool-lastcal").value;
  const nextCalDate = document.getElementById("tool-nextcal").value;
  const location  = document.getElementById("tool-location").value.trim();
  const status    = document.getElementById("tool-status-select").value;

  if (!name || !serialNo) { showToast(t("errRequired"), "warning"); return; }
  if (!editingId && !code) { showToast(t("errRequired"), "warning"); return; }

  const data = { name, type, model, serialNo, tolerance, interval, lastCalDate, nextCalDate, location, status };

  try {
    if (!editingId) {
      data.code = code;
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "tools"), data);
    } else {
      await updateDoc(doc(db, "tools", editingId), data);
    }
    showToast(t("toolSaved"), "success");
    closeModal();
    await loadTools();
  } catch (err) {
    showToast(err.message || t("errSave"), "error");
  }
}

// helpers
function cap(s) { return s ? s.charAt(0).toUpperCase()+s.slice(1) : ""; }
function setEl(id, v) { const e = document.getElementById(id); if(e) e.value = v; }
function setText(id, v) { const e = document.getElementById(id); if(e) e.textContent = v; }
