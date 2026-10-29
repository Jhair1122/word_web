import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm";
import { setupAuthCookieSync } from "./auth-sync.js";

const SUPABASE_URL = "https://wojinjaczmwlojihoebp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvamluamFjem13bG9qaWhvZWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwODQ2MzgsImV4cCI6MjEwMjY2MDYzOH0.VY5RVZVJMgDoYl-4BoAwe4h0IrKoHv_wJvpMdSjVdr4";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
setupAuthCookieSync(supabase);

// La longitud mínima la define el servidor (variable MIN_PASSWORD_LENGTH) y llega en el HTML.
const MIN_PASSWORD = Number(document.body.dataset.minPassword) || 15;
const USERNAME_RE = /^[a-z0-9_.-]{3,40}$/;

const usersTableWrap = document.getElementById("usersTableWrap");
const createError = document.getElementById("createError");
const newUsername = document.getElementById("newUsername");
const newPassword = document.getElementById("newPassword");
const newIsAdmin = document.getElementById("newIsAdmin");
const createUserBtn = document.getElementById("createUserBtn");
const logoutBtn = document.getElementById("logoutBtn");
const usernameHint = document.getElementById("usernameHint");
const pwChecklist = document.getElementById("pwChecklist");

const confirmModal = document.getElementById("confirmDeleteModal");
const confirmMessage = document.getElementById("confirmDeleteMessage");
const confirmOk = document.getElementById("confirmDeleteOk");
const confirmCancel = document.getElementById("confirmDeleteCancel");

const resetModal = document.getElementById("resetModal");
const resetTitle = document.getElementById("resetTitle");
const resetPassword = document.getElementById("resetPassword");
const resetChecklist = document.getElementById("resetChecklist");
const resetError = document.getElementById("resetError");
const resetOk = document.getElementById("resetOk");
const resetCancel = document.getElementById("resetCancel");

let currentUserId = null;

/* ---------- Utilidades ---------- */
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

let toastEl = null;
let toastTimer = null;
function showToast(message, level = "success") {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "admin-toast";
    toastEl.setAttribute("role", "status");
    toastEl.setAttribute("aria-live", "polite");
    document.body.appendChild(toastEl);
  }
  toastEl.className = "admin-toast state-" + level;
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 5000);
}

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? session.access_token : null;
}

async function authFetch(url, options = {}) {
  const token = await getToken();
  if (!token) { window.location.href = "/login"; throw new Error("Sin sesión"); }
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("No autorizado");
  }
  if (res.status === 403) {
    window.location.href = "/";
    throw new Error("Sin permisos de administrador");
  }
  return res;
}

async function readJson(res) {
  try { return await res.json(); } catch { return {}; }
}

/* ---------- Contraseña: reglas visibles antes del error ---------- */
function renderChecklist(listEl, password, username) {
  const lower = password.toLowerCase();
  const rules = [
    { ok: password.length >= MIN_PASSWORD, text: `Al menos ${MIN_PASSWORD} caracteres (puedes usar una frase con espacios)` },
    { ok: !(username && username.length >= 3 && lower.includes(username)), text: "No incluye el nombre de usuario" },
  ];
  listEl.innerHTML = rules.map(r => {
    const state = !password ? "" : (r.ok ? "ok" : "bad");
    return `<li class="${state}">${escapeHtml(r.text)}</li>`;
  }).join("");
  return rules.every(r => r.ok);
}

function currentUsername() {
  return newUsername.value.trim().toLowerCase();
}

function updateUsernameHint() {
  const value = currentUsername();
  const valid = !value || USERNAME_RE.test(value);
  usernameHint.classList.toggle("is-error", !valid);
  usernameHint.textContent = valid
    ? "3 a 40 caracteres: letras, números, punto, guion o guion bajo."
    : "Usa solo letras, números, punto, guion o guion bajo (3 a 40 caracteres).";
}

newUsername.addEventListener("input", () => {
  updateUsernameHint();
  renderChecklist(pwChecklist, newPassword.value, currentUsername());
});
newPassword.addEventListener("input", () => renderChecklist(pwChecklist, newPassword.value, currentUsername()));
renderChecklist(pwChecklist, "", "");

document.querySelectorAll(".toggle-pass").forEach(btn => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.target);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.textContent = show ? "Ocultar" : "Mostrar";
  });
});

