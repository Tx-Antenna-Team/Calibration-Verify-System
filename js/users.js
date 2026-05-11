// M2 — User Management
import { auth, db, toEmail, firebaseConfig } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, getDocs, doc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { t } from "./i18n.js";

// Secondary app so creating a user doesn't sign out the current admin session
const _secondaryApp  = initializeApp(firebaseConfig, "cvs-admin-helper");
const _secondaryAuth = getAuth(_secondaryApp);

let allUsers = [];
let editingUid = null;

export async function init() {
  window.CVS_Users = { openCreate, closeModal, save, search, toggleStatus };
  await loadUsers();
}

async function loadUsers() {
  const snap = await getDocs(collection(db, "users"));
  allUsers = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  renderTable(allUsers);
}

function renderTable(users) {
  const tbody = document.getElementById("user-tbody");
  if (!tbody) return;
  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">${t("noData")}</td></tr>`;
    return;
  }
  tbody.innerHTML = users.map(u => {
    const roleBadge = { admin:"badge-primary", supervisor:"badge-success", qa:"badge-info", technician:"badge-warning", viewer:"badge-muted" }[u.role] || "badge-muted";
    const statusCls = u.status === "active" ? "badge-success" : "badge-danger";
    const statusLbl = u.status === "active" ? t("userActive") : t("userInactive");
    return `<tr>
      <td><code>${u.employeeId || "-"}</code></td>
      <td>${u.name || "-"}</td>
      <td>${u.dept || "-"}</td>
      <td><span class="badge ${roleBadge}">${u.role || "-"}</span></td>
      <td><span class="badge ${statusCls}">${statusLbl}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="window.CVS_Users.openEdit('${u.uid}')">✏️ ${t("edit")}</button>
        <button class="btn btn-sm ${u.status==="active"?"btn-warning":"btn-success"}"
                onclick="window.CVS_Users.toggleStatus('${u.uid}','${u.status}')">
          ${u.status === "active" ? "🚫 "+t("userInactive") : "✅ "+t("userActive")}
        </button>
      </td>
    </tr>`;
  }).join("");
}

function search(q) {
  const lower = q.toLowerCase();
  renderTable(allUsers.filter(u =>
    (u.employeeId||"").toLowerCase().includes(lower) ||
    (u.name||"").toLowerCase().includes(lower) ||
    (u.dept||"").toLowerCase().includes(lower)
  ));
}

function openCreate() {
  editingUid = null;
  document.getElementById("user-uid").value = "";
  document.getElementById("user-empid").value = "";
  document.getElementById("user-empid").disabled = false;
  document.getElementById("user-name").value = "";
  document.getElementById("user-dept").value = "";
  document.getElementById("user-role").value = "technician";
  document.getElementById("user-password").value = "";
  document.getElementById("user-pw-hint").setAttribute("data-i18n", "userPasswordMin");
  document.getElementById("user-pw-hint").textContent = t("userPasswordMin");
  document.getElementById("user-modal-title").setAttribute("data-i18n", "userCreateTitle");
  document.getElementById("user-modal-title").textContent = t("userCreateTitle");
  document.getElementById("user-modal").classList.add("open");
}

window.CVS_Users_openEdit = function(uid) {
  const u = allUsers.find(x => x.uid === uid);
  if (!u) return;
  editingUid = uid;
  document.getElementById("user-uid").value = uid;
  document.getElementById("user-empid").value = u.employeeId || "";
  document.getElementById("user-empid").disabled = true;
  document.getElementById("user-name").value = u.name || "";
  document.getElementById("user-dept").value = u.dept || "";
  document.getElementById("user-role").value = u.role || "viewer";
  document.getElementById("user-password").value = "";
  document.getElementById("user-pw-hint").textContent = t("userPasswordHint");
  document.getElementById("user-modal-title").textContent = t("userEditTitle");
  document.getElementById("user-modal").classList.add("open");
};

// Expose to inline onclick
window.CVS_Users = window.CVS_Users || {};
window.CVS_Users.openEdit = window.CVS_Users_openEdit;

function closeModal() {
  document.getElementById("user-modal").classList.remove("open");
  editingUid = null;
}

async function save() {
  const empId    = document.getElementById("user-empid").value.trim().toUpperCase();
  const name     = document.getElementById("user-name").value.trim();
  const dept     = document.getElementById("user-dept").value.trim();
  const role     = document.getElementById("user-role").value;
  const password = document.getElementById("user-password").value;

  if (!name || !role) { showToast(t("errRequired"), "warning"); return; }

  try {
    if (!editingUid) {
      // CREATE: need empId + password
      if (!empId || password.length < 6) {
        showToast(t("errRequired") + " (รหัสพนักงาน + รหัสผ่าน ≥6 ตัว)", "warning"); return;
      }
      const email = toEmail(empId);
      // Use secondary auth so admin session is NOT interrupted
      const cred = await createUserWithEmailAndPassword(_secondaryAuth, email, password);
      await _secondaryAuth.signOut();
      await setDoc(doc(db, "users", cred.user.uid), {
        employeeId: empId, name, dept, role, status: "active", createdAt: serverTimestamp()
      });
    } else {
      // EDIT: update Firestore
      const ref = doc(db, "users", editingUid);
      await updateDoc(ref, { name, dept, role });
      if (password.length >= 6) {
        // Note: updating another user's password requires Admin SDK in production
        // For client-side we can only update current user's password
        showToast("⚠️ การเปลี่ยนรหัสผ่านผู้ใช้อื่นต้องใช้ Firebase Admin SDK", "warning");
      }
    }
    showToast(t("userSaved"), "success");
    closeModal();
    await loadUsers();
  } catch (err) {
    console.error(err);
    showToast(err.message || t("errSave"), "error");
  }
}

async function toggleStatus(uid, currentStatus) {
  const newStatus = currentStatus === "active" ? "inactive" : "active";
  const msg = newStatus === "inactive" ? t("userConfirmDeact") : t("userConfirmAct");
  if (!confirm(msg)) return;
  try {
    await updateDoc(doc(db, "users", uid), { status: newStatus });
    showToast(newStatus === "inactive" ? t("userDeactivated") : t("userActivated"), "success");
    await loadUsers();
  } catch (err) {
    showToast(err.message || t("errSave"), "error");
  }
}
