const STORAGE_KEY = "pangoa_word_pages_v2";

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

let pages = loadPages();
let current = 0;

if (!pages.length) pages = [emptyPage()];
pages = pages.map(normalizePage);

const form = document.getElementById("pageForm");
const pagesList = document.getElementById("pagesList");
const currentNumber = document.getElementById("currentNumber");
const pageCount = document.getElementById("pageCount");
const statusEl = document.getElementById("status");
const itemsContainer = document.getElementById("itemsContainer");

function loadPages() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("pangoa_word_pages_v1");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
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

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
  statusEl.textContent = "Guardado localmente";
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

function saveCurrent() {
  pages[current] = collectFormData();
  persist();
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

  card.querySelector(".remove-item").addEventListener("click", () => {
    const cards = itemsContainer.querySelectorAll(".item-card");
    if (cards.length === 1) {
      card.querySelectorAll("input, textarea").forEach(input => input.value = "");
    } else {
      card.remove();
    }
    renumberItems();
    saveCurrent();
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
}

function renderPages() {
  pageCount.textContent = pages.length;
  pagesList.innerHTML = "";

  pages.forEach((page, index) => {
    page = normalizePage(page);
    const button = document.createElement("button");
    button.className = "page-item" + (index === current ? " active" : "");
    button.type = "button";

    const firstItem = page.items[0] || emptyItem();
    const title = document.createElement("strong");
    title.textContent = `Página ${index + 1}${page.sobre ? " · Sobre " + page.sobre : ""}`;

    const description = document.createElement("small");
    const desc = firstItem.descripcion || "Sin descripción";
    description.textContent = `${firstItem.subserie ? firstItem.subserie + " · " : ""}${desc}${page.items.length > 1 ? ` · +${page.items.length - 1} cuadro(s)` : ""}`;

    button.append(title, description);
    button.addEventListener("click", () => {
      saveCurrent();
      current = index;
      fillForm(pages[current]);
      renderPages();
    });

    pagesList.appendChild(button);
  });
}

function handleFormInput() {
  pages[current] = collectFormData();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
  statusEl.textContent = "Guardando...";
  clearTimeout(window.saveTimer);
  window.saveTimer = setTimeout(() => {
    statusEl.textContent = "Guardado localmente";
    renderPages();
  }, 250);
}

form.querySelectorAll("input, textarea").forEach(input => input.addEventListener("input", handleFormInput));
document.getElementById("addItemBtn").addEventListener("click", () => {
  addItem();
  saveCurrent();
});

document.getElementById("nextBtn").addEventListener("click", () => {
  saveCurrent();
  if (current === pages.length - 1) pages.push(emptyPage());
  current++;
  fillForm(pages[current]);
  renderPages();
});

document.getElementById("prevBtn").addEventListener("click", () => {
  saveCurrent();
  if (current > 0) {
    current--;
    fillForm(pages[current]);
    renderPages();
  }
});

document.getElementById("newPageBtn").addEventListener("click", () => {
  saveCurrent();
  pages.push(emptyPage());
  current = pages.length - 1;
  fillForm(pages[current]);
  renderPages();
});

async function downloadWord() {
  saveCurrent();
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

document.getElementById("saveJsonBtn").addEventListener("click", () => {
  saveCurrent();
  const blob = new Blob([JSON.stringify({pages}, null, 2)], {type: "application/json"});
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
    persist();
    renderPages();
    alert("Respaldo cargado correctamente.");
  } catch (error) {
    alert("No se pudo cargar el respaldo: " + error.message);
  }
  event.target.value = "";
});

fillForm(pages[current]);
renderPages();
