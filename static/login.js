import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm";
import { setupAuthCookieSync } from "./auth-sync.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
setupAuthCookieSync(supabase);

const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");
const loginOk = document.getElementById("loginOk");
const showPassword = document.getElementById("showPassword");

async function redirectIfAlreadyLogged() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) window.location.href = "/";
}
redirectIfAlreadyLogged();

function showError(message) {
  loginOk.hidden = true;
  loginError.textContent = message;
  loginError.hidden = false;
}

function resetButton() {
  loginBtn.disabled = false;
  loginBtn.textContent = "Ingresar";
}

async function doLogin() {
  if (loginBtn.disabled) return; // evita enviar dos veces
  loginError.hidden = true;
  const username = loginUsername.value.trim();
  const password = loginPassword.value;
  if (!username || !password) {
    showError("Ingresa tu usuario y contraseña.");
    (username ? loginPassword : loginUsername).focus();
    return;
  }
  loginBtn.disabled = true;
  loginBtn.textContent = "Ingresando...";
  try {
    const response = await fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    if (!response.ok) {
      // 429: demasiados intentos; el servidor indica cuánto esperar
      showError(data.error || "Usuario o contraseña incorrectos.");
      resetButton();
      return;
    }
    const { error } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token
    });
    if (error) {
      showError("No se pudo iniciar sesión.");
      resetButton();
      return;
    }
    window.location.href = "/";
  } catch (e) {
    showError("Error de conexión. Si el servidor estaba en reposo, espera unos segundos e intenta de nuevo.");
    resetButton();
  }
}

loginBtn.addEventListener("click", doLogin);
loginPassword.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
loginUsername.addEventListener("keydown", (e) => { if (e.key === "Enter") loginPassword.focus(); });
showPassword.addEventListener("change", () => {
  loginPassword.type = showPassword.checked ? "text" : "password";
});

// ---------------- Tema claro / oscuro ----------------
const themeBtn = document.getElementById("themeToggleBtn");
function syncThemeLabel() {
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  themeBtn.textContent = dark ? "Modo claro" : "Modo oscuro";
}
syncThemeLabel();
themeBtn.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("pangoa_theme", next); } catch {}
  syncThemeLabel();
});

// ---------------- He olvidado mi contraseña ----------------
const MIN_PASSWORD = parseInt(document.body.dataset.minPassword, 10) || 15;
const forgotBtn = document.getElementById("forgotBtn");
const forgotModal = document.getElementById("forgotModal");
const forgotForm = document.getElementById("forgotForm");
const forgotUsername = document.getElementById("forgotUsername");
const forgotCode = document.getElementById("forgotCode");
const forgotPassword = document.getElementById("forgotPassword");
const forgotToggle = document.getElementById("forgotToggle");
const forgotChecklist = document.getElementById("forgotChecklist");
const forgotError = document.getElementById("forgotError");
const forgotSubmit = document.getElementById("forgotSubmit");
const forgotCloseBtn = document.getElementById("forgotCloseBtn");

function renderChecklist() {
  const pw = forgotPassword.value;
  const user = forgotUsername.value.trim().toLowerCase();
  const rows = [
    { ok: pw.length >= MIN_PASSWORD, text: `Al menos ${MIN_PASSWORD} caracteres (puedes usar una frase con espacios)` },
    { ok: !(user.length >= 3 && pw.toLowerCase().includes(user)), text: "No incluye el nombre de usuario" }
  ];
  forgotChecklist.textContent = "";
  rows.forEach((r) => {
    const li = document.createElement("li");
    li.textContent = r.text;
    if (pw) li.className = r.ok ? "ok" : "bad";
    forgotChecklist.appendChild(li);
  });
}

function formatCode(raw) {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  return clean.replace(/(.{4})(?=.)/g, "$1-");
}

function openForgot() {
  forgotError.hidden = true;
  forgotCode.value = "";
  forgotPassword.value = "";
  forgotUsername.value = loginUsername.value.trim();
  renderChecklist();
  forgotModal.hidden = false;
  (forgotUsername.value ? forgotCode : forgotUsername).focus();
}

function closeForgot() {
  forgotModal.hidden = true;
  forgotCode.value = "";
  forgotPassword.value = "";
  forgotBtn.focus();
}

async function submitForgot(e) {
  e.preventDefault();
  if (forgotSubmit.disabled) return;
  forgotError.hidden = true;
  const username = forgotUsername.value.trim();
  const code = forgotCode.value.trim();
  const password = forgotPassword.value;
  if (!username || !code || !password) {
    forgotError.textContent = "Completa el usuario, el código y la contraseña nueva.";
    forgotError.hidden = false;
    return;
  }
  forgotSubmit.disabled = true;
  forgotSubmit.textContent = "Cambiando...";
  try {
    const response = await fetch("/auth/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, code, password })
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) {
      forgotError.textContent = data.error || "No se pudo cambiar la contraseña.";
      forgotError.hidden = false;
      return;
    }
    loginUsername.value = username;
    loginPassword.value = "";
    loginError.hidden = true;
    const left = typeof data.remaining === "number" ? data.remaining : null;
    loginOk.textContent = "Contraseña cambiada. Ya puedes iniciar sesión con la nueva." +
      (left !== null && left <= 2 ? ` Te quedan ${left} código(s): genera nuevos al entrar.` : "");
    loginOk.hidden = false;
    closeForgot();
    loginPassword.focus();
  } catch {
    forgotError.textContent = "Error de conexión. Si el servidor estaba en reposo, espera unos segundos e intenta de nuevo.";
    forgotError.hidden = false;
  } finally {
    forgotSubmit.disabled = false;
    forgotSubmit.textContent = "Cambiar contraseña";
  }
}

forgotBtn.addEventListener("click", openForgot);
forgotCloseBtn.addEventListener("click", closeForgot);
forgotModal.addEventListener("click", (e) => { if (e.target === forgotModal) closeForgot(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !forgotModal.hidden) closeForgot(); });
forgotForm.addEventListener("submit", submitForgot);
forgotCode.addEventListener("input", () => { forgotCode.value = formatCode(forgotCode.value); });
forgotPassword.addEventListener("input", renderChecklist);
forgotUsername.addEventListener("input", renderChecklist);
forgotToggle.addEventListener("click", () => {
  const show = forgotPassword.type === "password";
  forgotPassword.type = show ? "text" : "password";
  forgotToggle.textContent = show ? "Ocultar" : "Mostrar";
});
