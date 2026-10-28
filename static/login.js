import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm";
import { setupAuthCookieSync } from "./auth-sync.js";

const SUPABASE_URL = "https://wojinjaczmwlojihoebp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvamluamFjem13bG9qaWhvZWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwODQ2MzgsImV4cCI6MjEwMjY2MDYzOH0.VY5RVZVJMgDoYl-4BoAwe4h0IrKoHv_wJvpMdSjVdr4";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
setupAuthCookieSync(supabase);

const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");
const showPassword = document.getElementById("showPassword");

async function redirectIfAlreadyLogged() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) window.location.href = "/";
}
redirectIfAlreadyLogged();

function showError(message) {
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
