import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { setupAuthCookieSync } from "./auth-sync.js";

const SUPABASE_URL = "https://wojinjaczmwlojihoebp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvamluamFjem13bG9qaWhvZWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwODQ2MzgsImV4cCI6MjEwMjY2MDYzOH0.VY5RVZVJMgDoYl-4BoAwe4h0IrKoHv_wJvpMdSjVdr4";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
setupAuthCookieSync(supabase);

const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");

async function redirectIfAlreadyLogged() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) window.location.href = "/";
}
redirectIfAlreadyLogged();

async function doLogin() {
  loginError.hidden = true;
  const username = loginUsername.value.trim();
  const password = loginPassword.value;
  if (!username || !password) {
    loginError.textContent = "Ingresa tu usuario y contraseña.";
    loginError.hidden = false;
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
      loginError.textContent = data.error || "Usuario o contraseña incorrectos.";
      loginError.hidden = false;
      loginBtn.disabled = false;
      loginBtn.textContent = "Ingresar";
      return;
    }
    const { error } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token
    });
    if (error) {
      loginError.textContent = "No se pudo iniciar sesión.";
      loginError.hidden = false;
      loginBtn.disabled = false;
      loginBtn.textContent = "Ingresar";
      return;
    }
    window.location.href = "/";
  } catch (e) {
    loginError.textContent = "Error de conexión. Intenta de nuevo.";
    loginError.hidden = false;
    loginBtn.disabled = false;
    loginBtn.textContent = "Ingresar";
  }
}

loginBtn.addEventListener("click", doLogin);
loginPassword.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
loginUsername.addEventListener("keydown", (e) => { if (e.key === "Enter") loginPassword.focus(); });
