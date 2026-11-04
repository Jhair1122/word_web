// Revisión de hojas: calcula cómo saldrá cada página en el Word (misma tabla que la plantilla), avisa si se desborda,
// permite corregir el texto en una vista a escala, dividir las hojas que no caben y confirmar antes de descargar.
// Las medidas salen de la plantilla real: fila de cuadro = 67.6 pt como mínimo (la celda del folio trae 6 párrafos),
// 13.52 pt por línea de descripción (Calibri 11 pt, 411 pt de ancho útil) y el bloque de fechas debajo de la tabla.
// El cálculo se contrastó con LibreOffice (misma métrica que Calibri); en Word puede diferir unos puntos, por eso hay un margen.

const L = {
  ROW_MIN: 67.6, LINE: 13.52, TEXT_W: 410.5, BUDGET: 205,          // BUDGET: alto máximo (pt) de las filas de cuadros en una hoja
  TOP: 205.4, LEFT: 49.4, TW: 524.5, COLS: [63.7, 422.45, 38.35],
  HEAD: [14.2, 14.2, 27.5, 27.5, 23.4, 19.9, 22.1, 22.2],
  PAGE_W: 612, PAGE_H: 792, BODY_BOTTOM: 763.6, TAIL: 177.5
};
const MAX_SHORT = 200, MAX_DESC = 3000;

// Ancho de cada carácter en Calibri/Carlito (milésimas de em)
const GROUPS = {0:"­",221:"'",226:"  ",230:"ilìíîï",239:"j",246:"¹",250:",‘’",252:".I·ÌÍÎÏ",268:":;",291:"`",292:"´",303:"()",305:"f",306:"-",307:"[]¸",314:"{}",319:"J",326:"!¡",334:"³",335:"t",336:"²",339:"°",349:"r",386:"/\\",391:"s",393:"¨",394:"¯",395:"z",401:"\"",402:"ª",418:"“”",420:"L",422:"º",423:"cç",433:"x",452:"v",453:"yýÿ",455:"k",459:"FS",460:"|",463:"?¿",468:"Z",471:"g",479:"aàáâãäå",487:"TYÝ",488:"EÈÉÊË",498:"#*+<=>^_e~¢¤¦§¬±×èéêë÷–•",507:"$0123456789£¥®€",512:"«»",517:"PÞ",519:"X",520:"K",525:"bdhnpquðñùúûüþ",527:"oßòóôõö",529:"ø",533:"CÇ",543:"R",544:"B",550:"µ",567:"V",579:"AÀÁÂÃÄÅ",586:"¶",615:"D",623:"H",625:"Ð",631:"G",636:"¼",642:"UÙÚÛÜ",646:"NÑ",662:"OÒÓÔÕÖ",664:"Ø",671:"½",673:"Q",675:"¾",682:"&",690:"…",715:"%w",763:"Æ",773:"æ",799:"m",834:"©",855:"M",890:"W",894:"@",905:"—"};
const CW = {};
for (const [w, s] of Object.entries(GROUPS)) for (const ch of s) CW[ch] = +w;
const DEF_W = 525;
const strW = (s, pt = 11) => { let t = 0; for (const ch of s) t += CW[ch] || DEF_W; return t / 1000 * pt; };

export function textLines(text, width = L.TEXT_W) {
  const tokens = String(text ?? "").replace(/[\r\n\t]+/g, " ").split(" ");
  const sp = strW(" ");
  let lines = 1, cur = 0, first = true;
  for (const tk of tokens) {
    const w = strW(tk);
    if (first) { first = false; }
    else if (cur + sp + w <= width) { cur += sp; }
    else { lines++; cur = 0; }
    if (w > width) {                                   // palabra más larga que la línea: se corta por letras
      let acc = cur;
      for (const ch of tk) { const cw = (CW[ch] || DEF_W) / 1000 * 11; if (acc + cw > width) { lines++; acc = 0; } acc += cw; }
      cur = acc;
    } else cur += w;
  }
  return lines;
}

export const itemsOf = (p) => (Array.isArray(p.items) && p.items.length) ? p.items
  : [{ subserie: p.subserie ?? "", descripcion: p.descripcion ?? "", folio: p.folio ?? "" }];
export const rowPitch = (it) => Math.max(L.ROW_MIN, textLines(it.descripcion) * L.LINE);

