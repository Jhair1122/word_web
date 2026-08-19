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
let lastDeleted = null; // { type: 'single' | 'clear', page?, index?, pages? }
let undoTimer = null;

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

const themeToggleBtn = document.getElementById("themeToggleBtn");

/* ---------- Estado / textos ---------- */

const STATUS = {
  loading: { icon: "⏳", text: "Cargando desde la base de datos...", cls: "" },
  saving: { icon: "💾", text: "Guardando en Supabase...", cls: "status-saving" },
  saved: { icon: "✅", text: "Guardado en Supabase", cls: "" },
  error: { icon: "⚠️", text: "Error de conexión — revisa tu internet", cls: "status-error" }
};

function setStatus(key) {
  const s = STATUS[key];
  statusIconEl.textContent = s.icon;
  statusTextEl.textContent = s.text;
  statusEl.className = "status" + (s.cls ? " " + s.cls : "");
}

/* ---------- Tema (preferencia visual local, no son datos del documento) ---------- */

function initTheme() {
  const saved = localStorage.getItem("pangoa_theme");
  const theme = saved === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  themeToggleBtn.textContent = theme === "dark" ? "☀️" : "🌙";
}

themeToggleBtn.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("pangoa_theme", next);
  themeToggleBtn.textContent = next === "dark" ? "☀️" : "🌙";
});

/* ---------- Modal de confirmación ---------- */

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

/* ---------- Deshacer último borrado ---------- */

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

/* ---------- Red / persistencia ---------- */

async function fetchPages() {
  const response = await fetch("/paginas");
  if (!response.ok) throw new Error("No se pudieron cargar las páginas.");
  const data = await response.json();
  return Array.isArray(data.pages) ? data.pages : [];
}

async function persist() {
  setStatus("saving");
  try {
    const response = await fetch("/paginas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pages })
    });
    if (!response.ok) throw new Error("Error al guardar");
    setStatus("saved");
  } catch (err) {
    setStatus("error");
  }
}

/* ---------- Normalización y formulario ---------- */

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

/* ---------- Lista de páginas: buscador + arrastrar para reordenar ---------- */

function pageMatchesSearch(page, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const first = page.items[0] || emptyItem();
  const haystack = [
    page.id, page.sobre, page.cod_serie, page.codigo,
    first.subserie, first.descripcion, first.folio
  ].join(" ").toLowerCase();
  return haystack.includes(q);
}

let dragFromIndex = null;

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

/* ---------- Guardado en tecleo ---------- */

function handleFormInput() {
  pages[current] = collectFormData();
  setStatus("saving");
  clearTimeout(window.saveTimer);
  window.saveTimer = setTimeout(async () => {
    await persist();
    renderPages();
  }, 500);
}

form.querySelectorAll("input, textarea").forEach(input => input.addEventListener("input", handleFormInput));

/* ---------- Botones principales ---------- */

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

/* ---------- Vista previa ---------- */

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

/* ---------- Descargar / respaldo ---------- */

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

  const response = await fetch("/generar", {
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

/* ---------- Inicio ---------- */

async function init() {
  initTheme();
  setStatus("loading");
  try {
    pages = await fetchPages();
  } catch {
    pages = [];
    setStatus("error");
  }

  if (!pages.length) pages = [emptyPage()];
  pages = pages.map(normalizePage);
  current = 0;

  fillForm(pages[current]);
  renderPages();
  if (statusTextEl.textContent === STATUS.loading.text) setStatus("saved");
}

init();