/* ---------- Modales ---------- */
function showConfirm(message) {
  return new Promise((resolve) => {
    confirmMessage.textContent = message;
    confirmModal.hidden = false;
    confirmCancel.focus();
    const cleanup = (result) => {
      confirmModal.hidden = true;
      confirmOk.removeEventListener("click", onOk);
      confirmCancel.removeEventListener("click", onCancel);
      document.removeEventListener("keydown", onKey);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onKey = (e) => { if (e.key === "Escape") cleanup(false); };
    confirmOk.addEventListener("click", onOk);
    confirmCancel.addEventListener("click", onCancel);
    document.addEventListener("keydown", onKey);
  });
}

// Devuelve la nueva contraseña o null si se cancela. La validación definitiva la hace el servidor.
function askNewPassword(user, submit) {
  return new Promise((resolve) => {
    resetTitle.textContent = `Nueva contraseña para "${user.username}"`;
    resetPassword.value = "";
    resetPassword.type = "password";
    resetModal.querySelector(".toggle-pass").textContent = "Mostrar";
    resetError.hidden = true;
    renderChecklist(resetChecklist, "", user.username || "");
    resetModal.hidden = false;
    resetPassword.focus();

    const onInput = () => renderChecklist(resetChecklist, resetPassword.value, (user.username || "").toLowerCase());
    const cleanup = (result) => {
      resetModal.hidden = true;
      resetPassword.value = "";
      resetPassword.removeEventListener("input", onInput);
      resetOk.removeEventListener("click", onOk);
      resetCancel.removeEventListener("click", onCancel);
      document.removeEventListener("keydown", onKey);
      resolve(result);
    };
    const onOk = async () => {
      resetError.hidden = true;
      resetOk.disabled = true;
      resetOk.textContent = "Guardando...";
      const message = await submit(resetPassword.value);
      resetOk.disabled = false;
      resetOk.textContent = "Guardar contraseña";
      if (message) {
        resetError.textContent = message;
        resetError.hidden = false;
        return;
      }
      cleanup(true);
    };
    const onCancel = () => cleanup(false);
    const onKey = (e) => {
      if (e.key === "Escape") cleanup(false);
      if (e.key === "Enter" && e.target === resetPassword) onOk();
    };
    resetPassword.addEventListener("input", onInput);
    resetOk.addEventListener("click", onOk);
    resetCancel.addEventListener("click", onCancel);
    document.addEventListener("keydown", onKey);
  });
}

/* ---------- Lista de usuarios ---------- */
async function cargarUsuarios() {
  usersTableWrap.innerHTML = `<p class="muted">Cargando usuarios...</p>`;
  try {
    const res = await authFetch("/admin/usuarios");
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || "No se pudo cargar la lista.");
    renderUsersTable(data.usuarios || []);
  } catch (e) {
    usersTableWrap.innerHTML = `<p class="muted">No se pudo cargar la lista. Recarga la página e intenta de nuevo.</p>`;
  }
}

function updateStats(usuarios) {
  const fx = window.PangoaFX;
  const total = usuarios.length;
  const admins = usuarios.filter(u => u.is_admin).length;
  const set = (id, n, one, many) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (fx) fx.countTo(el, n); else el.textContent = String(n);
    const label = el.parentElement && el.parentElement.querySelector("span");
    if (label) label.textContent = n === 1 ? one : many;
  };
  set("statTotal", total, "usuario", "usuarios");
  set("statAdmins", admins, "administrador", "administradores");
  set("statUsers", total - admins, "usuario normal", "usuarios normales");
}

