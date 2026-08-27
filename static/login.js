import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://wojinjaczmwlojihoebp.supabase.co";
const SUPABASE_ANON_KEY = "TU_ANON_KEY_AQUI";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const loginEmail = document.getElementById("loginEmail");
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
  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  if (!email || !password) {
    loginError.textContent = "Ingresa tu correo y contraseña.";
    loginError.hidden = false;
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = "Ingresando...";

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  loginBtn.disabled = false;
  loginBtn.textContent = "Ingresar";

  if (error) {
    loginError.textContent = "Correo o contraseña incorrectos.";
    loginError.hidden = false;
    return;
  }

  window.location.href = "/";
}

loginBtn.addEventListener("click", doLogin);
loginPassword.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
loginEmail.addEventListener("keydown", (e) => { if (e.key === "Enter") loginPassword.focus(); });