export function pageFit(p) {
  const items = itemsOf(p), pitches = items.map(rowPitch), total = pitches.reduce((a, b) => a + b, 0);
  let fits = 0, acc = 0;
  for (const h of pitches) { if (acc + h > L.BUDGET) break; acc += h; fits++; }
  const tooLong = pitches.map((h, i) => h > L.BUDGET ? i : -1).filter(i => i >= 0);
  return { items, pitches, total, fits, over: total > L.BUDGET, tooLong, pct: Math.round(total / L.BUDGET * 100),
    tableBottom: L.TOP + L.HEAD.reduce((a, b) => a + b, 0) + total };
}

// Reparte los cuadros en hojas que sí caben (mismos datos de cabecera en cada una).
export function splitPage(p) {
  const items = itemsOf(p), chunks = [];
  let cur = [], acc = 0;
  for (const it of items) {
    const h = rowPitch(it);
    if (cur.length && acc + h > L.BUDGET) { chunks.push(cur); cur = []; acc = 0; }
    cur.push(it); acc += h;
  }
  if (cur.length) chunks.push(cur);
  return chunks.map(c => ({ ...JSON.parse(JSON.stringify({ ...p, items: undefined })), items: JSON.parse(JSON.stringify(c)) }));
}

export function overflowing(pages) {
  const out = [];
  pages.forEach((p, i) => { if (pageFit(p).over) out.push(i); });
  return out;
}

// ---------------------------------------------------------------- vista a escala
function fmtDate(v) {
  v = String(v ?? "").trim(); if (!v) return "";
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return v;
}
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const HEAD_ROWS = [["ID:", "id"], ["N° DE CAJA", "caja"], ["COD. SERIE:", "cod_serie"], ["N° DE SOBRE", "sobre"], ["CÓDIGO:", "codigo"], ["SECCIÓN:", "seccion"], ["SERIE DOC.", "serie_doc"]];

function sheetHtml(p, fit, logo) {
  const T = L.TOP; let y = T, h = "";
  const cell = (x, yy, w, hh, inner, cls = "") => `<div class="sh-cell ${cls}" style="left:${x}px;top:${yy}px;width:${w}px;height:${hh}px">${inner}</div>`;
  const [c0, c1, c2] = L.COLS, x0 = L.LEFT, x1 = x0 + c0, x2 = x1 + c1;
  HEAD_ROWS.forEach(([label, field], i) => {
    const hh = L.HEAD[i];
    h += cell(x0, y, c0, hh, `<span class="sh-lab">${label}</span>`) +
         cell(x1, y, c1 + c2, hh, `<span class="sh-val sh-edit" data-k="f" data-field="${field}">${esc(p[field])}</span>`);
    y += hh;
  });
  const hh = L.HEAD[7];
  h += cell(x0, y, c0, hh, `<span class="sh-lab">SUB SERIE</span>`) + cell(x1, y, c1, hh, `<span class="sh-lab">DESCRIPCIÓN</span>`) + cell(x2, y, c2, hh, `<span class="sh-lab">FOLIO</span>`);
  y += hh;
  fit.items.forEach((it, i) => {
    const ph = fit.pitches[i], bad = (y + ph - T) > (L.BUDGET + L.HEAD.reduce((a, b) => a + b, 0)) ? " sh-bad" : "";
    h += cell(x0, y, c0, ph, `<span class="sh-sub sh-edit" data-k="i" data-i="${i}" data-field="subserie">${esc(it.subserie)}</span>`, bad) +
         cell(x1, y, c1, ph, `<span class="sh-desc sh-edit" data-k="i" data-i="${i}" data-field="descripcion" style="top:${(ph - textLines(it.descripcion) * L.LINE) / 2}px">${esc(it.descripcion)}</span>`, bad) +
         cell(x2, y, c2, ph, `<span class="sh-fol sh-edit" data-k="i" data-i="${i}" data-field="folio">${esc(it.folio)}</span>`, bad);
    y += ph;
  });
  const tb = y; // borde inferior de la tabla
  const d1 = fmtDate(p.fecha_inicio), d2 = fmtDate(p.fecha_final), yr = String(p.anio ?? "");
  h += `<div class="sh-tail" style="top:${tb}px">` +
    `<span class="sh-lab sh-abs" style="left:35.8px;top:113px">FECHA INICIO:</span><span class="sh-box" style="left:104.6px;top:108px;width:86px">${esc(d1)}</span>` +
    `<span class="sh-lab sh-abs" style="left:294.2px;top:113px">FECHA FINAL:</span><span class="sh-box" style="left:373.2px;top:108px;width:85px">${esc(d2)}</span>` +
    `<span class="sh-lab sh-abs" style="left:35.8px;top:135.5px">FECHAS EXTREMAS:</span><span class="sh-box" style="left:130.6px;top:133px;width:85px">${esc(yr)}</span>` +
    `<span class="sh-arce sh-abs" style="left:379.2px;top:158px">ARCE 2026</span></div>`;
  const tailBottom = tb + L.TAIL, over = tailBottom > L.BODY_BOTTOM;
  return { html: `<div class="sh-frame"></div><div class="sh-title">MUNICIPALIDAD DISTRITAL DE PANGOA</div><img class="sh-logo" src="${logo}" alt="">${h}` +
    (over ? `<div class="sh-limit" style="top:${L.BODY_BOTTOM}px"><span>límite de la hoja</span></div>` : ""), over, tailBottom };
}

