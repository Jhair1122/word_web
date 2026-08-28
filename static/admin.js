import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://wojinjaczmwlojihoebp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvamluamFjem13bG9qaWhvZWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwODQ2MzgsImV4cCI6MjEwMjY2MDYzOH0.VY5RVZVJMgDoYl-4BoAwe4h0IrKoHv_wJvpMdSjVdr4";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const usersTableWrap = document.getElementById("usersTableWrap");
const createError = document.getElementById("createError");
const newEmail = document.getElementById("newEmail");
const newPassword = document.getElementById("newPassword");
const newIsAdmin = document.getElementById("newIsAdmin");
const createUserBtn = document.getElementById("createUserBtn");
const logoutBtn = document.getElementById("logoutBtn");

const confirmModal = document.getElementById("confirmDeleteModal");
const confirmMessage = document.getElementById("confirmDeleteMessage");
const confirmOk = document.getElementById("confirmDeleteOk");
const confirmCancel = document.getElementById("confirmDeleteCancel");

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? session.access_token : null;
}

async function authFetch(url, options = {}) {
  const token = await getToken();
  if (!token) { window.location.href = "/login"; throw new Error("Sin sesión"); }
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 || res.status === 403) {
    if (res.status === 403) {
      alert("No tienes permisos de administrador.");
      window.location.href = "/";
    } else {
      window.location.href = "/login";
    }
    throw new Error("No autorizado");
  }
  return res;
}

function showConfirm(message) {
  return new Promise((resolve) => {
    confirmMessage.textContent = message;
    confirmModal.hidden = false;
    const cleanup = (result) => {
      confirmModal.hidden = true;
      confirmOk.removeEventListener("click", onOk);
      confirmCancel.removeEventListener("click", onCancel);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    confirmOk.addEventListener("click", onOk);
    confirmCancel.addEventListener("click", onCancel);
  });
}

async function cargarUsuarios() {
  usersTableWrap.innerHTML = `<p class="muted">Cargando usuarios...</p>`;
  try {
    const res = await authFetch("/admin/usuarios");
    const data = await res.json();
    renderUsersTable(data.usuarios || []);
  } catch (e) {
    usersTableWrap.innerHTML = `<p class="muted">No se pudo cargar la lista.</p>`;
  }
}

function renderUsersTable(usuarios) {
  if (!usuarios.length) {
    usersTableWrap.innerHTML = `<p class="muted">No hay usuarios registrados.</p>`;
    return;
  }
  const rows = usuarios.map(u => `
    <tr>
      <td>${u.email || "-"}</td>
      <td>${u.is_admin ? '<span class="badge-admin">Admin</span>' : '<span class="badge-user">Usuario</span>'}</td>
      <td>${u.created_at ? new Date(u.created_at).toLocaleDateString("es-PE") : "-"}</td>
      <td><button class="danger" data-id="${u.id}" data-email="${u.email}">Eliminar</button></td>
    </tr>
  `).join("");

  usersTableWrap.innerHTML = `
    <table class="users-table">
      <thead><tr><th>Correo</th><th>Rol</th><th>Creado</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  usersTableWrap.querySelectorAll("button[data-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const ok = await showConfirm(`¿Eliminar al usuario "${btn.dataset.email}"? Esta acción no se puede deshacer.`);
      if (!ok) return;
      try {
        await authFetch(`/admin/usuarios/${btn.dataset.id}`, { method: "DELETE" });
        cargarUsuarios();
      } catch (e) {
        alert("No se pudo eliminar el usuario.");
      }
    });
  });
}

createUserBtn.addEventListener("click", async () => {
  createError.hidden = true;
  const email = newEmail.value.trim();
  const password = newPassword.value;
  const isAdmin = newIsAdmin.checked;

  if (!email || password.length < 6) {
    createError.textContent = "Correo válido y contraseña de al menos 6 caracteres son obligatorios.";
    createError.hidden = false;
    return;
  }

  createUserBtn.disabled = true;
  createUserBtn.textContent = "Creando...";

  try {
    const res = await authFetch("/admin/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, is_admin: isAdmin })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al crear usuario.");

    newEmail.value = "";
    newPassword.value = "";
    newIsAdmin.checked = false;
    cargarUsuarios();
  } catch (e) {
    createError.textContent = e.message;
    createError.hidden = false;
  }

  createUserBtn.disabled = false;
  createUserBtn.textContent = "+ Crear usuario";
});

logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "/login";
});

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = "/login"; return; }
  cargarUsuarios();
}

init();