function renderUsersTable(usuarios) {
  updateStats(usuarios);
  if (!usuarios.length) {
    usersTableWrap.innerHTML = `<p class="muted">No hay usuarios registrados.</p>`;
    return;
  }
  const rows = usuarios.map(u => {
    const isMe = u.id === currentUserId;
    return `
    <tr>
      <td>${escapeHtml(u.username || "-")}${isMe ? '<span class="badge-you">(tú)</span>' : ""}</td>
      <td>${u.is_admin ? '<span class="badge-admin">Admin</span>' : '<span class="badge-user">Usuario</span>'}</td>
      <td>${u.created_at ? escapeHtml(new Date(u.created_at).toLocaleDateString("es-PE")) : "-"}</td>
      <td>
        <div class="row-actions">
          <button class="secondary" type="button" data-action="reset" data-id="${escapeHtml(u.id)}" data-username="${escapeHtml(u.username)}">Restablecer contraseña</button>
          ${isMe ? "" : `<button class="danger" type="button" data-action="delete" data-id="${escapeHtml(u.id)}" data-username="${escapeHtml(u.username)}">Eliminar</button>`}
        </div>
      </td>
    </tr>`;
  }).join("");

  usersTableWrap.innerHTML = `
    <table class="users-table">
      <thead><tr><th>Usuario</th><th>Rol</th><th>Creado</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  usersTableWrap.querySelectorAll('button[data-action="delete"]').forEach(btn => {
    btn.addEventListener("click", async () => {
      const ok = await showConfirm(`¿Eliminar al usuario "${btn.dataset.username}"? Esta acción no se puede deshacer.`);
      if (!ok) return;
      btn.disabled = true;
      try {
        const res = await authFetch(`/admin/usuarios/${encodeURIComponent(btn.dataset.id)}`, { method: "DELETE" });
        const data = await readJson(res);
        if (!res.ok) throw new Error(data.error || "No se pudo eliminar el usuario.");
        showToast(`Usuario "${btn.dataset.username}" eliminado.`);
        cargarUsuarios();
      } catch (e) {
        btn.disabled = false;
        showToast(e.message || "No se pudo eliminar el usuario.", "error");
      }
    });
  });

  usersTableWrap.querySelectorAll('button[data-action="reset"]').forEach(btn => {
    btn.addEventListener("click", async () => {
      const user = { id: btn.dataset.id, username: btn.dataset.username };
      const done = await askNewPassword(user, async (password) => {
        try {
          const res = await authFetch(`/admin/usuarios/${encodeURIComponent(user.id)}/password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password })
          });
          const data = await readJson(res);
          return res.ok ? null : (data.error || "No se pudo restablecer la contraseña.");
        } catch (e) {
          return "No se pudo restablecer la contraseña.";
        }
      });
      if (done) showToast(`Contraseña de "${user.username}" actualizada. Compártela por un canal seguro.`);
    });
  });
}

/* ---------- Crear usuario ---------- */
createUserBtn.addEventListener("click", async () => {
  createError.hidden = true;
  const username = currentUsername();
  const password = newPassword.value;
  const isAdmin = newIsAdmin.checked;

  if (!USERNAME_RE.test(username)) {
    createError.textContent = "Escribe un usuario de 3 a 40 caracteres (letras, números, punto, guion o guion bajo).";
    createError.hidden = false;
    newUsername.focus();
    return;
  }
  if (!renderChecklist(pwChecklist, password, username)) {
    createError.textContent = `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres y no incluir el usuario.`;
    createError.hidden = false;
    newPassword.focus();
    return;
  }

  createUserBtn.disabled = true;
  createUserBtn.textContent = "Creando...";

  try {
    const res = await authFetch("/admin/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, is_admin: isAdmin })
    });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || "No se pudo crear el usuario.");

    newUsername.value = "";
    newPassword.value = "";
    newPassword.type = "password";
    document.querySelector('.toggle-pass[data-target="newPassword"]').textContent = "Mostrar";
    newIsAdmin.checked = false;
    updateUsernameHint();
    renderChecklist(pwChecklist, "", "");
    showToast(`Usuario "${username}" creado.`);
    cargarUsuarios();
  } catch (e) {
    createError.textContent = e.message;
    createError.hidden = false;
  }

  createUserBtn.disabled = false;
  createUserBtn.textContent = "Crear usuario";
});

logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "/login";
});

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = "/login"; return; }
  currentUserId = session.user.id;

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", session.user.id).single();
  if (!profile || !profile.is_admin) {
    window.location.href = "/";
    return;
  }

  cargarUsuarios();
}

init();

/* ---------- Tema claro / oscuro ---------- */
const themeBtn = document.getElementById("themeToggleBtn");
if (themeBtn) {
  const syncTheme = () => {
    themeBtn.textContent = document.documentElement.getAttribute("data-theme") === "dark" ? "Modo claro" : "Modo oscuro";
  };
  syncTheme();
  themeBtn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("pangoa_theme", next); } catch {}
    syncTheme();
  });
}