function caretOffset(el) {
  const sel = window.getSelection(); if (!sel.rangeCount || !el.contains(sel.anchorNode)) return null;
  const r = sel.getRangeAt(0).cloneRange(); r.selectNodeContents(el); r.setEnd(sel.anchorNode, sel.anchorOffset); return r.toString().length;
}
function setCaret(el, off) {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n, left = off;
  while ((n = w.nextNode())) { if (left <= n.nodeValue.length) { const r = document.createRange(); r.setStart(n, left); r.collapse(true); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); return; } left -= n.nodeValue.length; }
  const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
}

export function createSheetReview({ getPages, onEdited, onSplit, logo, scale = 0.56 }) {
  let host = null, summary = null, timer = 0;

  function status(fit, over) {
    if (fit.tooLong.length) return { cls: "bad", txt: `Una descripción es demasiado larga para una hoja (cuadro ${fit.tooLong[0] + 1}). Acórtala.` };
    if (over) return { cls: "bad", txt: `Se desborda: ${fit.items.length} cuadros, en esta hoja caben ${fit.fits}.` };
    return { cls: "ok", txt: `Entra bien · ${Math.min(100, fit.pct)} % de la hoja` };
  }

  function render() {
    if (!host) return;
    const pages = getPages(), focus = document.activeElement;
    let keep = null;
    if (focus && focus.classList && focus.classList.contains("sh-edit")) {
      const card = focus.closest(".sheet-card");
      keep = { pi: +card.dataset.i, k: focus.dataset.k, i: focus.dataset.i, f: focus.dataset.field, off: caretOffset(focus) };
    }
    host.innerHTML = "";
    const avail = host.clientWidth - 8 - 24;
    const k = Math.max(0.3, Math.min(scale, avail > 0 ? avail / L.PAGE_W : scale));
    let bad = 0;
    pages.forEach((p, pi) => {
      const fit = pageFit(p), sh = sheetHtml(p, fit, logo), st = status(fit, fit.over || sh.over);
      if (st.cls === "bad") bad++;
      const card = document.createElement("div"); card.className = "sheet-card" + (st.cls === "bad" ? " is-bad" : ""); card.dataset.i = pi;
      const chunks = fit.over ? splitPage(p).length : 0;
      card.innerHTML = `<div class="sheet-card-head"><div><b>Hoja ${pi + 1}</b><span> · Sobre ${esc(p.sobre || "—")}</span></div>` +
        `<span class="sheet-badge ${st.cls}">${esc(st.txt)}</span></div>` +
        (fit.over && !fit.tooLong.length ? `<button type="button" class="secondary sm sheet-split">Dividir en ${chunks} hojas</button>` : "") +
        `<div class="sheet-scale" style="--k:${k};width:${L.PAGE_W * k}px;height:${Math.max(L.PAGE_H, sh.tailBottom + 14) * k}px"><div class="sheet-paper">${sh.html}</div></div>`;
      host.appendChild(card);
    });
    if (summary) {
      summary.className = "review-summary " + (bad ? "bad" : "ok");
      summary.innerHTML = bad
        ? `<span><b>${bad} hoja(s) no caben tal como están</b> y saldrían desacomodadas en el Word. Puedes editar el texto aquí mismo o dividirlas.</span>` +
          ` <button type="button" class="primary sm" id="reviewSplitAll">Dividir todas las que no caben</button>`
        : `<span><b>Todas las hojas caben</b> y saldrán ordenadas en el Word. Haz clic en cualquier texto de la hoja para corregirlo.</span>`;
      const b = summary.querySelector("#reviewSplitAll"); if (b) b.addEventListener("click", () => onSplit(overflowing(getPages())));
    }
    if (keep) {
      const card = host.querySelector(`.sheet-card[data-i="${keep.pi}"]`);
      const el = card && card.querySelector(keep.k === "f" ? `.sh-edit[data-k="f"][data-field="${keep.f}"]` : `.sh-edit[data-k="i"][data-i="${keep.i}"][data-field="${keep.f}"]`);
      if (el) { el.focus(); if (keep.off != null) setCaret(el, keep.off); }
    }
  }

  function attach(hostEl, summaryEl) {
    host = hostEl; summary = summaryEl;
    const plain = ("contentEditable" in document.createElement("div")) ? "plaintext-only" : "true";
    host.addEventListener("click", (e) => {
      const b = e.target.closest(".sheet-split"); if (b) onSplit([+b.closest(".sheet-card").dataset.i]);
    });
    host.addEventListener("focusin", (e) => { const t = e.target; if (t.classList && t.classList.contains("sh-edit") && !t.isContentEditable) t.setAttribute("contenteditable", plain); });
    host.addEventListener("mouseover", (e) => { const t = e.target; if (t.classList && t.classList.contains("sh-edit") && !t.hasAttribute("contenteditable")) { t.setAttribute("contenteditable", plain); t.setAttribute("tabindex", "0"); } });
    host.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.classList && e.target.classList.contains("sh-edit")) { e.preventDefault(); e.target.blur(); } });
    host.addEventListener("paste", (e) => {
      const t = e.target; if (!t.classList || !t.classList.contains("sh-edit")) return;
      e.preventDefault(); const txt = (e.clipboardData.getData("text/plain") || "").replace(/[\r\n]+/g, " ");
      document.execCommand("insertText", false, txt);
    });
    host.addEventListener("input", (e) => {
      const t = e.target; if (!t.classList || !t.classList.contains("sh-edit")) return;
      const pi = +t.closest(".sheet-card").dataset.i, p = getPages()[pi]; if (!p) return;
      const max = t.dataset.field === "descripcion" ? MAX_DESC : MAX_SHORT;
      let v = t.textContent.replace(/[\r\n]+/g, " "); if (v.length > max) v = v.slice(0, max);
      if (t.dataset.k === "f") p[t.dataset.field] = v;
      else { if (!Array.isArray(p.items) || !p.items.length) p.items = itemsOf(p).map(x => ({ ...x })); const it = p.items[+t.dataset.i]; if (it) it[t.dataset.field] = v; }
      clearTimeout(timer); timer = setTimeout(() => { onEdited(pi); render(); }, 450);
    });
  }
  return { attach, render, flush: () => { clearTimeout(timer); } };
}

// Aviso antes de descargar cuando hay hojas que no caben. Devuelve "split" | "review" | "force" | null.
export function askFit(modal, count) {
  return new Promise((resolve) => {
    const msg = modal.querySelector("#fitMessage"), bSplit = modal.querySelector("#fitSplitBtn"), bRev = modal.querySelector("#fitReviewBtn"), bForce = modal.querySelector("#fitForceBtn");
    msg.textContent = count === 1
      ? "Una hoja tiene más cuadros (o texto) de los que caben y saldría desacomodada en el Word. ¿Qué quieres hacer?"
      : `${count} hojas tienen más cuadros (o texto) de los que caben y saldrían desacomodadas en el Word. ¿Qué quieres hacer?`;
    modal.hidden = false; bSplit.focus();
    const done = (v) => { modal.hidden = true; bSplit.onclick = bRev.onclick = bForce.onclick = null; modal.onclick = null; document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") done(null); };
    bSplit.onclick = () => done("split"); bRev.onclick = () => done("review"); bForce.onclick = () => done("force");
    modal.onclick = (e) => { if (e.target === modal) done(null); };
    document.addEventListener("keydown", onKey);
  });
}
