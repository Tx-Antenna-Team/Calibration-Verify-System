// M8 — Feedback & GitHub Issues
import { db } from "./config.js";
import { doc, getDoc, setDoc }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { t } from "./i18n.js";

const REPO = "tx-antenna-team/calibration-verify-system";
const API  = `https://api.github.com/repos/${REPO}/issues`;

let allIssues    = [];
let currentFilter = "open";
let githubToken  = "";

export async function init() {
  window.CVS_Issues = { openFeedback, closeFeedback, submitFeedback, applyFilter, saveToken };

  await loadToken();

  const isAdmin = window.CVS?.role === "admin";
  const tokenSection = document.getElementById("token-section");
  if (tokenSection) tokenSection.classList.toggle("hidden", !isAdmin);
  if (isAdmin && githubToken) {
    const inp = document.getElementById("github-token-input");
    if (inp) inp.placeholder = "••••••••• (token configured)";
  }

  renderSkeleton();
  await loadIssues();
}

// ── Token management ──────────────────────────────────────────
async function loadToken() {
  try {
    const snap = await getDoc(doc(db, "config", "github"));
    if (snap.exists()) githubToken = snap.data().token || "";
  } catch { githubToken = ""; }
}

async function saveToken() {
  const val = document.getElementById("github-token-input")?.value.trim();
  if (!val) { showToast(t("errRequired"), "warning"); return; }
  try {
    await setDoc(doc(db, "config", "github"), { token: val });
    githubToken = val;
    document.getElementById("github-token-input").value = "";
    document.getElementById("github-token-input").placeholder = "••••••••• (token configured)";
    showToast(t("issueTokenSaved"), "success");
    renderSkeleton();
    await loadIssues();
  } catch (err) {
    showToast(err.message || t("errSave"), "error");
  }
}

// ── Load issues from GitHub API ───────────────────────────────
async function loadIssues() {
  const listEl = document.getElementById("issues-list");
  if (!listEl) return;
  try {
    const headers = { Accept: "application/vnd.github+json" };
    if (githubToken) headers["Authorization"] = `Bearer ${githubToken}`;

    const res = await fetch(`${API}?state=all&per_page=50&sort=created&direction=desc`, { headers });
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
  document.querySelectorAll(".issue-filter-btn").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.filter === state));
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
  listEl.innerHTML = filtered.map(buildIssueCard).join("");
}

function buildIssueCard(issue) {
  const isOpen    = issue.state === "open";
  const stateCls  = isOpen ? "badge-success" : "badge-muted";
  const stateLbl  = isOpen ? t("issueStatusOpen") : t("issueStatusClosed");
  const stateIcon = isOpen ? "🟢" : "⚫";
  const date = new Date(issue.created_at).toLocaleDateString("th-TH",
    { year:"numeric", month:"short", day:"numeric" });
  const labels = (issue.labels || []).map(lbl =>
    `<span class="badge" style="background:#${lbl.color}22;color:#${lbl.color};border:1px solid #${lbl.color}55;font-size:10px;">${lbl.name}</span>`
  ).join(" ");
  const preview = issue.body
    ? `<div style="margin-top:8px;font-size:12px;color:var(--text-muted);line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${escHtml(issue.body.slice(0,200))}${issue.body.length>200?"…":""}</div>`
    : "";

  return `<div class="card" style="padding:16px 20px;margin-bottom:10px;">
    <div class="d-flex align-center gap-12" style="flex-wrap:wrap;">
      <span style="font-size:20px;line-height:1;">${stateIcon}</span>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;">
          <strong style="font-size:14px;flex:1;">#${issue.number} ${escHtml(issue.title)}</strong>
          <span class="badge ${stateCls}" style="white-space:nowrap;">${stateLbl}</span>
        </div>
        <div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          ${labels}
          <span class="text-muted" style="font-size:11px;">${t("issueOpenedBy")} <strong>${escHtml(issue.user?.login||"-")}</strong> · ${date}</span>
          ${issue.comments > 0 ? `<span class="text-muted" style="font-size:11px;">💬 ${issue.comments}</span>` : ""}
        </div>
        ${preview}
      </div>
      <a href="${issue.html_url}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm" style="white-space:nowrap;">
        🔗 ${t("issueViewGithub")}
      </a>
    </div>
  </div>`;
}

function buildError(code) {
  const hints = {
    auth_required: "กรุณาตั้งค่า GitHub Token ก่อน (Admin → ตั้งค่า Token ด้านล่าง)",
    not_found: "ไม่พบ Repository นี้บน GitHub",
  };
  return `<div class="card" style="padding:32px;text-align:center;color:var(--text-muted);">
    <div style="font-size:36px;">⚠️</div>
    <div style="margin-top:8px;font-weight:600;">${t("issueLoadError")}</div>
    ${hints[code] ? `<div style="margin-top:6px;font-size:13px;">${hints[code]}</div>` : `<div style="font-size:12px;margin-top:4px;">${code}</div>`}
    <div style="margin-top:16px;">
      <a href="https://github.com/${REPO}/issues" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">🔗 ดูใน GitHub โดยตรง</a>
    </div>
  </div>`;
}

function renderSkeleton() {
  const listEl = document.getElementById("issues-list");
  if (listEl) listEl.innerHTML = `<div class="text-center text-muted" style="padding:40px;">${t("issueLoading")}</div>`;
}

// ── Feedback Modal ────────────────────────────────────────────
function openFeedback() {
  if (!githubToken) { showToast(t("issueTokenRequired"), "warning"); return; }
  document.getElementById("fb-category").value = "bug";
  document.getElementById("fb-title").value = "";
  document.getElementById("fb-desc").value  = "";
  document.getElementById("issues-modal").classList.add("open");
}

function closeFeedback() {
  document.getElementById("issues-modal").classList.remove("open");
}

async function submitFeedback() {
  const category = document.getElementById("fb-category")?.value || "";
  const title    = document.getElementById("fb-title")?.value.trim() || "";
  const desc     = document.getElementById("fb-desc")?.value.trim() || "";
  if (!title) { showToast(t("errRequired"), "warning"); return; }

  const btn = document.getElementById("fb-submit-btn");
  if (btn) { btn.disabled = true; btn.textContent = t("issueSubmitting"); }

  const categoryLabel = {
    bug:         "🐛 Bug Report",
    feature:     "✨ Feature Request",
    question:    "❓ Question",
    improvement: "💡 Improvement",
  }[category] || category;

  const labelMap = { bug:"bug", feature:"enhancement", question:"question", improvement:"documentation" };

  const user  = window.CVS?.name  || "CVS User";
  const empId = window.CVS?.empId || "";
  const body  = [
    `**Category:** ${categoryLabel}`,
    `**Submitted by:** ${user}${empId ? ` (${empId})` : ""}`,
    "",
    "### Details",
    desc || "*(No additional details provided)*",
    "",
    "---",
    "*Submitted via CVS — Calibration Verification System*",
  ].join("\n");

  const labels = labelMap[category] ? [labelMap[category]] : [];

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title, body, labels }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `HTTP ${res.status}`);
    }

    const issue = await res.json();
    closeFeedback();
    showToast(`${t("issueSubmitSuccess")} #${issue.number}`, "success");
    await loadIssues();
  } catch (err) {
    showToast(err.message || t("errSave"), "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = t("issueSubmitGithub"); }
  }
}

function escHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function setText(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }
