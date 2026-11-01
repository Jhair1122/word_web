// Decoración navideña (2D, vectorial). Solo visual y decorativa (aria-hidden).
//  - Ninguna figura sigue al ratón. Cada una tiene su animación propia e independiente.
//  - Al hacer clic reaccionan: luces que se encadenan, adornos que repican, regalos que se abren,
//    muñeco de nieve que saluda, árbol que se sacude y trineo que deja caer regalos.
//  - Guirnalda con luces bajo el menú, adornos colgantes, nevada, árbol, regalos, muñeco de nieve y trineo.
// Se activa sola del 1 de noviembre al 6 de enero; la elección de la persona manda siempre.
(function () {
  "use strict";
  var root = document.documentElement;
  var KEY = "pangoa_navidad", HKEY = "pangoa_halloween";
  var NS = "http://www.w3.org/2000/svg";
  var PI = Math.PI;

  // ---------- utilidades ----------
  function guardado() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function guardar(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function enTemporada() { var d = new Date(), m = d.getMonth(), n = d.getDate(); return m === 10 || m === 11 || (m === 0 && n <= 6); }
  function activo() { var g = guardado(); return g === null ? enTemporada() : g === "on"; }
  function animar() { return root.getAttribute("data-fx") === "on"; }
  function S(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function D(cls, parent) { var e = document.createElement("div"); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }
  function svgEl(cls, vb, html, w, h) {
    var s = S("svg", { viewBox: vb, class: cls, focusable: "false", "aria-hidden": "true" });
    if (w) s.setAttribute("width", w); if (h) s.setAttribute("height", h);
    s.innerHTML = html; return s;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function seeded(s) { return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  var objs = [], raf = 0, lastT = 0, timers = [];
  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
  var dbg = { bulbs: 0, hangs: 0, snow: 0, clicks: 0, sleigh: { flying: false, x: 0, y: 0 }, bubble: "" };

  // ---------- colores y degradados compartidos ----------
  var BULBS = [["#ff7b7b", "#d1242f"], ["#ffe08a", "#e9a21b"], ["#7ee7a3", "#1f9d57"], ["#8fd3ff", "#1d78c9"], ["#ffb3e0", "#d1459a"]];
  var DEFS = (function () {
    var s = '<svg class="xm-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>';
    BULBS.forEach(function (c, i) { s += '<radialGradient id="xmB' + i + '" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="' + c[0] + '"/><stop offset="1" stop-color="' + c[1] + '"/></radialGradient>'; });
    s += '<linearGradient id="xmGreenH" x1="0" x2="1"><stop offset="0" stop-color="#175f3f"/><stop offset=".5" stop-color="#37a768"/><stop offset="1" stop-color="#145a3b"/></linearGradient>' +
      '<linearGradient id="xmGreenV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fae6a"/><stop offset="1" stop-color="#1b6b43"/></linearGradient>' +
      '<linearGradient id="xmGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0a8"/><stop offset=".5" stop-color="#f5c04a"/><stop offset="1" stop-color="#c98a14"/></linearGradient>' +
      '<radialGradient id="xmRed" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#ff8a8a"/><stop offset=".45" stop-color="#e03545"/><stop offset="1" stop-color="#8f1424"/></radialGradient>' +
      '<linearGradient id="xmRedH" x1="0" x2="1"><stop offset="0" stop-color="#b81d2e"/><stop offset=".45" stop-color="#ee4458"/><stop offset="1" stop-color="#a11828"/></linearGradient>' +
      '<linearGradient id="xmBlueH" x1="0" x2="1"><stop offset="0" stop-color="#2a6fd0"/><stop offset=".45" stop-color="#5aa4f5"/><stop offset="1" stop-color="#245fb4"/></linearGradient>' +
      '<linearGradient id="xmGreenBox" x1="0" x2="1"><stop offset="0" stop-color="#1c7a4e"/><stop offset=".45" stop-color="#43b97b"/><stop offset="1" stop-color="#176a43"/></linearGradient>' +
      '<linearGradient id="xmBrown" x1="0" x2="1"><stop offset="0" stop-color="#5e3a1e"/><stop offset=".5" stop-color="#9a6234"/><stop offset="1" stop-color="#583519"/></linearGradient>' +
      '<linearGradient id="xmDeer" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9763f"/><stop offset="1" stop-color="#7d4825"/></linearGradient>' +
      '<radialGradient id="xmSnowBall" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#eef4fc"/><stop offset="1" stop-color="#bccce3"/></radialGradient>' +
      '<linearGradient id="xmCarrot" x1="0" x2="1"><stop offset="0" stop-color="#ffb04a"/><stop offset="1" stop-color="#e2641a"/></linearGradient>' +
      '<linearGradient id="xmHat" x1="0" x2="1"><stop offset="0" stop-color="#1c1c26"/><stop offset=".5" stop-color="#454556"/><stop offset="1" stop-color="#17171f"/></linearGradient>' +
      '<linearGradient id="xmBeam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff3b0" stop-opacity=".95"/><stop offset="1" stop-color="#fff3b0" stop-opacity="0"/></linearGradient>' +
      '<radialGradient id="xmGlowG" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6c4" stop-opacity=".95"/><stop offset="1" stop-color="#ffd25a" stop-opacity="0"/></radialGradient>' +
      '<filter id="xmBlur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3.2"/></filter>' +
      '</defs></svg>';
    return s;
  })();

  // ======================================================================
  //  Efectos: chispas, confeti, globos de texto
  // ======================================================================
  var fxBox = null;
  var FRASES = ["¡Feliz Navidad!", "¡Felices fiestas!", "Paz y alegría", "¡Que se cumplan tus deseos!", "¡Próspero Año Nuevo!", "¡Ho, ho, ho!"];
  var CONF = ["#e03545", "#f5c04a", "#37a768", "#5aa4f5", "#ff8fd0", "#fff"];
  function burst(x, y, o) {
    if (!fxBox || !animar()) return;
    o = o || {}; var n = o.n || 10, kind = o.kind || "star", i;
    for (i = 0; i < n; i++) {
      var p = D(kind === "conf" ? "xm-c" : "xm-p", fxBox), a = Math.random() * PI * 2, r = (kind === "conf" ? 40 : 26) + Math.random() * (kind === "conf" ? 70 : 40);
      p.style.left = x + "px"; p.style.top = y + "px";
      p.style.setProperty("--dx", (Math.cos(a) * r).toFixed(0) + "px");
      p.style.setProperty("--dy", (Math.sin(a) * r - (kind === "conf" ? 40 : 6)).toFixed(0) + "px");
      p.style.setProperty("--r", (Math.random() * 540 - 270).toFixed(0) + "deg");
      var col = kind === "conf" ? CONF[(Math.random() * CONF.length) | 0] : (o.col || ["#fff3b0", "#ffd25a", "#fff", "#ffb3e0"][(Math.random() * 4) | 0]);
      p.style.background = col;
      var sz = kind === "conf" ? 5 + Math.random() * 4 : 6 + Math.random() * 7; p.style.width = sz + "px"; p.style.height = (kind === "conf" ? sz * 1.6 : sz) + "px";
      p.style.animationDuration = (0.8 + Math.random() * 0.6).toFixed(2) + "s";
      (function (el) { later(function () { el.remove(); }, 1600); })(p);
    }
  }
  function centro(el) { var r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r]; }
  function bubble(el, text) {
    if (!fxBox) return;
    var c = centro(el), b = D("xm-bubble", fxBox); b.textContent = text || FRASES[(Math.random() * FRASES.length) | 0]; dbg.bubble = b.textContent;
    b.style.left = clamp(c[0], 90, window.innerWidth - 90) + "px"; b.style.top = Math.max(96, c[2].top - 12) + "px";
    later(function () { b.classList.add("out"); }, 1900); later(function () { b.remove(); }, 2400);
  }
  function pulse(el, cls, ms) { el.classList.remove(cls); void el.getBoundingClientRect(); el.classList.add(cls); later(function () { el.classList.remove(cls); }, ms); }
  function tap(el, fn) {
    el.addEventListener("click", function (e) { e.stopPropagation(); dbg.clicks++; fn(e); });
  }

  // ======================================================================
  //  Guirnalda con luces (curva catenaria, bayas, lazos y focos de colores)
  // ======================================================================
  var bulbs = [];
  function buildGarland(w) {
    var big = w > 900, P = big ? 170 : 120, sag = big ? 26 : 20, y0 = 4, sp = big ? 38 : 32, i;
    function gy(x) { var seg = Math.floor(x / P), t = (x - seg * P) / P; return y0 + 4 * sag * t * (1 - t); }
    var h = y0 + sag + 62, svg = S("svg", { class: "xm-garland", width: w, height: h, viewBox: "0 0 " + w + " " + h, "aria-hidden": "true", focusable: "false" });
    var d = "M0 " + y0, x;
    for (x = 0; x < w + 1; x += P) d += " Q" + (x + P / 2) + " " + (y0 + 2 * sag) + " " + (x + P) + " " + y0;
    S("path", { d: d, fill: "none", stroke: "#0f4a30", "stroke-width": 9, "stroke-linecap": "round", opacity: ".35", transform: "translate(0 1.6)" }, svg);
    S("path", { d: d, fill: "none", stroke: "#1a6b43", "stroke-width": 8, "stroke-linecap": "round" }, svg);
    S("path", { d: d, fill: "none", stroke: "#2f9a5f", "stroke-width": 6, "stroke-linecap": "round", "stroke-dasharray": "1.4 2.4" }, svg);
    S("path", { d: d, fill: "none", stroke: "#58c283", "stroke-width": 2.4, "stroke-linecap": "round", "stroke-dasharray": "1 3.4", transform: "translate(0 -1.6)", opacity: ".8" }, svg);
    var rnd = seeded(9);
    for (x = 20; x < w; x += 44) {                                  // bayas rojas
      var by = gy(x) + 2.5;
      S("circle", { cx: x, cy: by, r: 2.5, fill: "url(#xmRed)" }, svg); S("circle", { cx: x + 4.4, cy: by + 1, r: 2.1, fill: "url(#xmRed)" }, svg);
      S("circle", { cx: x - 0.7, cy: by - 0.8, r: 0.7, fill: "#fff", opacity: ".85" }, svg);
    }
    for (x = 0; x <= w + P; x += P) {                               // lazos en cada anclaje
      var g = S("g", { transform: "translate(" + x + " " + (y0 + 2) + ")" }, svg);
      g.innerHTML = '<path d="M0 0 C-14 -10 -20 4 -8 8 C-4 9 -1 4 0 0Z" fill="url(#xmRedH)"/><path d="M0 0 C14 -10 20 4 8 8 C4 9 1 4 0 0Z" fill="url(#xmRedH)"/>' +
        '<path d="M-2 4 L-9 20 L-3 17 L0 22Z M2 4 L9 20 L3 17 L0 22Z" fill="#b81d2e"/><circle r="3.4" fill="url(#xmRed)"/><circle cx="-1" cy="-1" r="1" fill="#fff" opacity=".7"/>' +
        '<circle cx="-14" cy="6" r="2.4" fill="url(#xmGold)"/><circle cx="14" cy="6" r="2.4" fill="url(#xmGold)"/>';
    }
    bulbs = [];
    var k = 0;
    for (x = sp * 0.7; x < w - 8; x += sp) {
      var near = x % P; if (near < 20 || near > P - 20) continue;
      var c = k % BULBS.length, bg = S("g", { class: "xm-bulb", transform: "translate(" + x.toFixed(1) + " " + (gy(x) + 1).toFixed(1) + ")" }, svg);
      bg.innerHTML = '<circle class="xm-hit" r="15" cy="12" fill="rgba(0,0,0,0)"/><g class="xm-bi"><path d="M0 -1 L0 4" stroke="#1a6b43" stroke-width="1.6"/>' +
        '<rect x="-3" y="3" width="6" height="5" rx="1.2" fill="#b4b9c4"/><rect x="-3.4" y="5.4" width="6.8" height="1" fill="#8f95a3"/>' +
        '<circle class="xm-glow" cy="15" r="13" fill="' + BULBS[c][0] + '" filter="url(#xmBlur)"/>' +
        '<path class="xm-body" d="M-3 8 L3 8 C8.5 12 7.5 20 0 24 C-7.5 20 -8.5 12 -3 8Z" fill="url(#xmB' + c + ')"/>' +
        '<ellipse cx="-2.4" cy="13" rx="1.2" ry="3" fill="#fff" opacity=".7" transform="rotate(14 -2.4 13)"/></g>';
      var glow = bg.querySelector(".xm-glow");
      var dur = (1.5 + rnd() * 2.2).toFixed(2); glow.style.animationDuration = dur + "s"; glow.style.animationDelay = (-rnd() * 3).toFixed(2) + "s";
      var obj = { g: bg, c: c, x: x, y: gy(x) + 18, glow: glow, body: bg.querySelector(".xm-body") };
      bulbs.push(obj); k++;
      (function (o, idx) { tap(o.g, function () { clickBulb(o, idx); }); })(obj, bulbs.length - 1);
    }
    dbg.bulbs = bulbs.length;
    svg._gy = gy;
    return svg;
  }
  function setColor(o) { o.glow.setAttribute("fill", BULBS[o.c][0]); o.body.setAttribute("fill", "url(#xmB" + o.c + ")"); }
  function clickBulb(o, idx) {
    o.c = (o.c + 1) % BULBS.length; setColor(o);
    pulse(o.g, "xm-pop", 650);
    var c = centro(o.g); burst(c[0], c[1] + 6, { n: 7, col: BULBS[o.c][0] });
    bulbs.forEach(function (b, k) { later(function () { pulse(b.g, "xm-flash", 480); }, Math.abs(k - idx) * 55); });
  }

  // ---------- adornos colgantes (bolas, campanas, estrella, bastón de caramelo) ----------
  function hangSvg(kind, L) {
    var rope = '<line x1="22" y1="0" x2="22" y2="' + L + '" stroke="#e9c46a" stroke-width="1.3"/>', y = L, s;
    if (kind === "bell") {
      s = rope + '<g transform="translate(22 ' + (y + 2) + ')"><path d="M-3 -3 C-14 -6 -15 8 -17 15 L17 15 C15 8 14 -6 3 -3Z" fill="url(#xmGold)" stroke="#b7791f" stroke-width=".8"/>' +
        '<path d="M-17 15 Q0 20 17 15 L17 17.5 Q0 23 -17 17.5Z" fill="#d69a1c"/><circle cx="0" cy="22" r="3.2" fill="url(#xmGold)" class="xm-clap"/>' +
        '<ellipse cx="-6" cy="4" rx="2" ry="7" fill="#fff" opacity=".55" transform="rotate(8 -6 4)"/>' +
        '<path d="M0 -3 C-10 -14 -16 -6 -8 -4 M0 -3 C10 -14 16 -6 8 -4" fill="none" stroke="#d1242f" stroke-width="3" stroke-linecap="round"/><circle cy="-3" r="2.6" fill="url(#xmRed)"/></g>';
      return svgEl("xm-hs", "0 0 44 " + (y + 34), s, 44, y + 34);
    }
    if (kind === "star") {
      s = rope + '<g transform="translate(22 ' + (y + 15) + ')"><path d="M0 -17 L4.6 -5.6 L16.8 -5.2 L7.2 2.4 L10.4 14.2 L0 7.4 L-10.4 14.2 L-7.2 2.4 L-16.8 -5.2 L-4.6 -5.6Z" fill="url(#xmGold)" stroke="#c98a14" stroke-width=".9" stroke-linejoin="round"/>' +
        '<path d="M0 -17 L0 7.4 M-16.8 -5.2 L7.2 2.4 M16.8 -5.2 L-7.2 2.4" stroke="#fff" stroke-opacity=".35" stroke-width=".8"/></g>';
      return svgEl("xm-hs", "0 0 44 " + (y + 34), s, 44, y + 34);
    }
    if (kind === "cane") {
      s = rope + '<g transform="translate(22 ' + (y + 2) + ')"><path d="M0 0 L0 24 Q0 34 -9 34 Q-17 34 -17 26" fill="none" stroke="#fff" stroke-width="7.4" stroke-linecap="round"/>' +
        '<path d="M0 0 L0 24 Q0 34 -9 34 Q-17 34 -17 26" fill="none" stroke="#d1242f" stroke-width="7.4" stroke-linecap="round" stroke-dasharray="4.6 4.6"/>' +
        '<path d="M-2 1 L-2 24" stroke="#fff" stroke-opacity=".5" stroke-width="1.2" stroke-linecap="round"/><path d="M-4 -1 C-12 -11 -3 -14 3 -6" fill="none" stroke="#1f9d57" stroke-width="2.4" stroke-linecap="round"/><circle cx="-5" cy="-3" r="2" fill="url(#xmRed)"/></g>';
      return svgEl("xm-hs", "0 0 44 " + (y + 42), s, 44, y + 42);
    }
    var fills = { ballR: "url(#xmRed)", ballG: "url(#xmGold)", ballB: "url(#xmB3)", ballP: "url(#xmB4)" }, f = fills[kind] || fills.ballR;
    s = rope + '<rect x="17" y="' + (y - 1) + '" width="10" height="7" rx="2" fill="url(#xmGold)"/><g transform="translate(22 ' + (y + 22) + ')">' +
      '<circle r="16" fill="' + f + '"/><path d="M-15.6 -3 Q0 5 15.6 -3 L15.4 3 Q0 11 -15.4 3Z" fill="#fff" opacity=".85"/>' +
      '<path d="M-12 -2 L-8 4 L-4 -1 L0 5 L4 -1 L8 4 L12 -2" fill="none" stroke="' + (kind === "ballG" ? "#d1242f" : "#f5c04a") + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<ellipse cx="-6" cy="-8" rx="4" ry="6" fill="#fff" opacity=".55" transform="rotate(25 -6 -8)"/><circle cx="6" cy="9" r="1.6" fill="#fff" opacity=".4"/></g>';
    return svgEl("xm-hs", "0 0 44 " + (y + 42), s, 44, y + 42);
  }
  function buildHangs(layer, w, gy) {
    var big = w > 900, kinds = big ? ["ballR", "bell", "ballG", "star", "ballB", "cane", "ballP", "bell", "ballR"] : ["ballR", "bell", "ballG", "star", "cane"], n = kinds.length, i;
    dbg.hangs = n;
    for (i = 0; i < n; i++) {
      var x = Math.round(w * (0.06 + 0.88 * (i + 0.5) / n)), L = big ? 22 + ((i * 17) % 34) : 12 + ((i * 17) % 18);
      var el = D("xm-hang xm-" + kinds[i], layer); el.style.left = (x - 22) + "px"; el.style.top = (gy(x) + 4) + "px";
      el.style.setProperty("--sw", (2.6 + (i % 4) * 0.7).toFixed(1) + "deg"); el.style.setProperty("--sd", (3.2 + (i % 5) * 0.6).toFixed(1) + "s");
      el.style.animationDelay = (-i * 0.9) + "s";
      el.appendChild(hangSvg(kinds[i], L));
      (function (e, kind) {
        tap(e, function () {
          pulse(e, "xm-ring", 2000); var c = centro(e); burst(c[0], c[1] + 20, { n: 9 });
          if (kind === "bell") bubble(e, "¡Ding, ding!");
        });
      })(el, kinds[i]);
    }
  }

  // ======================================================================
  //  Árbol de Navidad
  // ======================================================================
  function treeSvg() {
    var s = '<ellipse cx="70" cy="182" rx="56" ry="8" fill="rgba(30,50,80,.2)"/><rect x="61" y="150" width="18" height="28" rx="3" fill="url(#xmBrown)"/>' +
      '<path d="M70 70 L126 144 Q112 156 98 146 Q84 158 70 148 Q56 158 42 146 Q28 156 14 144Z" fill="url(#xmGreenH)"/>' +
      '<path d="M70 44 L112 104 Q100 114 88 106 Q79 116 70 108 Q61 116 52 106 Q40 114 28 104Z" fill="url(#xmGreenH)"/>' +
      '<path d="M70 22 L100 66 Q90 74 80 68 Q70 76 60 68 Q50 74 40 66Z" fill="url(#xmGreenH)"/>' +
      '<path d="M14 144 Q28 156 42 146 Q56 158 70 148 Q84 158 98 146 Q112 156 126 144" fill="none" stroke="#0c3d27" stroke-opacity=".5" stroke-width="2"/>' +
      '<path d="M28 104 Q40 114 52 106 Q61 116 70 108 Q79 116 88 106 Q100 114 112 104" fill="none" stroke="#0c3d27" stroke-opacity=".5" stroke-width="2"/>' +
      '<path d="M40 66 Q50 74 60 68 Q70 76 80 68 Q90 74 100 66" fill="none" stroke="#0c3d27" stroke-opacity=".5" stroke-width="2"/>' +
      '<path d="M70 22 L82 40 Q76 37 70 43 Q64 37 58 40Z M70 44 L90 70 Q82 66 76 72 Q70 66 64 72 Q58 66 50 70Z M70 70 L100 108 Q90 104 84 110 Q77 103 70 110 Q63 103 56 110 Q50 104 40 108Z" fill="#fff" opacity=".92"/>' +
      '<path d="M33 98 Q52 110 70 100 T107 98 M22 138 Q46 152 70 140 T118 138 M46 62 Q58 70 70 63 T94 62" fill="none" stroke="url(#xmGold)" stroke-width="2.4" stroke-dasharray="3.4 2.2" stroke-linecap="round"/>';
    var L = [[56, 56], [86, 54], [40, 92], [70, 86], [100, 90], [26, 130], [54, 124], [86, 126], [114, 130], [70, 126]];
    L.forEach(function (p, i) { var c = i % 5; s += '<g class="xm-tl" style="animation-delay:' + (-i * 0.37).toFixed(2) + 's"><circle cx="' + p[0] + '" cy="' + p[1] + '" r="6" fill="' + BULBS[c][0] + '" opacity=".5" filter="url(#xmBlur)"/><circle cx="' + p[0] + '" cy="' + p[1] + '" r="3" fill="url(#xmB' + c + ')"/></g>'; });
    var O = [[76, 48, "#xmGold"], [58, 84, "#xmRed"], [90, 100, "#xmB3"], [42, 124, "#xmGold"], [72, 116, "#xmRed"], [102, 128, "#xmB4"], [64, 56, "#xmB3"]];
    O.forEach(function (p, i) {
      s += '<g class="xm-orn" style="animation-delay:' + (-i * 0.7).toFixed(1) + 's"><rect x="' + (p[0] - 1.6) + '" y="' + (p[1] - 8) + '" width="3.2" height="3" fill="#c98a14"/><circle cx="' + p[0] + '" cy="' + p[1] + '" r="5.2" fill="url(' + p[2] + ')"/><ellipse cx="' + (p[0] - 1.8) + '" cy="' + (p[1] - 2) + '" rx="1.4" ry="2" fill="#fff" opacity=".7"/></g>';
    });
    s += '<g class="xm-star"><circle cx="70" cy="20" r="22" fill="url(#xmGlowG)" class="xm-halo"/><path d="M70 4 L75 15.2 L87.4 16.4 L78 24.6 L80.8 36.8 L70 30.4 L59.2 36.8 L62 24.6 L52.6 16.4 L65 15.2Z" fill="url(#xmGold)" stroke="#c98a14" stroke-width="1" stroke-linejoin="round"/>' +
      '<path d="M70 4 L70 30.4 M52.6 16.4 L80.8 36.8 M87.4 16.4 L59.2 36.8" stroke="#fff" stroke-opacity=".4" stroke-width=".8"/></g>';
    return s;
  }
  function buildTree(cls) {
    var el = D("xm-tree-w " + (cls || "")); el.appendChild(svgEl("xm-tree", "0 0 140 190", treeSvg()));
    var svg = el.firstChild;
    tap(el, function () {
      pulse(svg, "xm-shake", 1500); pulse(svg, "xm-flashT", 2000);
      var st = svg.querySelector(".xm-star").getBoundingClientRect();
      burst(st.left + st.width / 2, st.top + st.height / 2, { n: 14 });
      later(function () { var r = el.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height * 0.55, { n: 10, kind: "conf" }); }, 260);
      bubble(el, FRASES[(Math.random() * 3) | 0]);
    });
    return el;
  }

  // ======================================================================
  //  Regalos (se abren con un clic)
  // ======================================================================
  function giftsSvg() {
    function bow(x, y, c) { return '<g transform="translate(' + x + ' ' + y + ')"><path d="M0 0 C-12 -12 -17 2 -6 4 C-3 4 -1 2 0 0Z" fill="' + c + '"/><path d="M0 0 C12 -12 17 2 6 4 C3 4 1 2 0 0Z" fill="' + c + '"/><circle r="2.8" fill="' + c + '" stroke="rgba(0,0,0,.18)" stroke-width=".6"/><path d="M-8 -5 Q-10 -1 -6 2" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1"/></g>'; }
    var s = '<ellipse cx="65" cy="76" rx="58" ry="5" fill="rgba(30,50,80,.18)"/>';
    // caja roja grande
    s += '<g class="xm-gift g1"><rect class="beam" x="12" y="-22" width="34" height="58" fill="url(#xmBeam)"/><rect class="bx" x="10" y="38" width="44" height="36" rx="3" fill="url(#xmRedH)"/><rect x="28" y="38" width="8" height="36" fill="url(#xmGold)"/>' +
      '<g class="lid"><rect x="6" y="28" width="52" height="12" rx="3" fill="url(#xmRedH)"/><rect x="28" y="28" width="8" height="12" fill="url(#xmGold)"/>' + bow(32, 27, "#f5c04a") + '</g></g>';
    // caja verde
    s += '<g class="xm-gift g2"><rect class="beam" x="62" y="-14" width="28" height="56" fill="url(#xmBeam)"/><rect class="bx" x="60" y="50" width="34" height="24" rx="3" fill="url(#xmGreenBox)"/><rect x="73" y="50" width="7" height="24" fill="#e03545"/>' +
      '<g class="lid"><rect x="57" y="42" width="40" height="10" rx="3" fill="url(#xmGreenBox)"/><rect x="73" y="42" width="7" height="10" fill="#e03545"/>' + bow(77, 41, "#e03545") + '</g></g>';
    // caja azul con lunares
    s += '<g class="xm-gift g3"><rect class="beam" x="98" y="-6" width="22" height="52" fill="url(#xmBeam)"/><rect class="bx" x="98" y="54" width="28" height="20" rx="3" fill="url(#xmBlueH)"/><circle cx="106" cy="62" r="1.8" fill="#fff" opacity=".8"/><circle cx="117" cy="67" r="1.8" fill="#fff" opacity=".8"/><circle cx="108" cy="70" r="1.4" fill="#fff" opacity=".8"/>' +
      '<g class="lid"><rect x="95" y="47" width="34" height="9" rx="3" fill="url(#xmBlueH)"/><rect x="108" y="47" width="6" height="9" fill="#fff"/>' + bow(111, 46, "#fff") + '</g><rect x="108" y="56" width="6" height="18" fill="#fff"/></g>';
    return s;
  }
  function buildGifts(cls) {
    var el = D("xm-gifts-w " + (cls || "")); el.appendChild(svgEl("xm-gifts", "0 0 130 80", giftsSvg()));
    el.querySelectorAll(".xm-gift").forEach(function (g, i) {
      g.style.setProperty("--wd", (7 + i * 1.7).toFixed(1) + "s"); g.style.animationDelay = (-i * 2.3) + "s";
      tap(g, function () {
        g.classList.add("open"); var c = centro(g); burst(c[0], c[1] - 6, { n: 16, kind: "conf" }); burst(c[0], c[1] - 10, { n: 6 });
        later(function () { g.classList.remove("open"); }, 1900);
      });
    });
    return el;
  }

  // ======================================================================
  //  Muñeco de nieve
  // ======================================================================
  function snowmanSvg() {
    return '<ellipse cx="50" cy="143" rx="36" ry="5" fill="rgba(30,50,80,.2)"/>' +
      '<g class="xm-arm xm-arm-l"><path d="M30 68 L6 54 M12 57 L5 49 M10 55 L3 57" fill="none" stroke="#6b4528" stroke-width="3.2" stroke-linecap="round"/></g>' +
      '<g class="xm-arm xm-arm-r"><path d="M70 68 L94 52 M88 55 L95 46 M90 53 L97 55" fill="none" stroke="#6b4528" stroke-width="3.2" stroke-linecap="round"/></g>' +
      '<circle cx="50" cy="110" r="32" fill="url(#xmSnowBall)"/><circle cx="50" cy="68" r="24" fill="url(#xmSnowBall)"/>' +
      '<circle cx="50" cy="33" r="18" fill="url(#xmSnowBall)"/>' +
      '<g fill="#2b2b36"><circle cx="50" cy="93" r="2.6"/><circle cx="50" cy="106" r="2.6"/><circle cx="50" cy="119" r="2.6"/><circle cx="50" cy="66" r="2.3"/><circle cx="50" cy="77" r="2.3"/></g>' +
      '<g fill="#fff" opacity=".6"><circle cx="49.3" cy="92.2" r=".8"/><circle cx="49.3" cy="105.2" r=".8"/><circle cx="49.3" cy="118.2" r=".8"/></g>' +
      '<g class="xm-scarf-tail"><path d="M58 54 L72 57 L79 82 L66 80Z" fill="url(#xmRedH)"/><path d="M60 62 L74 65 M62 70 L76 73" stroke="#fff" stroke-width="2.2" opacity=".85"/><path d="M66 80 L79 82 M68 80 l-1 5 M72 81 l-1 5 M76 82 l-1 5" stroke="#b81d2e" stroke-width="1.6" stroke-linecap="round"/></g>' +
      '<path d="M30 49 Q50 63 70 49 L71 58 Q50 72 29 58Z" fill="url(#xmRedH)"/><path d="M36 54 Q50 64 64 54" fill="none" stroke="#fff" stroke-width="2.4" opacity=".85"/><path d="M33 51.5 Q50 62 67 51.5" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1.2"/>' +
      '<g class="xm-eyes"><circle cx="43" cy="30" r="2.5" fill="#1a1a22"/><circle cx="57" cy="30" r="2.5" fill="#1a1a22"/><circle cx="43.8" cy="29.2" r=".8" fill="#fff"/><circle cx="57.8" cy="29.2" r=".8" fill="#fff"/></g>' +
      '<path d="M50 34.5 L71 38.6 L50 41.4Z" fill="url(#xmCarrot)"/><path d="M56 36 L57 39.2 M62 37.2 L62.6 39.8" stroke="#b9470f" stroke-width=".8" stroke-opacity=".6"/>' +
      '<g fill="#1a1a22"><circle cx="40.5" cy="40.5" r="1.2"/><circle cx="43.5" cy="43.6" r="1.2"/><circle cx="48" cy="45" r="1.2"/><circle cx="53" cy="45" r="1.2"/><circle cx="57.5" cy="43.6" r="1.2"/></g>' +
      '<ellipse cx="38" cy="37" rx="4" ry="2.6" fill="#ff9ab0" opacity=".5"/><ellipse cx="62" cy="37" rx="4" ry="2.6" fill="#ff9ab0" opacity=".45"/>' +
      '<g class="xm-hat"><ellipse cx="50" cy="19" rx="22" ry="5" fill="url(#xmHat)"/><path d="M38 -2 L62 -2 L63 19 Q50 23 37 19Z" fill="url(#xmHat)"/><ellipse cx="50" cy="-2" rx="12" ry="3" fill="#2d2d3a"/>' +
      '<path d="M37.4 12 Q50 17 62.6 12 L63 18.6 Q50 22.6 37 18.6Z" fill="url(#xmRedH)"/><g transform="translate(60 12)"><path d="M0 0 C4 -6 9 -2 5 1 C8 3 4 8 0 3Z" fill="#37a768"/><circle cx="-2.4" cy="2.4" r="2" fill="url(#xmRed)"/><circle cx="1" cy="4.2" r="1.8" fill="url(#xmRed)"/></g></g>';
  }
  function buildSnowman(cls) {
    var el = D("xm-snowman " + (cls || "")); el.appendChild(svgEl("xm-sm", "-6 -10 112 160", snowmanSvg()));
    tap(el, function () {
      pulse(el, "tip", 1500); pulse(el, "wave", 1500);
      var c = centro(el); burst(c[0], c[1] - 30, { n: 10, col: "#fff" }); bubble(el);
    });
    return el;
  }

  // ======================================================================
  //  Trineo de Papá Noel (cruza la pantalla de vez en cuando; clic = lluvia de regalos)
  // ======================================================================
  function deerSvg(x, lead) {
    return '<g transform="translate(' + x + ' 0)"><g class="xm-leg l1"><path d="M17 44 L15 62" stroke="#8a5229" stroke-width="4.4" stroke-linecap="round"/><circle cx="15" cy="63" r="2.6" fill="#2b1a10"/></g>' +
      '<g class="xm-leg l2"><path d="M24 44 L26 62" stroke="#6f4122" stroke-width="4.4" stroke-linecap="round"/><circle cx="26" cy="63" r="2.6" fill="#2b1a10"/></g>' +
      '<ellipse cx="9" cy="33" rx="4.4" ry="3" fill="#fff"/><ellipse cx="30" cy="36" rx="23" ry="11.5" fill="url(#xmDeer)"/><ellipse cx="34" cy="41" rx="15" ry="6" fill="#e6b98a" opacity=".6"/>' +
      '<path d="M44 28 C50 22 52 18 55 14 L62 20 C58 26 54 32 50 38Z" fill="url(#xmDeer)"/>' +
      '<ellipse cx="60" cy="17" rx="8.5" ry="7.2" fill="url(#xmDeer)" transform="rotate(-12 60 17)"/><ellipse cx="68" cy="21" rx="5" ry="3.8" fill="#6d3e1f"/>' +
      '<circle cx="72.4" cy="21" r="' + (lead ? 3.2 : 2.3) + '" fill="' + (lead ? '#ff3b3b' : '#1a1a22') + '"' + (lead ? ' class="xm-nose"' : '') + '/>' +
      (lead ? '<circle cx="72.4" cy="21" r="8" fill="#ff5252" opacity=".35" class="xm-nose"/>' : '') +
      '<circle cx="61.4" cy="15.4" r="1.4" fill="#1a1a22"/><circle cx="61.9" cy="15" r=".5" fill="#fff"/><ellipse cx="54" cy="9" rx="3" ry="5" fill="#8a5229" transform="rotate(-30 54 9)"/>' +
      '<path d="M57 9 Q55 -2 48 -6 M55 5 Q60 -2 58 -9 M54 7 Q46 3 42 -3 M49 -6 Q47 -10 44 -10" fill="none" stroke="#5e3a1e" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M45 26 Q52 32 48 40" fill="none" stroke="#d1242f" stroke-width="3"/><circle cx="48" cy="40" r="2.6" fill="url(#xmGold)"/>' +
      '<g class="xm-leg l2"><path d="M41 44 L43 62" stroke="#6f4122" stroke-width="4.4" stroke-linecap="round"/><circle cx="43" cy="63" r="2.6" fill="#2b1a10"/></g>' +
      '<g class="xm-leg l1"><path d="M34 44 L32 62" stroke="#8a5229" stroke-width="4.4" stroke-linecap="round"/><circle cx="32" cy="63" r="2.6" fill="#2b1a10"/></g></g>';
  }
  function sleighSvg() {
    return '<path d="M118 52 Q168 40 214 46 M118 58 Q168 52 214 54" fill="none" stroke="#e9c46a" stroke-width="1.2" opacity=".9"/>' +
      '<g class="xm-sl">' + deerSvg(238, true) + deerSvg(170, false) +
      '<path d="M8 66 Q2 66 4 58 M4 60 Q40 70 100 66 Q116 64 114 48" fill="none" stroke="#e8b84a" stroke-width="3.4" stroke-linecap="round"/><path d="M26 66 L28 56 M60 67 L58 56 M92 66 L92 54" stroke="#c98a14" stroke-width="2.2"/>' +
      '<path d="M14 24 Q12 52 32 58 L98 58 Q114 54 116 30 Q108 40 96 40 L30 40 Q16 40 14 24Z" fill="url(#xmRedH)"/><path d="M14 24 Q12 52 32 58 L98 58 Q114 54 116 30" fill="none" stroke="#f5c04a" stroke-width="2.6" stroke-linecap="round"/><path d="M26 46 L100 46" stroke="#f5c04a" stroke-width="1.6" stroke-dasharray="1 4" stroke-linecap="round"/>' +
      '<g transform="translate(8 28)"><ellipse cx="14" cy="14" rx="15" ry="13" fill="#a2662f"/><path d="M6 8 Q14 2 22 8" stroke="#5e3a1e" stroke-width="1.4" fill="none"/><rect x="6" y="-8" width="13" height="12" rx="2" fill="url(#xmGreenBox)" transform="rotate(-10 12 0)"/><rect x="11" y="-9" width="3" height="13" fill="#e03545" transform="rotate(-10 12 0)"/><rect x="18" y="-4" width="11" height="10" rx="2" fill="url(#xmBlueH)" transform="rotate(12 22 2)"/></g>' +
      '<ellipse cx="72" cy="34" rx="17" ry="15" fill="url(#xmRed)"/><rect x="55" y="38" width="34" height="5" fill="#2b2b36"/><rect x="68" y="37.4" width="7" height="6.2" fill="url(#xmGold)"/>' +
      '<g class="xm-santa-arm"><path d="M84 30 Q96 18 100 8" stroke="#d1242f" stroke-width="7" stroke-linecap="round" fill="none"/><circle cx="100.5" cy="6.5" r="4.4" fill="#2b2b36"/></g>' +
      '<circle cx="72" cy="12" r="10" fill="#ffd9bd"/><path d="M62 14 Q72 34 82 14 Q80 24 72 28 Q64 24 62 14Z" fill="#fff"/><ellipse cx="72" cy="16.4" rx="4" ry="2.4" fill="#fff"/><circle cx="68.4" cy="10.4" r="1.2" fill="#1a1a22"/><circle cx="75.6" cy="10.4" r="1.2" fill="#1a1a22"/><circle cx="72" cy="13" r="1.9" fill="#f1a08a"/><circle cx="65.6" cy="14" r="2" fill="#ff9ab0" opacity=".55"/><circle cx="78.4" cy="14" r="2" fill="#ff9ab0" opacity=".55"/>' +
      '<path d="M61 8 Q62 -6 74 -8 Q84 -8 84 4 Q80 0 70 0 Q64 1 61 8Z" fill="url(#xmRed)"/><path d="M60 6.6 Q72 0 84 5 L84 8.6 Q72 3 60 10Z" fill="#fff"/><circle cx="87" cy="-3" r="4.2" fill="#fff"/></g>';
  }
  function buildSleigh(layer, w, h) {
    var big = w > 900, el = D("xm-sleigh", layer); el.style.width = (big ? 270 : 190) + "px"; el.style.height = (big ? 95 : 67) + "px";
    var inner = D("xm-sl-in", el); inner.appendChild(svgEl("xm-sl-svg", "-6 -16 330 96", sleighSvg()));
    var rnd = seeded(5), st = { wait: 5, flying: false, u: 0, T: 17, dir: 1, y0: 120, A: 30, lastTrail: 0, hide: true };
    function soltar() {
      var c = centro(el), i; bubble(el, "¡Ho, ho, ho! ¡Feliz Navidad!");
      for (i = 0; i < 4; i++) (function (k) {
        later(function () {
          if (!fxBox) return;
          var g = D("xm-drop", fxBox); g.style.left = (c[0] - 40 + k * 28) + "px"; g.style.top = c[1] + "px"; g.style.setProperty("--rot", (k % 2 ? 1 : -1) * (40 + k * 14) + "deg");
          g.appendChild(svgEl("xm-dg", "0 0 24 24", '<rect x="2" y="9" width="20" height="13" rx="2" fill="' + ["url(#xmRedH)", "url(#xmGreenBox)", "url(#xmBlueH)", "url(#xmRedH)"][k] + '"/><rect x="10.4" y="9" width="3.2" height="13" fill="#f5c04a"/><rect x="1" y="5" width="22" height="5" rx="1.6" fill="url(#xmGold)"/><path d="M12 5 C6 -2 3 5 11 5 M12 5 C18 -2 21 5 13 5" fill="none" stroke="#e03545" stroke-width="2"/>', 28, 28));
          later(function () { var r = g.getBoundingClientRect(); burst(r.left + r.width / 2, Math.min(window.innerHeight - 20, r.top + 20), { n: 6 }); g.remove(); }, 1400);
        }, k * 150);
      })(i);
    }
    tap(el, soltar);
    return {
      el: el,
      update: function (t, dt) {
        if (!st.flying) { st.wait -= dt; el.style.visibility = "hidden"; dbg.sleigh.flying = false; if (st.wait <= 0) { st.flying = true; st.u = 0; st.dir = -st.dir; st.T = big ? 18 : 14; st.y0 = 70 + rnd() * Math.max(40, h * 0.3); st.A = 18 + rnd() * 26; inner.style.transform = "scaleX(" + (st.dir > 0 ? 1 : -1) + ")"; } return; }
        st.u += dt / st.T;
        if (st.u >= 1) { st.flying = false; st.wait = 16 + rnd() * 14; return; }
        el.style.visibility = "visible";
        var ew = el.offsetWidth, x = st.dir > 0 ? -ew + st.u * (w + ew * 2) : w + ew - st.u * (w + ew * 2);
        var y = st.y0 + st.A * Math.sin(st.u * 7) - 12 * Math.sin(st.u * PI), tilt = Math.cos(st.u * 7) * 3.2 * st.dir * -1;
        el.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) rotate(" + tilt.toFixed(1) + "deg)";
        dbg.sleigh.flying = true; dbg.sleigh.x = x; dbg.sleigh.y = y;
        if (t - st.lastTrail > 0.09 && animar()) { st.lastTrail = t; var tx = x + (st.dir > 0 ? ew * 0.08 : ew * 0.92), ty = y + h * 0 + 40; var lay = el.parentNode.getBoundingClientRect(); burst(lay.left + tx, lay.top + ty, { n: 1, col: "#fff3b0" }); }
      }
    };
  }

  // ======================================================================
  //  Nevada (canvas, independiente; copos de cristal y puntos suaves)
  // ======================================================================
  function buildSnow(layer, w, h) {
    var cv = document.createElement("canvas"); cv.className = "xm-snow"; layer.appendChild(cv);
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5); cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    var ctx = cv.getContext("2d"), n = w > 900 ? 78 : 40, flakes = [], rnd = seeded(21), i;
    for (i = 0; i < n; i++) flakes.push({ x: rnd() * w, y: rnd() * h, r: 1.2 + rnd() * rnd() * 5.4, v: 14 + rnd() * 38, ph: rnd() * 6.28, sw: 8 + rnd() * 22, rot: rnd() * 6.28, spin: (rnd() - 0.5) * 1.2 });
    dbg.snow = n;
    function paint(t) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      for (var k = 0; k < flakes.length; k++) {
        var f = flakes[k], x = f.x + Math.sin(t * 0.6 + f.ph) * f.sw;
        ctx.globalAlpha = 0.5 + f.r / 12;
        if (f.r > 3.2) {                                               // copo de cristal de 6 brazos
          ctx.save(); ctx.translate(x, f.y); ctx.rotate(f.rot); ctx.strokeStyle = "#fff"; ctx.shadowColor = "rgba(120,160,220,.7)"; ctx.shadowBlur = 3; ctx.lineWidth = f.r > 4.6 ? 1.4 : 1.1; ctx.lineCap = "round";
          ctx.beginPath();
          for (var a = 0; a < 6; a++) { ctx.save(); ctx.rotate(a * PI / 3); ctx.moveTo(0, 0); ctx.lineTo(0, -f.r * 1.5); ctx.moveTo(0, -f.r * 0.8); ctx.lineTo(f.r * 0.45, -f.r * 1.2); ctx.moveTo(0, -f.r * 0.8); ctx.lineTo(-f.r * 0.45, -f.r * 1.2); ctx.restore(); }
          ctx.stroke(); ctx.restore();
        } else {
          var g = ctx.createRadialGradient(x, f.y, 0, x, f.y, f.r * 1.7); g.addColorStop(0, "rgba(255,255,255,.95)"); g.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, f.y, f.r * 1.7, 0, PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
    paint(0);
    return {
      el: cv,
      update: function (t, dt) {
        for (var k = 0; k < flakes.length; k++) { var f = flakes[k]; f.y += f.v * dt; f.rot += f.spin * dt; if (f.y > h + 12) { f.y = -12; f.x = Math.random() * w; } }
        paint(t);
      }
    };
  }

  // ======================================================================
  //  Montaje / desmontaje
  // ======================================================================
  var layerEl = null, resizeT = 0, lastBig = null, boton = null;
  function navAlto() { var nav = document.querySelector(".topnav"); return nav ? nav.offsetHeight : 0; }
  function montarCapa() {
    var anim = animar(), w = window.innerWidth, big = w > 900; lastBig = big;
    var h = Math.max(240, window.innerHeight - navAlto());
    var layer = D("xm-layer"); layer.setAttribute("aria-hidden", "true"); layer.style.top = navAlto() + "px";
    fxBox = D("xm-fx"); document.body.appendChild(fxBox);
    if (anim) objs.push(buildSnow(layer, w, h)); else { var sn = buildSnow(layer, w, h); }
    var gar = buildGarland(w); layer.appendChild(gar);
    buildHangs(layer, w, gar._gy);
    var man = buildSnowman("corner"); layer.appendChild(man);
    if (anim) objs.push(buildSleigh(layer, w, h));
    document.body.appendChild(layer); layerEl = layer;
  }
  function montar() {
    if (document.querySelector(".xm-layer")) return;
    // la Navidad reemplaza a Halloween (nunca las dos a la vez)
    if (window.PangoaHalloween && document.querySelector(".hw-layer")) window.PangoaHalloween.desmontar();
    root.setAttribute("data-navidad", "on");
    if (!document.querySelector(".xm-defs")) document.body.appendChild(D("xm-defs-wrap")).innerHTML = DEFS;
    montarCapa();
    document.querySelectorAll(".scene").forEach(function (sc) {
      if (sc.querySelector(".xm-deco")) return;
      var deco = D("xm-deco"); deco.setAttribute("aria-hidden", "true");
      deco.appendChild(buildTree("t1")); deco.appendChild(buildGifts("g1"));
      sc.appendChild(deco);
    });
    if (animar() && objs.length) startLoop();
    actualizarBoton();
  }
  function desmontar() {
    stopLoop();
    timers.forEach(clearTimeout); timers = [];
    root.removeAttribute("data-navidad");
    document.querySelectorAll(".xm-layer, .xm-deco, .xm-fx, .xm-defs-wrap").forEach(function (n) { n.remove(); });
    layerEl = null; fxBox = null; bulbs = [];
    actualizarBoton();
  }
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    var t = ts / 1000, dt = Math.min(0.05, t - lastT || 0.016) * (dbg.timeScale || 1);
    lastT = t;
    for (var i = 0; i < objs.length; i++) objs[i].update(t, dt);
  }
  function startLoop() { if (raf) return; lastT = performance.now() / 1000; raf = requestAnimationFrame(frame); }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; objs = []; }
  window.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { if (!layerEl) return; desmontar(); montar(); }, 300);
  });

  // ---------- Botón (junto al de modo oscuro) ----------
  function actualizarBoton() {
    if (!boton) return;
    var on = !!document.querySelector(".xm-layer");
    boton.textContent = on ? "Navidad: activada" : "Navidad: desactivada";
    boton.setAttribute("aria-pressed", on ? "true" : "false");
  }
  function crearBoton() {
    var tema = document.getElementById("themeToggleBtn");
    if (!tema || document.getElementById("navidadToggleBtn")) return;
    boton = tema.cloneNode(false);
    boton.id = "navidadToggleBtn";
    boton.setAttribute("aria-label", "Activar o desactivar la decoración de Navidad");
    boton.addEventListener("click", function () {
      var on = !!document.querySelector(".xm-layer");
      guardar(on ? "off" : "on");
      if (on) desmontar(); else { try { localStorage.setItem(HKEY, "off"); } catch (e) {} montar(); }
    });
    tema.parentNode.insertBefore(boton, tema.nextSibling);
    actualizarBoton();
  }

  function init() { crearBoton(); if (activo()) montar(); else actualizarBoton(); }
  window.PangoaNavidad = { montar: montar, desmontar: desmontar, debug: dbg };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
