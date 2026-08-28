import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { setupAuthCookieSync } from "./auth-sync.js";

const SUPABASE_URL = "https://wojinjaczmwlojihoebp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndvamluamFjem13bG9qaWhvZWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwODQ2MzgsImV4cCI6MjEwMjY2MDYzOH0.VY5RVZVJMgDoYl-4BoAwe4h0IrKoHv_wJvpMdSjVdr4";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
setupAuthCookieSync(supabase);

async function guardSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "/login";
    return null;
  }
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", session.user.id).single();
  const adminLink = document.getElementById("adminLink");
  if (profile && profile.is_admin && adminLink) adminLink.hidden = false;
  return session;
}

async function authFetch(url, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "/login";
    throw new Error("Sesión expirada.");
  }
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${session.access_token}` };
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    await supabase.auth.signOut();
    window.location.href = "/login";
    throw new Error("Sesión expirada.");
  }
  return response;
}

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "/login";
});

const sessionReady = guardSession();

const emptyItem = () => ({ subserie: "", descripcion: "", folio: "" });
const emptyPage = () => ({
  id: "",
  caja: "12",
  cod_serie: "",
  sobre: "",
  codigo: "TESO - 01",
  seccion: "TESORERIA",
  serie_doc: "COMPROBANTE DE PAGO",
  items: [emptyItem()],
  fecha_inicio: "",
  fecha_final: "",
  anio: "2019"
});

let pages = [];
let current = 0;
let searchQuery = "";
let lastDeleted = null;
let undoTimer = null;
let dragFromIndex = null;

const form = document.getElementById("pageForm");
const pagesList = document.getElementById("pagesList");
const currentNumber = document.getElementById("currentNumber");
const totalPagesEl = document.getElementById("totalPages");
const pageCount = document.getElementById("pageCount");
const statusEl = document.getElementById("status");
const statusIconEl = document.getElementById("statusIconEl");
const statusTextEl = document.getElementById("statusTextEl");
const itemsContainer = document.getElementById("itemsContainer");
const pageSearch = document.getElementById("pageSearch");

const confirmModal = document.getElementById("confirmModal");
const confirmMessage = document.getElementById("confirmMessage");
const confirmOkBtn = document.getElementById("confirmOkBtn");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");

const previewModal = document.getElementById("previewModal");
const previewTableWrap = document.getElementById("previewTableWrap");
const previewBtn = document.getElementById("previewBtn");
const previewCloseBtn = document.getElementById("previewCloseBtn");

const undoToast = document.getElementById("undoToast");
const undoMessage = document.getElementById("undoMessage");
const undoBtn = document.getElementById("undoBtn");

function setStatus(text, icon) {
  if (statusIconEl) statusIconEl.textContent = icon || "";
  if (statusTextEl) statusTextEl.textContent = text;
  else statusEl.textContent = text;
}

function showConfirm(message) {
  return new Promise((resolve) => {
    confirmMessage.textContent = message;
    confirmModal.hidden = false;
    confirmOkBtn.focus();

    const cleanup = (result) => {
      confirmModal.hidden = true;
      confirmOkBtn.removeEventListener("click", onOk);
      confirmCancelBtn.removeEventListener("click", onCancel);
      confirmModal.removeEventListener("click", onOverlayClick);
      document.removeEventListener("keydown", onKeydown);
      resolve(result);
    };

    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onOverlayClick = (e) => { if (e.target === confirmModal) cleanup(false); };
    const onKeydown = (e) => {
      if (e.key === "Escape") cleanup(false);
      if (e.key === "Enter") cleanup(true);
    };

    confirmOkBtn.addEventListener("click", onOk);
    confirmCancelBtn.addEventListener("click", onCancel);
    confirmModal.addEventListener("click", onOverlayClick);
    document.addEventListener("keydown", onKeydown);
  });
}

function showUndoToast(message) {
  clearTimeout(undoTimer);
  undoMessage.textContent = message;
  undoToast.hidden = false;
  undoTimer = setTimeout(() => {
    undoToast.hidden = true;
    lastDeleted = null;
  }, 6000);
}

undoBtn.addEventListener("click", async () => {
  if (!lastDeleted) return;
  clearTimeout(undoTimer);
  undoToast.hidden = true;

  if (lastDeleted.type === "single") {
    pages.splice(lastDeleted.index, 0, lastDeleted.page);
    current = lastDeleted.index;
  } else if (lastDeleted.type === "clear") {
    pages = lastDeleted.pages;
    current = 0;
  }
  lastDeleted = null;

  await persist();
  fillForm(pages[current]);
  renderPages();
});

async function fetchPages() {
  const response = await authFetch("/paginas");
  if (!response.ok) throw new Error("No se pudieron cargar las páginas.");
  const data = await response.json();
  return Array.isArray(data.pages) ? data.pages : [];
}

async function persist() {
  setStatus("Guardando...", "💾");
  try {
    const response = await authFetch("/paginas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pages })
    });
    if (!response.ok) throw new Error("Error al guardar");
    setStatus("Guardado en la nube", "✅");
  } catch (err) {
    setStatus("⚠ Error al guardar (revisa tu conexión)", "⚠️");
  }
}

function normalizePage(page) {
  const items = Array.isArray(page.items) && page.items.length
    ? page.items.map(item => ({
        subserie: item.subserie ?? "",
        descripcion: item.descripcion ?? "",
        folio: item.folio ?? ""
      }))
    : [{
        subserie: page.subserie ?? "",
        descripcion: page.descripcion ?? "",
        folio: page.folio ?? ""
      }];

  return {
    id: page.id ?? "",
    caja: page.caja ?? "12",
    cod_serie: page.cod_serie ?? "",
    sobre: page.sobre ?? "",
    codigo: page.codigo ?? "TESO - 01",
    seccion: page.seccion ?? "TESORERIA",
    serie_doc: page.serie_doc ?? "COMPROBANTE DE PAGO",
    items,
    fecha_inicio: page.fecha_inicio ?? "",
    fecha_final: page.fecha_final ?? "",
    anio: page.anio ?? "2019"
  };
}

function collectFormData() {
  const data = {
    id: form.elements.id.value,
    caja: form.elements.caja.value,
    cod_serie: form.elements.cod_serie.value,
    sobre: form.elements.sobre.value,
    codigo: form.elements.codigo.value,
    seccion: form.elements.seccion.value,
    serie_doc: form.elements.serie_doc.value,
    fecha_inicio: form.elements.fecha_inicio.value,
    fecha_final: form.elements.fecha_final.value,
    anio: form.elements.anio.value,
    items: []
  };

  itemsContainer.querySelectorAll(".item-card").forEach(card => {
    data.items.push({
      subserie: card.querySelector('[data-field="subserie"]').value,
      descripcion: card.querySelector('[data-field="descripcion"]').value,
      folio: card.querySelector('[data-field="folio"]').value
    });
  });

  if (!data.items.length) data.items.push(emptyItem());
  return data;
}

async function saveCurrent() {
  pages[current] = collectFormData();
  await persist();
  renderPages();
}

function addItem(item = emptyItem()) {
  const card = document.createElement("div");
  card.className = "item-card";
  card.innerHTML = `
    <div class="item-card-header">
      <strong>Cuadro <span class="item-number"></span></strong>
      <button type="button" class="remove-item secondary">Eliminar</button>
    </div>
    <div class="item-grid">
      <label>Sub serie
        <input data-field="subserie" autocomplete="off" value="">
      </label>
      <label>Folio
        <input data-field="folio" autocomplete="off" value="">
      </label>
      <label class="item-description">Descripción
        <textarea data-field="descripcion" rows="5" placeholder="Descripción que aparecerá en el cuadro del Word..."></textarea>
      </label>
    </div>
  `;

  card.querySelector('[data-field="subserie"]').value = item.subserie ?? "";
  card.querySelector('[data-field="folio"]').value = item.folio ?? "";
  card.querySelector('[data-field="descripcion"]').value = item.descripcion ?? "";

  card.querySelector(".remove-item").addEventListener("click", async () => {
    const cards = itemsContainer.querySelectorAll(".item-card");
    if (cards.length === 1) {
      card.querySelectorAll("input, textarea").forEach(input => input.value = "");
    } else {
      card.remove();
    }
    renumberItems();
    await saveCurrent();
  });

  card.querySelectorAll("input, textarea").forEach(input => {
    input.addEventListener("input", handleFormInput);
  });

  itemsContainer.appendChild(card);
  renumberItems();
}

function renumberItems() {
  itemsContainer.querySelectorAll(".item-card").forEach((card, index) => {
    card.querySelector(".item-number").textContent = index + 1;
  });
}

function fillForm(data) {
  data = normalizePage(data);
  form.elements.id.value = data.id;
  form.elements.caja.value = data.caja;
  form.elements.cod_serie.value = data.cod_serie;
  form.elements.sobre.value = data.sobre;
  form.elements.codigo.value = data.codigo;
  form.elements.seccion.value = data.seccion;
  form.elements.serie_doc.value = data.serie_doc;
  form.elements.fecha_inicio.value = data.fecha_inicio;
  form.elements.fecha_final.value = data.fecha_final;
  form.elements.anio.value = data.anio;

  itemsContainer.innerHTML = "";
  data.items.forEach(item => addItem(item));
  currentNumber.textContent = current + 1;
  totalPagesEl.textContent = pages.length;
}

function pageMatchesSearch(page, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const items = (page.items && page.items.length) ? page.items : [emptyItem()];
  const subseries = items.map(it => it.subserie || "").join(" ");
  const haystack = [page.sobre || "", subseries].join(" ").toLowerCase();
  return haystack.includes(q);
}

function renderPages() {
  pageCount.textContent = pages.length;
  totalPagesEl.textContent = pages.length;
  pagesList.innerHTML = "";

  const dragEnabled = searchQuery === "";

  pages.forEach((rawPage, index) => {
    const page = normalizePage(rawPage);
    if (!pageMatchesSearch(page, searchQuery)) return;

    const button = document.createElement("button");
    button.className = "page-item" + (index === current ? " active" : "");
    button.type = "button";
    button.draggable = dragEnabled;

    const firstItem = page.items[0] || emptyItem();
    const title = document.createElement("strong");
    title.textContent = `Página ${index + 1}${page.sobre ? " · Sobre " + page.sobre : ""}`;

    const description = document.createElement("small");
    const desc = firstItem.descripcion || "Sin descripción";
    description.textContent = `${firstItem.subserie ? firstItem.subserie + " · " : ""}${desc}${page.items.length > 1 ? ` · +${page.items.length - 1} cuadro(s)` : ""}`;

    const removeBtn = document.createElement("span");
    removeBtn.textContent = "✕";
    removeBtn.className = "page-remove";
    removeBtn.title = "Eliminar esta página";
    removeBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (pages.length === 1) {
        const ok = await showConfirm("¿Vaciar el contenido de esta página?");
        if (!ok) return;
        pages[0] = emptyPage();
        lastDeleted = null;
      } else {
        const ok = await showConfirm(`¿Eliminar la página ${index + 1}?`);
        if (!ok) return;
        const [removed] = pages.splice(index, 1);
        lastDeleted = { type: "single", page: removed, index };
        showUndoToast(`Página ${index + 1} eliminada.`);
        if (current >= pages.length) current = pages.length - 1;
        else if (index < current) current--;
      }
      await persist();
      fillForm(pages[current]);
      renderPages();
    });

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "flex-start";
    const textWrap = document.createElement("div");
    textWrap.append(title, description);
    row.append(textWrap, removeBtn);

    button.appendChild(row);
    button.addEventListener("click", async () => {
      await saveCurrent();
      current = index;
      fillForm(pages[current]);
      renderPages();
    });

    if (dragEnabled) {
      button.addEventListener("dragstart", () => {
        dragFromIndex = index;
        button.classList.add("dragging");
      });
      button.addEventListener("dragend", () => {
        button.classList.remove("dragging");
      });
      button.addEventListener("dragover", (e) => {
        e.preventDefault();
        button.classList.add("drag-over");
      });
      button.addEventListener("dragleave", () => {
        button.classList.remove("drag-over");
      });
      button.addEventListener("drop", async (e) => {
        e.preventDefault();
        button.classList.remove("drag-over");
        if (dragFromIndex === null || dragFromIndex === index) return;

        const [moved] = pages.splice(dragFromIndex, 1);
        pages.splice(index, 0, moved);

        if (current === dragFromIndex) current = index;
        else if (dragFromIndex < current && index >= current) current--;
        else if (dragFromIndex > current && index <= current) current++;

        dragFromIndex = null;
        await persist();
        fillForm(pages[current]);
        renderPages();
      });
    }

    pagesList.appendChild(button);
  });
}

pageSearch.addEventListener("input", () => {
  searchQuery = pageSearch.value.trim();
  renderPages();
});

function handleFormInput() {
  pages[current] = collectFormData();
  setStatus("Guardando...", "💾");
  clearTimeout(window.saveTimer);
  window.saveTimer = setTimeout(async () => {
    await persist();
    renderPages();
  }, 500);
}

form.querySelectorAll("input, textarea").forEach(input => input.addEventListener("input", handleFormInput));

document.getElementById("addItemBtn").addEventListener("click", async () => {
  addItem();
  await saveCurrent();
});

document.getElementById("nextBtn").addEventListener("click", async () => {
  await saveCurrent();
  if (current === pages.length - 1) pages.push(emptyPage());
  current++;
  fillForm(pages[current]);
  renderPages();
});

document.getElementById("prevBtn").addEventListener("click", async () => {
  await saveCurrent();
  if (current > 0) {
    current--;
    fillForm(pages[current]);
    renderPages();
  }
});

document.getElementById("newPageBtn").addEventListener("click", async () => {
  await saveCurrent();
  pages.push(emptyPage());
  current = pages.length - 1;
  fillForm(pages[current]);
  renderPages();
});

document.getElementById("duplicatePageBtn").addEventListener("click", async () => {
  pages[current] = collectFormData();
  const copy = JSON.parse(JSON.stringify(pages[current]));
  pages.splice(current + 1, 0, copy);
  current = current + 1;
  await persist();
  fillForm(pages[current]);
  renderPages();
});

document.getElementById("deletePageBtn").addEventListener("click", async () => {
  if (pages.length === 1) {
    const ok = await showConfirm("¿Vaciar el contenido de esta página?");
    if (!ok) return;
    pages[0] = emptyPage();
    lastDeleted = null;
    await persist();
    fillForm(pages[0]);
    renderPages();
    return;
  }

  const ok = await showConfirm(`¿Eliminar la página ${current + 1}? Esta acción no se puede deshacer.`);
  if (!ok) return;

  const [removed] = pages.splice(current, 1);
  lastDeleted = { type: "single", page: removed, index: current };
  showUndoToast(`Página ${current + 1} eliminada.`);
  if (current >= pages.length) current = pages.length - 1;

  await persist();
  fillForm(pages[current]);
  renderPages();
});

document.getElementById("clearAllBtn").addEventListener("click", async () => {
  const ok = await showConfirm("¿Borrar TODAS las páginas y empezar un documento nuevo desde cero? Esta acción no se puede deshacer.");
  if (!ok) return;

  lastDeleted = { type: "clear", pages: pages.map(normalizePage) };
  showUndoToast("Se borraron todas las páginas.");

  pages = [emptyPage()];
  current = 0;

  await persist();
  fillForm(pages[0]);
  renderPages();
});

function buildPreviewTable() {
  const rows = pages.map((raw, i) => {
    const p = normalizePage(raw);
    const foliosResumen = p.items.map(it => it.folio || "-").join(", ");
    const descResumen = p.items.map(it => it.descripcion || "-").join(" | ");
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${p.sobre || "-"}</td>
        <td>${p.id || "-"}</td>
        <td>${p.seccion || "-"}</td>
        <td>${p.fecha_inicio || "-"} → ${p.fecha_final || "-"}</td>
        <td>${foliosResumen}</td>
        <td>${descResumen}</td>
      </tr>
    `;
  }).join("");

  return `
    <table class="preview-table">
      <thead>
        <tr>
          <th>#</th><th>Sobre</th><th>ID</th><th>Sección</th><th>Fechas</th><th>Folio(s)</th><th>Descripción</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

previewBtn.addEventListener("click", async () => {
  await saveCurrent();
  previewTableWrap.innerHTML = buildPreviewTable();
  previewModal.hidden = false;
});

previewCloseBtn.addEventListener("click", () => { previewModal.hidden = true; });
previewModal.addEventListener("click", (e) => { if (e.target === previewModal) previewModal.hidden = true; });

async function downloadWord() {
  await saveCurrent();
  const validPages = pages.filter(p => {
    const items = Array.isArray(p.items) ? p.items : [];
    return [p.id, p.caja, p.cod_serie, p.sobre, p.codigo, p.seccion, p.serie_doc, p.fecha_inicio, p.fecha_final, p.anio]
      .some(v => String(v ?? "").trim() !== "") || items.some(i => Object.values(i).some(v => String(v ?? "").trim() !== ""));
  });

  if (!validPages.length) {
    alert("Agrega al menos una página.");
    return;
  }

  const response = await authFetch("/generar", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ pages: validPages, filename: "documento_pangoa.docx" })
  });

  if (!response.ok) {
    let message = "No se pudo generar el documento.";
    try {
      const data = await response.json();
      message = data.error || message;
    } catch {}
    alert(message);
    return;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "documento_pangoa.docx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.getElementById("downloadBtn").addEventListener("click", downloadWord);
document.getElementById("downloadBtn2").addEventListener("click", downloadWord);

document.getElementById("saveJsonBtn").addEventListener("click", async () => {
  await saveCurrent();
  const blob = new Blob([JSON.stringify({ pages }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "respaldo_pangoa.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

document.getElementById("loadJsonInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.pages) || !data.pages.length) throw new Error("El respaldo no contiene páginas.");
    pages = data.pages.map(normalizePage);
    current = 0;
    fillForm(pages[0]);
    await persist();
    renderPages();
    alert("Respaldo cargado y guardado en la nube correctamente.");
  } catch (error) {
    alert("No se pudo cargar el respaldo: " + error.message);
  }
  event.target.value = "";
});

async function init() {
  setStatus("Cargando...", "⏳");
  try {
    pages = await fetchPages();
  } catch {
    pages = [];
    setStatus("⚠ No se pudo conectar. Intenta recargar la página.", "⚠️");
    return;
  }

  if (!pages.length) pages = [emptyPage()];
  pages = pages.map(normalizePage);
  current = 0;

  fillForm(pages[current]);
  renderPages();
  setStatus("Guardado en la nube", "✅");
}

sessionReady.then((session) => { if (session) init(); });


/* ==========================================================
   IMPORTAR DESDE EXCEL
   ========================================================== */

const importModal = document.getElementById("importModal");
const importStep1 = document.getElementById("importStep1");
const importStep2 = document.getElementById("importStep2");
const importPickFileBtn = document.getElementById("importPickFileBtn");
const importFileStatus = document.getElementById("importFileStatus");
const importCajaSelect = document.getElementById("importCajaSelect");
const importSummary = document.getElementById("importSummary");
const importPreviewWrap = document.getElementById("importPreviewWrap");
const importWarnings = document.getElementById("importWarnings");
const excelFileInput = document.getElementById("excelFileInput");

let importedByCaja = new Map();
let importSkippedRows = 0;

function normalizeHeader(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findColumns(rows) {
  const targets = {
    subserie: ["n de cp", "n° de cp", "n de c p"],
    descripcion: ["asunto"],
    fecha: ["fecha/ano", "fecha/año", "fecha"],
    folio: ["folios", "folio"],
    sobre: ["n de sobre", "n° de sobre"],
    caja: ["n de caja", "n° de caja"]
  };
  const found = {};
  const maxScanRows = Math.min(12, rows.length);

  for (let r = 0; r < maxScanRows; r++) {
    const row = rows[r] || [];
    row.forEach((cell, c) => {
      const norm = normalizeHeader(cell);
      if (!norm) return;
      for (const key in targets) {
        if (found[key] !== undefined) continue;
        if (targets[key].some(t => norm === normalizeHeader(t))) {
          found[key] = c;
        }
      }
    });
  }
  return found;
}

function extractSubserieNumber(value) {
  const str = String(value ?? "").trim();
  const match = str.match(/^C\.?\s*P\.?\s*N[°º]?\.?\s*(.+)$/i);
  if (match) return match[1].trim();

  const fallback = str.match(/([\w-]+)\s*$/);
  return fallback ? fallback[1].trim() : str;
}

function excelDateToYMD(value) {
  let d = null;
  if (value instanceof Date) {
    d = value;
  } else if (typeof value === "string") {
    const m = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  }
  if (!d || isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseExcelToPages(rows) {
  const cols = findColumns(rows);
  const required = ["subserie", "descripcion", "fecha", "folio", "sobre", "caja"];
  const missing = required.filter(k => cols[k] === undefined);
  if (missing.length) {
    throw new Error("No se encontraron las columnas: " + missing.join(", ") + ". Revisa que el Excel tenga el formato esperado.");
  }

  let dataStartRow = 0;
  for (let r = 0; r < Math.min(12, rows.length); r++) {
    const row = rows[r] || [];
    const hasAny = Object.values(cols).some(c => normalizeHeader(row[c]) !== "" && normalizeHeader(row[c]) !== undefined);
    if (hasAny) dataStartRow = r + 1;
  }

  const byCaja = new Map();
  importSkippedRows = 0;

  for (let r = dataStartRow; r < rows.length; r++) {
    const row = rows[r] || [];
    const cajaVal = row[cols.caja];
    const sobreVal = row[cols.sobre];
    const folioVal = row[cols.folio];
    const subserieVal = row[cols.subserie];
    const descVal = row[cols.descripcion];
    const fechaVal = row[cols.fecha];

    const cajaNum = Number(cajaVal);
    const sobreNum = Number(sobreVal);

    if (!cajaVal || !sobreVal || isNaN(cajaNum) || isNaN(sobreNum)) {
      if (row.some(c => c !== null && c !== undefined && String(c).trim() !== "")) {
        importSkippedRows++;
      }
      continue;
    }

    const ymd = excelDateToYMD(fechaVal);

    if (!byCaja.has(cajaNum)) byCaja.set(cajaNum, new Map());
    const sobresMap = byCaja.get(cajaNum);
    if (!sobresMap.has(sobreNum)) sobresMap.set(sobreNum, { items: [], fechas: [] });
    const grupo = sobresMap.get(sobreNum);

    grupo.items.push({
      subserie: extractSubserieNumber(subserieVal),
      descripcion: String(descVal || "").trim(),
      folio: String(folioVal ?? "").trim()
    });
    if (ymd) grupo.fechas.push(ymd);
  }

  const result = new Map();
  for (const [caja, sobresMap] of byCaja.entries()) {
    const sobresOrdenados = Array.from(sobresMap.keys()).sort((a, b) => a - b);
    const pages = sobresOrdenados.map(sobreNum => {
      const grupo = sobresMap.get(sobreNum);
      const fechasOrdenadas = grupo.fechas.slice().sort();
      const fechaInicio = fechasOrdenadas[0] || "";
      const fechaFinal = fechasOrdenadas[fechasOrdenadas.length - 1] || "";
      const anio = fechaInicio ? fechaInicio.slice(0, 4) : (fechaFinal ? fechaFinal.slice(0, 4) : "");

      return {
        id: "",
        caja: String(caja),
        cod_serie: "",
        sobre: String(sobreNum),
        codigo: "TESO - 01",
        seccion: "TESORERIA",
        serie_doc: "COMPROBANTE DE PAGO",
        items: grupo.items,
        fecha_inicio: fechaInicio,
        fecha_final: fechaFinal,
        anio: anio
      };
    });
    result.set(caja, pages);
  }

  return result;
}

function renderImportPreview(cajaPages) {
  const totalItems = cajaPages.reduce((sum, p) => sum + p.items.length, 0);
  importSummary.textContent = `Se generarán ${cajaPages.length} página(s) con ${totalItems} comprobante(s) en total.`;

  const rowsHtml = cajaPages.slice(0, 8).map(p => `
    <tr>
      <td>Sobre ${p.sobre}</td>
      <td>${p.items.length} cuadro(s)</td>
      <td>${p.fecha_inicio || "-"} → ${p.fecha_final || "-"}</td>
      <td>${p.items[0] ? p.items[0].descripcion.slice(0, 70) + (p.items[0].descripcion.length > 70 ? "…" : "") : "-"}</td>
    </tr>
  `).join("");

  importPreviewWrap.innerHTML = `
    <table class="preview-table">
      <thead><tr><th>Página</th><th>Cuadros</th><th>Fechas</th><th>Primer comprobante</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    ${cajaPages.length > 8 ? `<p class="help-text">... y ${cajaPages.length - 8} página(s) más.</p>` : ""}
  `;

  importWarnings.textContent = importSkippedRows > 0
    ? `⚠️ Se omitieron ${importSkippedRows} fila(s) que no correspondían a datos válidos (encabezados o filas vacías).`
    : "";
}

function openImportModal() {
  importStep1.hidden = false;
  importStep2.hidden = true;
  importFileStatus.textContent = "";
  importModal.hidden = false;
}

document.getElementById("importExcelBtn").addEventListener("click", openImportModal);
document.getElementById("importCloseBtn").addEventListener("click", () => { importModal.hidden = true; });
importModal.addEventListener("click", (e) => { if (e.target === importModal) importModal.hidden = true; });

importPickFileBtn.addEventListener("click", () => excelFileInput.click());

excelFileInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  importFileStatus.textContent = "Leyendo archivo...";

  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

    importedByCaja = parseExcelToPages(rows);

    if (importedByCaja.size === 0) {
      importFileStatus.textContent = "No se encontraron datos válidos en el archivo.";
      return;
    }

    const cajasOrdenadas = Array.from(importedByCaja.keys()).sort((a, b) => a - b);
    importCajaSelect.innerHTML = cajasOrdenadas.map(caja => {
      const n = importedByCaja.get(caja).length;
      return `<option value="${caja}">Caja ${caja} (${n} página(s))</option>`;
    }).join("");

    importFileStatus.textContent = `Archivo leído: ${cajasOrdenadas.length} caja(s) encontradas.`;
    importStep1.hidden = true;
    importStep2.hidden = false;

    renderImportPreview(importedByCaja.get(cajasOrdenadas[0]));
  } catch (err) {
    console.error(err);
    importFileStatus.textContent = "Error al leer el archivo: " + err.message;
  }

  event.target.value = "";
});

importCajaSelect.addEventListener("change", () => {
  const caja = Number(importCajaSelect.value);
  renderImportPreview(importedByCaja.get(caja));
});

async function commitImport(mode) {
  const caja = Number(importCajaSelect.value);
  const cajaPages = importedByCaja.get(caja);
  if (!cajaPages || !cajaPages.length) return;

  if (mode === "replace") {
    const ok = await showConfirm(`Esto reemplazará TODAS las páginas actuales por las ${cajaPages.length} páginas de la Caja ${caja}. ¿Continuar?`);
    if (!ok) return;
    pages = cajaPages.map(p => JSON.parse(JSON.stringify(p)));
    current = 0;
  } else {
    pages = pages.concat(cajaPages.map(p => JSON.parse(JSON.stringify(p))));
    current = pages.length - cajaPages.length;
  }

  await persist();
  fillForm(pages[current]);
  renderPages();
  importModal.hidden = true;
}

document.getElementById("importReplaceBtn").addEventListener("click", () => commitImport("replace"));
document.getElementById("importAppendBtn").addEventListener("click", () => commitImport("append"));

function buildCurrentIndexForCaja(caja) {
  const map = new Map();
  pages.forEach(rawP => {
    const p = normalizePage(rawP);
    if (String(p.caja).trim() !== String(caja).trim()) return;
    const key = String(p.sobre).trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  });
  return map;
}

function diffCajaPages(caja, excelPages) {
  const currentMap = buildCurrentIndexForCaja(caja);
  const excelMap = new Map(excelPages.map(p => [String(p.sobre), p]));
  const allSobres = new Set([...currentMap.keys(), ...excelMap.keys()]);
  const sobresSorted = Array.from(allSobres).sort((a, b) => Number(a) - Number(b));

  const issues = [];

  sobresSorted.forEach(sobre => {
    const excelPage = excelMap.get(sobre);
    const currentPagesForSobre = currentMap.get(sobre) || [];

    if (!excelPage && currentPagesForSobre.length) {
      issues.push({ sobre, detail: `Existe en la página web pero no aparece en el Excel para esta caja.` });
      return;
    }
    if (excelPage && !currentPagesForSobre.length) {
      issues.push({ sobre, detail: `Está en el Excel (${excelPage.items.length} comprobante(s)) pero no existe en la página web.` });
      return;
    }
    if (currentPagesForSobre.length > 1) {
      issues.push({ sobre, detail: `Aparece ${currentPagesForSobre.length} veces en la página web (debería ser una sola página).` });
    }

    const currentPage = currentPagesForSobre[0];
    if (!currentPage) return;

    if ((currentPage.fecha_inicio || "") !== (excelPage.fecha_inicio || "")) {
      issues.push({ sobre, detail: `Fecha inicio: web="${currentPage.fecha_inicio || "-"}" vs excel="${excelPage.fecha_inicio || "-"}"` });
    }
    if ((currentPage.fecha_final || "") !== (excelPage.fecha_final || "")) {
      issues.push({ sobre, detail: `Fecha final: web="${currentPage.fecha_final || "-"}" vs excel="${excelPage.fecha_final || "-"}"` });
    }
    if ((currentPage.anio || "") !== (excelPage.anio || "")) {
      issues.push({ sobre, detail: `Año: web="${currentPage.anio || "-"}" vs excel="${excelPage.anio || "-"}"` });
    }

    if (currentPage.items.length !== excelPage.items.length) {
      issues.push({ sobre, detail: `Cantidad de cuadros distinta: web=${currentPage.items.length}, excel=${excelPage.items.length}.` });
    }

    const maxLen = Math.max(currentPage.items.length, excelPage.items.length);
    for (let i = 0; i < maxLen; i++) {
      const wi = currentPage.items[i];
      const ei = excelPage.items[i];
      if (!wi || !ei) continue;

      if ((wi.subserie || "") !== (ei.subserie || "")) {
        issues.push({ sobre, detail: `Cuadro ${i + 1}: sub serie web="${wi.subserie || "-"}" vs excel="${ei.subserie || "-"}"` });
      }
      if ((wi.folio || "") !== (ei.folio || "")) {
        issues.push({ sobre, detail: `Cuadro ${i + 1}: folio web="${wi.folio || "-"}" vs excel="${ei.folio || "-"}"` });
      }
      if ((wi.descripcion || "").trim() !== (ei.descripcion || "").trim()) {
        issues.push({ sobre, detail: `Cuadro ${i + 1}: la descripción no coincide exactamente con el Excel.` });
      }
    }
  });

  return issues;
}

function renderDiffReport(caja, excelPages) {
  const wrap = document.getElementById("importDiffWrap");
  const issues = diffCajaPages(caja, excelPages);

  if (!issues.length) {
    wrap.innerHTML = `<p style="color:#1d7b45; font-weight:650; margin-top:10px;">✅ Todo coincide exactamente entre el Excel y lo que ya está guardado para la Caja ${caja}.</p>`;
    return;
  }

  const rows = issues.map(i => `<tr><td>Sobre ${i.sobre}</td><td>${i.detail}</td></tr>`).join("");
  wrap.innerHTML = `
    <p style="color:#c0392b; font-weight:650; margin-top:10px;">⚠️ Se encontraron ${issues.length} diferencia(s) en la Caja ${caja}:</p>
    <table class="preview-table">
      <thead><tr><th>Página</th><th>Detalle</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

document.getElementById("importVerifyBtn").addEventListener("click", () => {
  const caja = Number(importCajaSelect.value);
  const cajaPages = importedByCaja.get(caja);
  if (!cajaPages) return;
  renderDiffReport(caja, cajaPages);
});

const themeToggleBtn = document.getElementById("themeToggleBtn");

function initTheme() {
  const saved = localStorage.getItem("pangoa_theme");
  const theme = saved === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  themeToggleBtn.textContent = theme === "dark" ? "☀️" : "🌙";
}

themeToggleBtn.addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("pangoa_theme", next);
  themeToggleBtn.textContent = next === "dark" ? "☀️" : "🌙";
});

initTheme();
