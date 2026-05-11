// M0 — Dashboard
import { db } from "./config.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { t } from "./i18n.js";

export async function init() {
  const [tools, results] = await Promise.all([
    getDocs(collection(db, "tools")),
    getDocs(collection(db, "testResults"))
  ]);

  const toolList = tools.docs.map(d => ({ id: d.id, ...d.data() }));
  const today = new Date(); today.setHours(0,0,0,0);

  let overdue = 0, dueSoon = 0;
  const overdueTools = [];

  toolList.forEach(tool => {
    if (!tool.nextCalDate) return;
    const next = new Date(tool.nextCalDate);
    const diff = Math.ceil((next - today) / 86400000);
    if (diff < 0) { overdue++; overdueTools.push({ ...tool, diff }); }
    else if (diff <= 30) { dueSoon++; overdueTools.push({ ...tool, diff }); }
  });

  const pending = results.docs.filter(d => {
    const s = d.data().status;
    return s === "pending_supervisor" || s === "pending_admin";
  });

  // KPIs
  document.getElementById("kpi-total").textContent = toolList.length;
  document.getElementById("kpi-overdue").textContent = overdue;
  document.getElementById("kpi-duesoon").textContent = dueSoon;
  document.getElementById("kpi-pending").textContent = pending.length;

  // Overdue list
  const overdueEl = document.getElementById("overdue-list");
  if (overdueTools.length === 0) {
    overdueEl.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><p>${t("noData")}</p></div>`;
  } else {
    overdueEl.innerHTML = `<div class="table-wrapper"><table><thead><tr>
      <th>${t("toolCode")}</th><th>${t("toolName")}</th><th>${t("toolNextCal")}</th><th>${t("toolStatus")}</th>
    </tr></thead><tbody>
      ${overdueTools.slice(0,8).map(tool => {
        const cls = tool.diff < 0 ? "badge-danger" : "badge-warning";
        const label = tool.diff < 0 ? `${Math.abs(tool.diff)}d overdue` : `${tool.diff}d left`;
        return `<tr>
          <td><code>${tool.code || "-"}</code></td>
          <td>${tool.name || "-"}</td>
          <td>${tool.nextCalDate || "-"}</td>
          <td><span class="badge ${cls}">${label}</span></td>
        </tr>`;
      }).join("")}
    </tbody></table></div>`;
  }

  // Pending list
  const pendingEl = document.getElementById("pending-list");
  if (pending.length === 0) {
    pendingEl.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><p>${t("noData")}</p></div>`;
  } else {
    // Get tool names for pending results
    const toolMap = {};
    toolList.forEach(t => toolMap[t.id] = t);

    pendingEl.innerHTML = `<div class="table-wrapper"><table><thead><tr>
      <th>${t("approvalTool")}</th><th>${t("approvalDate")}</th><th>${t("approvalOverall")}</th><th>Status</th>
    </tr></thead><tbody>
      ${pending.slice(0,8).map(d => {
        const r = d.data();
        const tool = toolMap[r.toolId];
        const cls = r.overallPass ? "badge-success" : "badge-danger";
        const lbl = r.overallPass ? t("calPass") : t("calFail");
        const sCls = r.status === "pending_supervisor" ? "badge-warning" : "badge-info";
        return `<tr>
          <td>${tool?.name || r.toolId}</td>
          <td>${r.testDate || "-"}</td>
          <td><span class="badge ${cls}">${lbl}</span></td>
          <td><span class="badge ${sCls}">${r.status}</span></td>
        </tr>`;
      }).join("")}
    </tbody></table></div>`;
  }
}
