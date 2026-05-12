// M8 — Feedback & GitHub Issues
import { t } from "./i18n.js";

const REPO = "tx-antenna-team/calibration-verify-system";
const API  = `https://api.github.com/repos/${REPO}/issues`;
const NEW_URL = `https://github.com/${REPO}/issues/new`;

let allIssues = [];
let currentFilter = "open";

export async function init() {
  window.CVS_Issues = { openFeedback, closeFeedback, submitFeedback, applyFilter };

  renderSkeleton();
  await loadIssues();
}

async function loadIssues() {
  const listEl = document.getElementById("issues-list");
  if (!listEl) return;

  try {
    const res = await fetch(`${API}?state=all&per_page=50&sort=created&direction=desc`, {
      headers: { Accept: "application/vnd.github+json" }
    });

    if (!res.ok) {
      if (res.status === 404) throw new Error("not_found");
      if (res.status === 403 || res.status === 401) throw new Error("auth_required");
      throw new Error(`HTTP ${res.status}`);
    }

    allIssues = (await res.json()).filter(i => !i.pull_request);
    updateStats();
    renderIssues();
  } catch (err) {
    listEl.innerHTML = buildError(err.message);
  }
}

function updateStats() {
  const open   = allIssues.filter(i => i.state === "open").length;
  const closed = allIssues.filter(i => i.state === "closed").length;
  setText("stat-open",   open);
  setText("stat-closed", closed);
  setText("stat-total",  allIssues.length);
}

function applyFilter(state) {
  currentFilter = state;
  document.querySelectorAll(".issue-filter-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.filter === state);
  });
  renderIssues();
}

function renderIssues() {
  const listEl = document.getElementById("issues-list");
  if (!listEl) return;

  const filtered = currentFilter === "all"
    ? allIssues
    : allIssues.filter(i => i.state === currentFilter);

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="text-center text-muted" style="padding:40px;">${t("issueNoIssues")}</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(issue => buildIssueCard(issue)).join("");
}

function buildIssueCard(issue) {
  const isOpen = issue.state === "open";
  const stateCls = isOpen ? "badge-success" : "badge-muted";
  const stateLbl = isOpen ? t("issueStatusOpen") : t("issueStatusClosed");
  const stateIcon = isOpen ? "🟢" : "⚫";
  const date = new Date(issue.created_at).toLocaleDateString("th-TH", { year:"numeric", month:"short", day:"numeric" });
  const labels = (issue.labels || []).map(lbl =>
    `<span class="badge" style="background:#${lbl.color}22;color:#${lbl.color};border:1px solid #${lbl.color}55;font-size:10px;">${lbl.name}</span>`
  ).join(" ");

  return `<div class="issue-card card" style="padding:16px 20px;margin-bottom:10px;">
    <div class="d-flex align-center gap-12" style="flex-wrap:wrap;">
      <span style="font-size:20px;line-height:1;">${stateIcon}</span>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;">
          <strong style="font-size:14px;flex:1;">#${issue.number} ${escHtml(issue.title)}</strong>
          <span class="badge ${stateCls}" style="white-space:nowrap;">${stateLbl}</span>
        </div>
        <div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          ${labels}
          <span class="text-muted" style="font-size:11px;">${t("issueOpenedBy")} <strong>${escHtml(issue.user?.login || "-")}</strong> · ${date}</span>
          ${issue.comments > 0 ? `<span class="text-muted" style="font-size:11px;">💬 ${issue.comments}</span>` : ""}
        </div>
        ${issue.body ? `<div style="margin-top:8px;font-size:12px;color:var(--text-muted);line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${escHtml(issue.body.slice(0,200))}${issue.body.length>200?"…":""}</div>` : ""}
      </div>
      <a href="${issue.html_url}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm" style="white-space:nowrap;">
        🔗 ${t("issueViewGithub")}
      </a>
    </div>
  </div>`;
}

function buildError(code) {
  let msg = t("issueLoadError");
  let hint = "";
  if (code === "auth_required") {
    hint = "Repository อาจเป็น Private — ไม่สามารถโหลดรายการ Issues ได้โดยไม่ผ่านการยืนยันตัวตน";
  } else if (code === "not_found") {
    hint = "ไม่พบ Repository นี้บน GitHub";
  }
  return `<div class="card" style="padding:32px;text-align:center;color:var(--text-muted);">
    <div style="font-size:36px;">⚠️</div>
    <div style="margin-top:8px;font-weight:600;">${msg}</div>
    ${hint ? `<div style="margin-top:6px;font-size:13px;">${hint}</div>` : ""}
    <div style="margin-top:16px;">
      <a href="https://github.com/${REPO}/issues" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">
        🔗 ดูใน GitHub โดยตรง
      </a>
    </div>
  </div>`;
}

function renderSkeleton() {
  const listEl = document.getElementById("issues-list");
  if (listEl) listEl.innerHTML = `<div class="text-center text-muted" style="padding:40px;">${t("issueLoading")}</div>`;
}

// ── Feedback Modal ──
function openFeedback() {
  ["fb-category","fb-title"].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = "";
  });
  const desc = document.getElementById("fb-desc");
  if (desc) desc.value = "";
  document.getElementById("issues-modal").classList.add("open");
}

function closeFeedback() {
  document.getElementById("issues-modal").classList.remove("open");
}

function submitFeedback() {
  const category = document.getElementById("fb-category")?.value || "";
  const title    = document.getElementById("fb-title")?.value.trim() || "";
  const desc     = document.getElementById("fb-desc")?.value.trim() || "";

  if (!title) { showToast(t("errRequired"), "warning"); return; }

  const user = window.CVS?.name || window.CVS?.empId || "CVS User";
  const body = [
    category ? `**Category:** ${category}` : "",
    "",
    desc || "(No additional details provided)",
    "",
    "---",
    `*Submitted via CVS App by ${user}*`,
  ].filter((l, i, arr) => !(l === "" && arr[i-1] === "")).join("\n");

  const labelMap = {
    "bug":         "bug",
    "feature":     "enhancement",
    "question":    "question",
    "improvement": "documentation",
  };
  const label = labelMap[document.getElementById("fb-category")?.value] || "";

  const params = new URLSearchParams({ title, body });
  if (label) params.set("labels", label);
  window.open(`${NEW_URL}?${params.toString()}`, "_blank", "noopener");
  closeFeedback();
  showToast("เปิด GitHub Issues แล้ว — กรุณา Submit ในแท็บที่เปิดขึ้น", "info");
}

function escHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function setText(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }
