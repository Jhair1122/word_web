const STORAGE_KEY = "pangoa_word_pages_v1";

const emptyPage = () => ({
  id: "",
  caja: "12",
  cod_serie: "",
  sobre: "",
  codigo: "TESO - 01",
  seccion: "TESORERIA",
  serie_doc: "COMPROBANTE DE PAGO",
  descripcion: "",
  folio: "",
  fecha_inicio: "",
  fecha_final: "",
  anio: "2019"
});

let pages = loadPages();
let current = 0;

if (!pages.length) pages = [emptyPage()];

const form = document.getElementById("pageForm");
const pagesList = document.getElementById("pagesList");
const currentNumber = document.getElementById("currentNumber");
const pageCount = document.getElementById("pageCount");
const statusEl = document.getElementById("status");

function loadPages() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
  statusEl.textContent = "Guardado localmente";
}

function getFormData() {
  return Object.fromEntries(new FormData(form).entries());
}

function fillForm(data) {
  for (const [name, value] of Object.entries(data)) {
    const input = form.elements[name];
    if (input) input.value = value ?? "";
  }
  currentNumber.textContent = current + 1;
}

function saveCurrent() {
  pages[current] = getFormData();
  persist();
  renderPages();
}

function renderPages() {
  pageCount.textContent = pages.length;
  pagesList.innerHTML = "";

  pages.forEach((page, index) => {
    const button = document.createElement("button");
    button.className = "page-item" + (index === current ? " active" : "");
    button.type = "button";

    const title = document.createElement("strong");
    title.textContent = `Página ${index + 1}${page.sobre ? " · Sobre " + page.sobre : ""}`;

    const description = document.createElement("small");
    description.textContent =
      page.descripcion ||
      [page.codigo, page.folio, page.anio].filter(Boolean).join(" · ") ||
      "Sin datos todavía";

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

document.getElementById("nextBtn").addEventListener("click", () => {
  saveCurrent();

  if (current === pages.length - 1) {
    pages.push(emptyPage());
  }

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

form.addEventListener("input", () => {
  pages[current] = getFormData();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
  statusEl.textContent = "Guardando...";
  clearTimeout(window.saveTimer);
  window.saveTimer = setTimeout(() => {
    statusEl.textContent = "Guardado localmente";
    renderPages();
  }, 250);
});

async function downloadWord() {
  saveCurrent();

  const validPages = pages.filter(p =>
    Object.values(p).some(v => String(v ?? "").trim() !== "")
  );

  if (!validPages.length) {
    alert("Agrega al menos una página.");
    return;
  }

  const response = await fetch("/generar", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      pages: validPages,
      filename: "documento_pangoa.docx"
    })
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
  const blob = new Blob(
    [JSON.stringify({pages}, null, 2)],
    {type: "application/json"}
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "respaldo_pangoa.json";
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("loadJsonInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.pages) || !data.pages.length) {
      throw new Error("El respaldo no contiene páginas.");
    }

    pages = data.pages;
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
