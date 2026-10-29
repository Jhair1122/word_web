// Códigos de recuperación de contraseña (parte del usuario conectado).
// Genera 8 códigos de un solo uso, pidiendo la contraseña actual, y avisa si faltan.
export function initRecovery({ authFetch, showToast }) {
  const $ = (id) => document.getElementById(id);
  const modal = $("recoveryModal");
  if (!modal) return;
  const openBtn = $("recoveryOpenBtn");
  const closeBtn = $("recoveryCloseBtn");
  const intro = $("recoveryIntro");
  const result = $("recoveryResult");
  const statusEl = $("recoveryStatus");
  const form = $("recoveryForm");
  const pwInput = $("recoveryPassword");
  const errorBox = $("recoveryError");
  const genBtn = $("recoveryGenerateBtn");
  const list = $("recoveryList");
  const copyBtn = $("recoveryCopyBtn");
  const dlBtn = $("recoveryDownloadBtn");
  const doneBtn = $("recoveryDoneBtn");
  const banner = $("recoveryBanner");
  const bannerText = $("recoveryBannerText");
  const bannerBtn = $("recoveryBannerBtn");
  const bannerClose = $("recoveryBannerClose");

  let codes = [];
  let lastFocus = null;
  let status = { available: true, remaining: 0 };

  async function loadStatus() {
    try {
      const res = await authFetch("/auth/recovery-status");
      if (!res.ok) return;
      status = await res.json();
    } catch { return; }
    updateBanner();
  }

  function updateBanner() {
    let dismissed = false;
    try { dismissed = sessionStorage.getItem("pangoa_recovery_banner") === "1"; } catch {}
    if (!status.available || dismissed) { banner.hidden = true; return; }
    if (status.remaining === 0) {
      bannerText.textContent = "Genera tus códigos de recuperación: te permitirán crear una contraseña nueva si la olvidas.";
      banner.hidden = false;
    } else if (status.remaining <= 2) {
      bannerText.textContent = `Te quedan ${status.remaining} código(s) de recuperación. Genera nuevos antes de que se acaben.`;
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
  }

  function renderStatus() {
    if (!status.available) {
      statusEl.textContent = "Esta función aún no está activada en el servidor. Pide al administrador que la habilite.";
      form.hidden = true;
      return;
    }
    form.hidden = false;
    statusEl.textContent = status.remaining > 0
      ? `Tienes ${status.remaining} código(s) sin usar.`
      : "Aún no tienes códigos de recuperación.";
  }

  function showStage(stage) {
    intro.hidden = stage !== "intro";
    result.hidden = stage !== "result";
    closeBtn.hidden = stage === "result"; // al ver los códigos solo se cierra con "Ya los guardé"
  }

  async function openModal() {
    lastFocus = document.activeElement;
    errorBox.hidden = true;
    pwInput.value = "";
    showStage("intro");
    modal.hidden = false;
    statusEl.textContent = "Consultando...";
    await loadStatus();
    renderStatus();
    if (!form.hidden) pwInput.focus();
  }

  function closeModal() {
    modal.hidden = true;
    codes = [];
    list.textContent = "";
    pwInput.value = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  async function generate(e) {
    e.preventDefault();
    if (genBtn.disabled) return;
    errorBox.hidden = true;
    if (!pwInput.value) {
      errorBox.textContent = "Escribe tu contraseña actual.";
      errorBox.hidden = false;
      pwInput.focus();
      return;
    }
    genBtn.disabled = true;
    genBtn.textContent = "Generando...";
    try {
      const res = await authFetch("/auth/recovery-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwInput.value })
      });
      let data = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) {
        errorBox.textContent = data.error || "No se pudieron generar los códigos.";
        errorBox.hidden = false;
        return;
      }
      codes = Array.isArray(data.codes) ? data.codes : [];
      list.textContent = "";
      codes.forEach((c) => { const li = document.createElement("li"); li.textContent = c; list.appendChild(li); });
      pwInput.value = "";
      status = { available: true, remaining: codes.length };
      showStage("result");
      doneBtn.focus();
    } catch {
      errorBox.textContent = "Error de conexión. Intenta de nuevo.";
      errorBox.hidden = false;
    } finally {
      genBtn.disabled = false;
      genBtn.textContent = "Generar códigos nuevos";
    }
  }

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      showToast("Códigos copiados. Pégalos en un lugar privado.", "success");
    } catch {
      showToast("No se pudo copiar. Usa 'Descargar .txt' o anótalos.", "error");
    }
  }

  function downloadCodes() {
    const text = [
      "Códigos de recuperación - Generador de sobres (Municipalidad Distrital de Pangoa)",
      "Cada código sirve UNA sola vez. Guarda este archivo en un lugar privado.",
      "Para usarlos: en la pantalla de inicio de sesión elige 'He olvidado mi contraseña'.",
      "",
      ...codes
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "codigos-recuperacion-pangoa.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  openBtn.addEventListener("click", openModal);
  bannerBtn.addEventListener("click", openModal);
  bannerClose.addEventListener("click", () => {
    banner.hidden = true;
    try { sessionStorage.setItem("pangoa_recovery_banner", "1"); } catch {}
  });
  closeBtn.addEventListener("click", closeModal);
  form.addEventListener("submit", generate);
  copyBtn.addEventListener("click", copyCodes);
  dlBtn.addEventListener("click", downloadCodes);
  doneBtn.addEventListener("click", () => { closeModal(); updateBanner(); });
  modal.addEventListener("click", (e) => { if (e.target === modal && result.hidden) closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden && result.hidden) closeModal();
  });

  loadStatus();
}
