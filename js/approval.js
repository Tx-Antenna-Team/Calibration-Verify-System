// M6 — Approval Flow (2-Level: Supervisor → Admin)
import { db } from "./config.js";
import { collection, getDocs, doc, updateDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { t } from "./i18n.js";

let allResults = [], allTools = [], allCycles = [], allUsers = [];
let currentTab = "pending";
let actionResultId = null;
let actionType = null; // "approve" | "reject"

export async function init() {
  window.CVS_Approval = { setTab, openDetail, closeModal, closeReject, confirmReject };

  const [rs, ts, cs, us] = await Promise.all([
    getDocs(collection(db, "testResults")),
    getDocs(collection(db, "tools")),
    getDocs(collection(db, "cycles")),
    getDocs(collection(db, "users")),
  ]);
  allResults = rs.docs.map(d => ({ id: d.id, ...d.data() }));
  allTools   = ts.docs.map(d => ({ id: d.id, ...d.data() }));
  allCycles  = cs.docs.map(d => ({ id: d.id, ...d.data() }));
  allUsers   = us.docs.map(d => ({ id: d.id, ...d.data() }));

  renderPending();
  renderHistory();
  updateBadge();
}

function pendingForRole() {
  const role = window.CVS?.role;
  if (role === "supervisor") return allResults.filter(r => r.status === "pending_supervisor");
  if (role === "admin")      return allResults.filter(r => r.status === "pending_admin");
  return [];
}

function updateBadge() {
  const cnt = pendingForRole().length;
  const el = document.getElementById("pending-count");
  if (el) el.textContent = cnt;
  // Also update sidebar badge
  const sb = document.getElementById("approval-badge");
  if (sb) { sb.textContent = cnt; sb.classList.toggle("hidden", cnt === 0); }
}

function setTab(tab) {
  currentTab = tab;
  document.getElementById("approval-pending-panel").classList.toggle("hidden", tab !== "pending");
  document.getElementById("approval-history-panel").classList.toggle("hidden", tab !== "history");
  document.getElementById("tab-pending").className = tab === "pending" ? "btn btn-primary" : "btn btn-ghost";
  document.getElementById("tab-history").className = tab === "history" ? "btn btn-primary" : "btn btn-ghost";
}

function toolName(id)  { return allTools.find(t => t.id === id)?.name  || id; }
function toolCode(id)  { return allTools.find(t => t.id === id)?.code  || "-"; }
function cycleName(id) { return allCycles.find(c => c.id === id)?.code || id; }
function userName(id)  { const u = allUsers.find(u => u.id === id); return u ? `${u.employeeId} — ${u.name}` : id; }

function renderPending() {
  const panel = document.getElementById("pending-cards");
  if (!panel) return;
  const list = pendingForRole();
  if (list.length === 0) {
    panel.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><p>${t("noData")}</p></div>`;
    return;
  }
  panel.innerHTML = list.map(r => {
    const resCls = r.overallPass ? "badge-success" : "badge-danger";
    const resLbl = r.overallPass ? t("calPass") : t("calFail");
    return `<div class="approval-card">
      <div class="approval-card-header">
        <div>
          <span class="badge badge-primary" style="margin-right:8px;">${toolCode(r.toolId)}</span>
          <strong>${toolName(r.toolId)}</strong>
        </div>
        <span class="badge ${resCls}">${resLbl}</span>
      </div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:10px;">
        📋 ${cycleName(r.cycleId)} &nbsp;|&nbsp; 👤 ${userName(r.technicianId)} &nbsp;|&nbsp; 📅 ${r.testDate||"-"}
      </div>
      <div class="d-flex gap-8">
        <button class="btn btn-ghost btn-sm" onclick="window.CVS_Approval.openDetail('${r.id}')">🔍 ${t("approvalViewDetail")}</button>
        <button class="btn btn-success btn-sm" onclick="window.CVS_Approval.doApprove('${r.id}')">✅ ${t("approvalApprove")}</button>
        <button class="btn btn-danger btn-sm" onclick="window.CVS_Approval.openReject('${r.id}')">↩️ ${t("approvalReject")}</button>
      </div>
    </div>`;
  }).join("");

  // Expose action handlers
  window.CVS_Approval.doApprove = doApprove;
  window.CVS_Approval.openReject = openReject;
}

function renderHistory() {
  const tbody = document.getElementById("history-tbody");
  if (!tbody) return;
  const done = allResults.filter(r => r.status === "approved" || r.status === "rejected");
  if (done.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">${t("noData")}</td></tr>`;
    return;
  }
  tbody.innerHTML = done.map(r => {
    const resCls = r.overallPass ? "badge-success" : "badge-danger";
    const sCls   = r.status === "approved" ? "badge-success" : "badge-danger";
    return `<tr>
      <td><strong>${toolName(r.toolId)}</strong></td>
      <td>${cycleName(r.cycleId)}</td>
      <td>${userName(r.technicianId)}</td>
      <td>${r.testDate||"-"}</td>
      <td><span class="badge ${resCls}">${r.overallPass ? t("calPass") : t("calFail")}</span></td>
      <td><span class="badge ${sCls}">${r.status}</span></td>
    </tr>`;
  }).join("");
}

function openDetail(resultId) {
  const r = allResults.find(x => x.id === resultId);
  if (!r) return;
  const tool = allTools.find(t => t.id === r.toolId);

  document.getElementById("approval-modal-title").textContent = `${tool?.code||"-"} — ${tool?.name||"-"}`;
  document.getElementById("approval-modal-body").innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;font-size:13px;">
      <div><span class="text-muted">${t("approvalCycle")}:</span> ${cycleName(r.cycleId)}</div>
      <div><span class="text-muted">${t("approvalTech")}:</span> ${userName(r.technicianId)}</div>
      <div><span class="text-muted">${t("calTestDate")}:</span> ${r.testDate||"-"}</div>
      <div><span class="text-muted">${t("calTolerance")}:</span> ${r.tolerance||"-"}%</div>
      <div><span class="text-muted">${t("calRefStd")}:</span> ${r.refStandard||"-"}</div>
      <div><span class="text-muted">${t("calEnvironment")}:</span> ${r.environment||"-"}</div>
    </div>
    <div class="table-wrapper">
      <table class="test-table">
        <thead><tr>
          <th>${t("calPoint")}</th><th>${t("calReference")}</th><th>${t("calMeasured")}</th>
          <th>${t("calError")}</th><th>${t("calPctError")}</th><th>${t("calResult")}</th>
        </tr></thead>
        <tbody>${(r.points||[]).map((pt,i) => `<tr style="background:${pt.pass?"#22c55e08":"#ef444408"}">
          <td style="font-weight:700;">${i+1}</td>
          <td>${pt.ref??"-"}</td><td>${pt.measured??"-"}</td>
          <td>${(pt.error??0).toFixed(4)}</td>
          <td>${(pt.pctError??0).toFixed(4)}%</td>
          <td><span class="badge ${pt.pass?"badge-success":"badge-danger"}">${pt.pass?t("calPass"):t("calFail")}</span></td>
        </tr>`).join("")}</tbody>
      </table>
    </div>
    <div class="result-banner ${r.overallPass?"pass":"fail"}" style="margin-top:12px;">
      ${r.overallPass ? "✅ "+t("calPass") : "❌ "+t("calFail")}
    </div>
    ${r.remarks ? `<div style="margin-top:12px;font-size:13px;"><span class="text-muted">${t("calRemarks")}:</span> ${r.remarks}</div>` : ""}
    ${r.rejectedReason ? `<div style="margin-top:8px;font-size:13px;color:var(--danger);">💬 ${r.rejectedReason}</div>` : ""}
  `;

  const canAct = pendingForRole().some(x => x.id === resultId);
  document.getElementById("approval-modal-footer").innerHTML = canAct ? `
    <button class="btn btn-ghost" onclick="window.CVS_Approval.closeModal()" data-i18n="close">${t("close")}</button>
    <button class="btn btn-danger" onclick="window.CVS_Approval.openReject('${resultId}');window.CVS_Approval.closeModal();">↩️ ${t("approvalReject")}</button>
    <button class="btn btn-success" onclick="window.CVS_Approval.doApprove('${resultId}');window.CVS_Approval.closeModal();">✅ ${t("approvalApprove")}</button>
  ` : `<button class="btn btn-ghost" onclick="window.CVS_Approval.closeModal()">${t("close")}</button>`;

  document.getElementById("approval-modal").classList.add("open");
}

function closeModal() { document.getElementById("approval-modal").classList.remove("open"); }

async function doApprove(resultId) {
  const role = window.CVS?.role;
  const uid  = window.CVS?.uid;
  const r = allResults.find(x => x.id === resultId);
  if (!r) return;

  try {
    if (role === "supervisor") {
      await updateDoc(doc(db, "testResults", resultId), {
        status: "pending_admin", supervisorId: uid, supervisorAt: serverTimestamp()
      });
    } else if (role === "admin") {
      await updateDoc(doc(db, "testResults", resultId), {
        status: "approved", adminId: uid, adminAt: serverTimestamp()
      });
      // Update tool dates
      const tool = allTools.find(t => t.id === r.toolId);
      if (tool && r.testDate) {
        const next = new Date(r.testDate);
        next.setMonth(next.getMonth() + (tool.interval || 12));
        await updateDoc(doc(db, "tools", r.toolId), {
          lastCalDate: r.testDate,
          nextCalDate: next.toISOString().split("T")[0],
          status: "active",
        });
      }
    }
    showToast(t("approvalApproved"), "success");
    await reloadData();
  } catch (err) {
    showToast(err.message || t("errSave"), "error");
  }
}

function openReject(resultId) {
  actionResultId = resultId;
  document.getElementById("reject-reason").value = "";
  document.getElementById("reject-modal").classList.add("open");
}

function closeReject() {
  document.getElementById("reject-modal").classList.remove("open");
  actionResultId = null;
}

async function confirmReject() {
  if (!actionResultId) return;
  const reason = document.getElementById("reject-reason").value.trim();
  if (!reason) { showToast("กรุณาระบุเหตุผล", "warning"); return; }
  try {
    await updateDoc(doc(db, "testResults", actionResultId), {
      status: "rejected", rejectedReason: reason
    });
    showToast(t("approvalRejected"), "success");
    closeReject();
    await reloadData();
  } catch (err) {
    showToast(err.message || t("errSave"), "error");
  }
}

async function reloadData() {
  const [rs, ts] = await Promise.all([
    getDocs(collection(db, "testResults")),
    getDocs(collection(db, "tools")),
  ]);
  allResults = rs.docs.map(d => ({ id: d.id, ...d.data() }));
  allTools   = ts.docs.map(d => ({ id: d.id, ...d.data() }));
  renderPending(); renderHistory(); updateBadge();
}
