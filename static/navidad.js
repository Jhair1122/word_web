// Decoración navideña v2 (2D, vectorial). Solo visual y decorativa (aria-hidden).
//  - Ninguna figura sigue al ratón. Cada una tiene su animación propia e independiente.
//  - Luces con 8 ritmos distintos (cambian solos; un clic en una luz pasa al siguiente ritmo).
//  - El árbol acumula la nieve con el tiempo, la suelta de forma realista por pisos y se sacude al hacer clic
//    (cae tanta nieve como haya acumulada).
//  - Adornos, luces, árbol, regalos, muñeco de nieve y trineo suenan al hacer clic (botón para silenciar).
//  - Papá Noel con tres renos (Rodolfo al frente) que cruza la pantalla de vez en cuando.
// Se activa sola del 1 de noviembre al 6 de enero; la elección de la persona manda siempre.
(function () {
  "use strict";
  var root = document.documentElement;
  var KEY = "pangoa_navidad", HKEY = "pangoa_halloween", SKEY = "pangoa_navidad_sonido";
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
  function rr(a, b) { return a + Math.random() * (b - a); }
  function seeded(s) { return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  var objs = [], raf = 0, lastT = 0, timers = [];
  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
  var dbg = {
    bulbs: 0, hangs: 0, snow: 0, clicks: 0, sleigh: { flying: false, x: 0, y: 0 }, bubble: "",
    mode: 0, modeName: "", modeLock: false, modes: 8,
    sounds: { count: 0, last: "", on: true },
    tree: { levels: [0, 0, 0], pile: 0, sheds: 0, clumps: 0, shakes: 0, landed: 0 },
    snowman: { last: "", idle: "", clicks: 0 }
  };

  // ======================================================================
  //  Sonido (WebAudio, se crea con el primer clic; se puede silenciar)
  // ======================================================================
  var AU = { ctx: null, out: null, nb: null, on: true };
  try { AU.on = localStorage.getItem(SKEY) !== "off"; } catch (e) {}
  dbg.sounds.on = AU.on;
  function ac() {
    if (!AU.on) return null;
    if (!AU.ctx) {
      try {
        var C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
        AU.ctx = new C(); var comp = AU.ctx.createDynamicsCompressor(), g = AU.ctx.createGain();
        g.gain.value = 0.6; comp.connect(g); g.connect(AU.ctx.destination); AU.out = comp;
      } catch (e) { return null; }
    }
    if (AU.ctx.state === "suspended") { try { AU.ctx.resume(); } catch (e) {} }
    return AU.ctx;
  }
  function tone(f, t, d, o) {
    var c = AU.ctx, g = c.createGain(), parts, v, a, k; o = o || {}; parts = o.p || [[1, 1]]; v = o.v || 0.18; a = o.a || 0.004;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + d); g.connect(AU.out);
    for (k = 0; k < parts.length; k++) {
      var os = c.createOscillator(), pg = c.createGain(); os.type = o.type || "sine";
      os.frequency.setValueAtTime(f * parts[k][0], t);
      if (o.to) os.frequency.exponentialRampToValueAtTime(o.to * parts[k][0], t + d);
      pg.gain.value = parts[k][1]; os.connect(pg); pg.connect(g); os.start(t); os.stop(t + d + 0.05);
    }
  }
  function noise(t, d, f, q, v, type) {
    var c = AU.ctx;
    if (!AU.nb) { AU.nb = c.createBuffer(1, c.sampleRate, c.sampleRate); var ch = AU.nb.getChannelData(0); for (var i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1; }
    var s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); s.buffer = AU.nb; s.loop = true; fl.type = type || "bandpass"; fl.frequency.value = f; fl.Q.value = q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + Math.min(0.03, d / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(fl); fl.connect(g); g.connect(AU.out); s.start(t); s.stop(t + d + 0.05);
  }
  var lastThud = 0;
  function sfx(name, a) {
    if (!AU.on) return;
    dbg.sounds.count++; dbg.sounds.last = name;
    if (!ac()) return;
    var c = AU.ctx, t = c.currentTime + 0.005, i, f;
    try {
      switch (name) {
        case "ball": f = [784, 880, 988, 1175, 1319, 1568][(Math.random() * 6) | 0]; tone(f, t, 1.1, { v: 0.15, p: [[1, 1], [2.76, 0.3], [5.4, 0.1]] }); break;
        case "bell": f = [523, 587, 659][(Math.random() * 3) | 0];
          tone(f, t, 1.9, { v: 0.2, p: [[1, 1], [2, 0.55], [3, 0.3], [4.16, 0.2], [5.43, 0.1]] }); tone(f * 1.5, t + 0.16, 1.5, { v: 0.12, p: [[1, 1], [2, 0.5], [3, 0.2]] }); break;
        case "star": [1047, 1319, 1568, 2093].forEach(function (x, k) { tone(x, t + k * 0.09, 0.8, { v: 0.11, p: [[1, 1], [2, 0.25]] }); }); break;
        case "cane": tone(700, t, 0.14, { type: "triangle", v: 0.2, to: 520, p: [[1, 1], [2.4, 0.4]] }); tone(1000, t + 0.1, 0.12, { type: "triangle", v: 0.14, to: 760 }); break;
        case "bulb": f = 659 * Math.pow(2, [0, 2, 4, 7, 9, 12, 14, 16][(a || 0) % 8] / 12);
          tone(f, t, 0.35, { v: 0.14, p: [[1, 1], [2, 0.3]] }); tone(f * 1.5, t + 0.07, 0.3, { v: 0.08 }); break;
        case "tree": a = a || 0;
          noise(t, 0.55, 1500, 0.7, 0.12 + 0.06 * Math.min(a, 2), "bandpass");
          for (i = 0; i < 7; i++) tone(2500 + Math.random() * 1800, t + i * 0.05, 0.25, { v: 0.045, p: [[1, 1], [1.5, 0.5]] });
          if (a > 0.1) noise(t + 0.22, 0.34, 260, 0.8, 0.1 * Math.min(a, 2.5), "lowpass"); break;
        case "thud": if (c.currentTime - lastThud < 0.12) break; lastThud = c.currentTime; noise(t, 0.22, 320, 0.8, 0.04 + 0.06 * Math.min(a || 0.3, 1), "lowpass"); break;
        case "boing": tone(200, t, 0.18, { v: 0.2, to: 520 }); tone(520, t + 0.17, 0.32, { v: 0.18, to: 230 }); break;
        case "giggle": for (i = 0; i < 5; i++) tone(520 + Math.random() * 200, t + i * 0.085, 0.07, { type: "triangle", v: 0.08 }); break;
        case "whistle": tone(1300, t, 0.45, { v: 0.07, to: 1750 }); tone(1750, t + 0.42, 0.4, { v: 0.07, to: 1250 }); tone(1500, t + 0.85, 0.35, { v: 0.06, to: 1900 }); break;
        case "throw": noise(t, 0.28, 1100, 0.5, 0.08, "highpass"); noise(t + 0.9, 0.22, 500, 0.6, 0.12, "lowpass"); break;
        case "pop": tone(500, t, 0.1, { v: 0.16, to: 900 }); break;
        case "dance": [523, 659, 784, 659, 880, 784, 1047].forEach(function (x, k) { tone(x, t + k * 0.13, 0.28, { type: "triangle", v: 0.1, p: [[1, 1], [2, 0.2]] }); }); break;
        case "gift": [523, 659, 784, 1047].forEach(function (x, k) { tone(x, t + k * 0.07, 0.5, { type: "triangle", v: 0.12, p: [[1, 1], [2, 0.25]] }); }); break;
        case "sip": for (i = 0; i < 3; i++) noise(t + i * 0.2, 0.13, 520, 0.8, 0.07, "lowpass"); tone(330, t + 0.62, 0.3, { v: 0.07, to: 240 }); break;
        case "clink": tone(2200, t, 0.55, { v: 0.12, p: [[1, 1], [2.4, 0.4], [4.1, 0.15]] }); tone(2950, t + 0.04, 0.45, { v: 0.08, p: [[1, 1], [2.3, 0.3]] }); break;
        case "mistle": [1319, 1047, 880].forEach(function (x, k) { tone(x, t + k * 0.12, 0.7, { v: 0.1, p: [[1, 1], [2, 0.25]] }); }); break;
        case "jingle": for (i = 0; i < 12; i++) tone(2800 + Math.random() * 2200, t + i * 0.04, 0.2, { v: 0.05, p: [[1, 1], [1.6, 0.5]] }); break;
        case "sleigh":
          for (i = 0; i < 14; i++) tone(3000 + Math.random() * 2500, t + i * 0.045, 0.2, { v: 0.045, p: [[1, 1], [1.6, 0.5]] });
          [165, 147, 131].forEach(function (x, k) { tone(x, t + 0.32 + k * 0.3, 0.26, { type: "triangle", v: 0.16, p: [[1, 1], [2, 0.5], [3, 0.25]] }); }); break;
      }
    } catch (e) {}
  }

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
      '<linearGradient id="xmRedV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0485c"/><stop offset="1" stop-color="#9b1626"/></linearGradient>' +
      '<linearGradient id="xmBlueH" x1="0" x2="1"><stop offset="0" stop-color="#2a6fd0"/><stop offset=".45" stop-color="#5aa4f5"/><stop offset="1" stop-color="#245fb4"/></linearGradient>' +
      '<linearGradient id="xmGreenBox" x1="0" x2="1"><stop offset="0" stop-color="#1c7a4e"/><stop offset=".45" stop-color="#43b97b"/><stop offset="1" stop-color="#176a43"/></linearGradient>' +
      '<linearGradient id="xmBrown" x1="0" x2="1"><stop offset="0" stop-color="#5e3a1e"/><stop offset=".5" stop-color="#9a6234"/><stop offset="1" stop-color="#583519"/></linearGradient>' +
      '<linearGradient id="xmDeer" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bf7d44"/><stop offset=".6" stop-color="#a06031"/><stop offset="1" stop-color="#7d4825"/></linearGradient>' +
      '<radialGradient id="xmSnowBall" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#eef4fc"/><stop offset="1" stop-color="#bccce3"/></radialGradient>' +
      '<linearGradient id="xmCarrot" x1="0" x2="1"><stop offset="0" stop-color="#ffb04a"/><stop offset="1" stop-color="#e2641a"/></linearGradient>' +
      '<linearGradient id="xmHat" x1="0" x2="1"><stop offset="0" stop-color="#1c1c26"/><stop offset=".5" stop-color="#454556"/><stop offset="1" stop-color="#17171f"/></linearGradient>' +
      '<linearGradient id="xmBeam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff3b0" stop-opacity=".95"/><stop offset="1" stop-color="#fff3b0" stop-opacity="0"/></linearGradient>' +
      '<radialGradient id="xmGlowG" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6c4" stop-opacity=".95"/><stop offset="1" stop-color="#ffd25a" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="xmNoseGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff5a5a" stop-opacity=".9"/><stop offset=".5" stop-color="#ff3b3b" stop-opacity=".3"/><stop offset="1" stop-color="#ff3b3b" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="xmWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9423f"/><stop offset=".55" stop-color="#a42a30"/><stop offset="1" stop-color="#7a1c26"/></linearGradient>' +
      '<linearGradient id="xmPan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3cf7e"/><stop offset=".6" stop-color="#d9a04a"/><stop offset="1" stop-color="#b9772d"/></linearGradient>' +
      '<linearGradient id="xmMug" x1="0" x2="1"><stop offset="0" stop-color="#dfe6f1"/><stop offset=".4" stop-color="#fff"/><stop offset="1" stop-color="#cdd6e4"/></linearGradient>' +
      '<filter id="xmBlurS" x="-50%" y="-30%" width="200%" height="160%"><feGaussianBlur stdDeviation="1.1"/></filter>' +
      '<filter id="xmBlur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3.2"/></filter>' +
      '</defs></svg>';
    return s;
  })();

  // ======================================================================
  //  Efectos: chispas, confeti, notas, globos de texto
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
  function notes(x, y, n) {
    if (!fxBox || !animar()) return;
    for (var i = 0; i < n; i++) (function (k) {
      later(function () {
        if (!fxBox) return;
        var e = D("xm-note", fxBox); e.textContent = ["♪", "♫", "♬"][(Math.random() * 3) | 0]; e.style.left = (x + rr(-18, 18)) + "px"; e.style.top = y + "px";
        e.style.color = ["#e03545", "#f5a623", "#2eaa68", "#3b82f6"][(Math.random() * 4) | 0]; e.style.setProperty("--nx", rr(-34, 34).toFixed(0) + "px");
        later(function () { e.remove(); }, 1700);
      }, k * 240);
    })(i);
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
  //  Luces: 8 ritmos como los de una tira real (cambian solos; el clic pasa al siguiente)
  // ======================================================================
  var MODES = ["Fijas con brillo suave", "Respiración lenta", "Persecución", "Alternadas", "Arcoíris", "Destellos al azar", "Latido", "Cascada"];
  var light = { mode: 0, t: 0, lock: 0, next: 9 }, ldt = 0.016;
  function lvl(m, i, n, t, o) {
    var p, pos, q;
    switch (m) {
      case 0: return 0.8 + 0.17 * Math.sin(t * 1.4 + i * 0.9);
      case 1: return 0.12 + 0.88 * (0.5 + 0.5 * Math.sin(t * 1.05 - i * 0.08));
      case 2: return (((i - Math.floor(t * 8)) % 4) + 4) % 4 === 0 ? 1 : 0.15;
      case 3: return (i % 2) === (Math.floor(t * 1.7) & 1) ? 1 : 0.14;
      case 4: return 0.92 + 0.08 * Math.sin(t * 6 + i);
      case 5: o.sp = Math.max(0, (o.sp || 0) - ldt * 2.2); if (Math.random() < ldt * 0.9) o.sp = 1; return 0.2 + 0.8 * o.sp;
      case 6: p = t % 1.7; q = (p - 0.1) / 0.07; pos = (p - 0.38) / 0.07; return 0.18 + 0.82 * Math.max(Math.exp(-q * q), 0.8 * Math.exp(-pos * pos));
      default: p = (t * 10) % ((n + 8) * 2); p = p > n + 8 ? (n + 8) * 2 - p : p; pos = p - 4; return 0.15 + 0.85 * clamp(1 - Math.abs(i - pos) / 5, 0, 1);
    }
  }
  function paintBulb(o, c) { if (o.cd === c) return; o.cd = c; o.glow.setAttribute("fill", BULBS[c][0]); o.body.setAttribute("fill", "url(#xmB" + c + ")"); }
  function setMode(m, manual) {
    light.mode = m; light.t = 0; dbg.mode = m; dbg.modeName = MODES[m]; light.next = rr(9, 17);
    if (m !== 4) bulbs.forEach(function (b) { paintBulb(b, b.c); });
    if (manual) light.lock = 42;
  }
  function lightsUpdate(t, dt) {
    var i, o, n = bulbs.length, lv;
    ldt = dt; light.t += dt;
    if (light.lock > 0) { light.lock -= dt; } else { light.next -= dt; if (light.next <= 0) { var m; do { m = (Math.random() * MODES.length) | 0; } while (m === light.mode); setMode(m, false); } }
    dbg.modeLock = light.lock > 0;
    var k = Math.min(1, dt * 16);
    for (i = 0; i < n; i++) {
      o = bulbs[i]; lv = lvl(light.mode, i, n, light.t, o); o.lv += (lv - o.lv) * k;
      if (light.mode === 4) paintBulb(o, ((Math.floor(light.t * 1.8 + i * 0.8) % 5) + 5) % 5);
      if (Math.abs(o.lv - o.sh) > 0.012) { o.sh = o.lv; o.glow.style.opacity = (0.1 + 0.88 * o.lv).toFixed(2); o.glow.style.transform = "scale(" + (0.7 + 0.55 * o.lv).toFixed(2) + ")"; o.body.style.opacity = (0.55 + 0.45 * o.lv).toFixed(2); }
    }
    for (i = 0; i < treeLights.length; i++) {
      o = treeLights[i]; lv = lvl(light.mode, o.i, 10, light.t, o); o.lv += (lv - o.lv) * k;
      if (Math.abs(o.lv - o.sh) > 0.015) { o.sh = o.lv; o.g.style.opacity = (0.2 + 0.8 * o.lv).toFixed(2); }
    }
  }

  // ======================================================================
  //  Guirnalda con luces (curva catenaria, bayas, lazos y focos de colores)
  // ======================================================================
  var bulbs = [], treeLights = [], trees = [];
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
    for (x = 20; x < w; x += 44) {                                  // bayas rojas
      var by = gy(x) + 2.5;
      S("circle", { cx: x, cy: by, r: 2.5, fill: "url(#xmRed)" }, svg); S("circle", { cx: x + 4.4, cy: by + 1, r: 2.1, fill: "url(#xmRed)" }, svg);
      S("circle", { cx: x - 0.7, cy: by - 0.8, r: 0.7, fill: "#fff", opacity: ".85" }, svg);
    }
    for (x = 0; x <= w + P; x += P) {                               // lazos en cada anclaje
      var g = S("g", { transform: "translate(" + x + " " + (y0 + 2) + ")" }, svg);
      g.innerHTML = '<g class="xm-holly"><path d="M2 2 C8 -6 18 -6 24 0 L21 2 L25 5 L20 7 L23 11 C14 12 6 9 2 2Z" fill="url(#xmGreenV)" stroke="#145a3b" stroke-width=".7"/><path d="M-2 2 C-8 -6 -18 -6 -24 0 L-21 2 L-25 5 L-20 7 L-23 11 C-14 12 -6 9 -2 2Z" fill="url(#xmGreenV)" stroke="#145a3b" stroke-width=".7"/><path d="M3 3 L19 1 M-3 3 L-19 1" stroke="#0f4a30" stroke-opacity=".5" stroke-width=".8"/></g>' +
        '<path d="M0 0 C-14 -10 -20 4 -8 8 C-4 9 -1 4 0 0Z" fill="url(#xmRedH)"/><path d="M0 0 C14 -10 20 4 8 8 C4 9 1 4 0 0Z" fill="url(#xmRedH)"/>' +
        '<path d="M-2 4 L-9 20 L-3 17 L0 22Z M2 4 L9 20 L3 17 L0 22Z" fill="#b81d2e"/><circle r="3.4" fill="url(#xmRed)"/><circle cx="-1" cy="-1" r="1" fill="#fff" opacity=".7"/>' +
        '<circle cx="-14" cy="6" r="2.4" fill="url(#xmGold)"/><circle cx="14" cy="6" r="2.4" fill="url(#xmGold)"/><circle cx="-4" cy="9" r="2.3" fill="url(#xmRed)"/><circle cx="1" cy="11" r="2.3" fill="url(#xmRed)"/><circle cx="5" cy="8.4" r="2.3" fill="url(#xmRed)"/><circle cx="-4.6" cy="8.2" r=".7" fill="#fff" opacity=".85"/>';
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
      var obj = { g: bg, c: c, cd: c, x: x, y: gy(x) + 18, lv: 0.9, sh: -1, sp: 0, glow: bg.querySelector(".xm-glow"), body: bg.querySelector(".xm-body") };
      obj.glow.style.opacity = "0.9"; obj.glow.style.transform = "scale(1.15)";
      bulbs.push(obj); k++;
      (function (o, idx) { tap(o.g, function () { clickBulb(o, idx); }); })(obj, bulbs.length - 1);
    }
    dbg.bulbs = bulbs.length;
    svg._gy = gy;
    return svg;
  }
  function clickBulb(o, idx) {
    var nm = (light.mode + 1) % MODES.length;
    setMode(nm, true); light.t = 0;
    sfx("bulb", nm);
    pulse(o.g, "xm-pop", 1300);
    var c = centro(o.g); burst(c[0], c[1] + 6, { n: 7, col: BULBS[o.c][0] });
    bulbs.forEach(function (b, k) { if (k === idx) return; var dd = Math.abs(k - idx); if (dd <= 7) later(function () { b.g.style.setProperty("--a", (14 / (1 + dd * 0.35)).toFixed(1) + "deg"); b.g.style.setProperty("--dir", (k < idx ? -1 : 1)); pulse(b.g, "xm-sw", 1500); }, dd * 70); });
    bubble(o.g, "Luces: " + MODES[nm]);
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
    if (kind === "mistle") {
      var lf = function (x, yy, r, c) { return '<ellipse cx="' + x + '" cy="' + yy + '" rx="3.4" ry="7.4" transform="rotate(' + r + ' ' + x + ' ' + yy + ')" fill="' + c + '" stroke="#1d6a3c" stroke-width=".6"/><path d="M' + x + ' ' + (yy - 5) + ' L' + x + ' ' + (yy + 5) + '" stroke="#bfe8c6" stroke-width=".6" opacity=".7" transform="rotate(' + r + ' ' + x + ' ' + yy + ')"/>'; };
      s = rope + '<g transform="translate(22 ' + (y + 2) + ')"><path d="M0 0 C-7 -7 -12 -3 -6 1 M0 0 C7 -7 12 -3 6 1" fill="none" stroke="#d1242f" stroke-width="2.6" stroke-linecap="round"/><circle r="2.4" fill="url(#xmRed)"/>' +
        '<path d="M0 3 L-9 20 M0 3 L9 22 M0 3 L0 24" stroke="#4d7a3a" stroke-width="1.6" stroke-linecap="round"/>' +
        lf(-10, 22, 50, "#4fae5f") + lf(-14, 15, 75, "#3d9c52") + lf(11, 24, -45, "#4fae5f") + lf(14, 17, -72, "#3d9c52") + lf(-3, 28, 15, "#2f8a4a") + lf(4, 30, -15, "#3d9c52") +
        '<circle cx="-2" cy="14" r="3.3" fill="#fbfbf3" stroke="#d9dccc" stroke-width=".6"/><circle cx="3.4" cy="15.4" r="3.3" fill="#fbfbf3" stroke="#d9dccc" stroke-width=".6"/><circle cx="0.4" cy="19.2" r="3.3" fill="#fbfbf3" stroke="#d9dccc" stroke-width=".6"/>' +
        '<circle cx="-3" cy="12.8" r=".9" fill="#fff"/><circle cx="2.4" cy="14.2" r=".9" fill="#fff"/><circle cx="-0.6" cy="18" r=".9" fill="#fff"/></g>';
      return svgEl("xm-hs", "0 0 44 " + (y + 42), s, 44, y + 42);
    }
    if (kind === "wreath") {
      s = rope + '<g transform="translate(22 ' + (y + 20) + ')"><circle r="14" fill="none" stroke="#1a6b43" stroke-width="9"/><circle r="14" fill="none" stroke="#37a768" stroke-width="7" stroke-dasharray="3 2.2"/><circle r="14" fill="none" stroke="#7fd69d" stroke-width="2" stroke-dasharray="1.4 4.4" opacity=".8"/>' +
        '<circle cx="-9" cy="-9" r="2.2" fill="url(#xmRed)"/><circle cx="-6" cy="-11.6" r="2.2" fill="url(#xmRed)"/><circle cx="9.6" cy="-8" r="2.2" fill="url(#xmRed)"/><circle cx="-13" cy="3" r="2.2" fill="url(#xmRed)"/><circle cx="12" cy="6" r="2.2" fill="url(#xmRed)"/>' +
        '<circle cx="0" cy="-14" r="2.6" fill="url(#xmGold)"/><circle cx="-11" cy="10" r="2.4" fill="url(#xmGold)"/>' +
        '<g transform="translate(0 13)"><path d="M0 0 C-10 -8 -15 2 -6 4 C-2 4 0 2 0 0Z M0 0 C10 -8 15 2 6 4 C2 4 0 2 0 0Z" fill="url(#xmRedH)"/><path d="M-2 3 L-7 14 L-2 11 L0 16Z M2 3 L7 14 L2 11 L0 16Z" fill="#b81d2e"/><circle r="2.6" fill="url(#xmRed)"/></g></g>';
      return svgEl("xm-hs", "0 0 44 " + (y + 44), s, 44, y + 44);
    }
    var fills = { ballR: "url(#xmRed)", ballG: "url(#xmGold)", ballB: "url(#xmB3)", ballP: "url(#xmB4)" }, f = fills[kind] || fills.ballR;
    s = rope + '<rect x="17" y="' + (y - 1) + '" width="10" height="7" rx="2" fill="url(#xmGold)"/><g transform="translate(22 ' + (y + 22) + ')">' +
      '<circle r="16" fill="' + f + '"/><path d="M-15.6 -3 Q0 5 15.6 -3 L15.4 3 Q0 11 -15.4 3Z" fill="#fff" opacity=".85"/>' +
      '<path d="M-12 -2 L-8 4 L-4 -1 L0 5 L4 -1 L8 4 L12 -2" fill="none" stroke="' + (kind === "ballG" ? "#d1242f" : "#f5c04a") + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<ellipse cx="-6" cy="-8" rx="4" ry="6" fill="#fff" opacity=".55" transform="rotate(25 -6 -8)"/><circle cx="6" cy="9" r="1.6" fill="#fff" opacity=".4"/></g>';
    return svgEl("xm-hs", "0 0 44 " + (y + 42), s, 44, y + 42);
  }
  var HSND = { mistle: "mistle", wreath: "jingle", ballR: "ball", ballG: "ball", ballB: "ball", ballP: "ball", bell: "bell", star: "star", cane: "cane" };
  function buildHangs(layer, w, gy) {
    var big = w > 900, kinds = big ? ["ballR", "mistle", "bell", "ballG", "wreath", "star", "ballB", "cane", "mistle", "ballP", "bell", "ballR"] : ["ballR", "bell", "mistle", "star", "wreath", "cane"], n = kinds.length, i, els = [];
    dbg.hangs = n;
    for (i = 0; i < n; i++) {
      var x = Math.round(w * (0.06 + 0.88 * (i + 0.5) / n)), L = big ? 22 + ((i * 17) % 34) : 12 + ((i * 17) % 18);
      var el = D("xm-hang xm-" + kinds[i], layer); el.style.left = (x - 22) + "px"; el.style.top = (gy(x) + 4) + "px";
      el.style.setProperty("--sw", (2.6 + (i % 4) * 0.7).toFixed(1) + "deg"); el.style.setProperty("--sd", (3.2 + (i % 5) * 0.6).toFixed(1) + "s");
      el.style.animationDelay = (-i * 0.9) + "s";
      el.appendChild(hangSvg(kinds[i], L)); els.push(el);
    }
    els.forEach(function (e, k) {
      tap(e, function () {
        e.style.setProperty("--dir", Math.random() < 0.5 ? 1 : -1);
        pulse(e, "xm-ring", 2200); var c = centro(e); burst(c[0], c[1] + 20, { n: 9 });
        sfx(HSND[kinds[k]]);
        if (kinds[k] === "bell") bubble(e, "¡Ding, ding!");
        if (kinds[k] === "mistle") { bubble(e, "¡Un beso bajo el muérdago!"); burst(c[0], c[1] + 16, { n: 8, col: "#ff8fb1" }); }
        if (kinds[k] === "wreath") bubble(e, "¡Feliz Navidad!");
        [-2, -1, 1, 2].forEach(function (d) {                         // los vecinos se balancean un poco por el golpe
          var nb = els[k + d]; if (!nb) return;
          later(function () { nb.style.setProperty("--dir", d < 0 ? -1 : 1); pulse(nb, "xm-nudge", 1700); }, 110 * Math.abs(d));
        });
      });
    });
  }

  // ======================================================================
  //  Árbol de Navidad (la nieve se acumula por pisos y cae de forma realista)
  // ======================================================================
  var TIERS = [
    { A: [70, 22], L: [40, 66], R: [100, 66], hw: 30, d: "M70 22 L100 66 Q90 74 80 68 Q70 76 60 68 Q50 74 40 66Z", ln: "M40 66 Q50 74 60 68 Q70 76 80 68 Q90 74 100 66" },
    { A: [70, 44], L: [28, 104], R: [112, 104], hw: 42, d: "M70 44 L112 104 Q100 114 88 106 Q79 116 70 108 Q61 116 52 106 Q40 114 28 104Z", ln: "M28 104 Q40 114 52 106 Q61 116 70 108 Q79 116 88 106 Q100 114 112 104" },
    { A: [70, 70], L: [14, 144], R: [126, 144], hw: 56, d: "M70 70 L126 144 Q112 156 98 146 Q84 158 70 148 Q56 158 42 146 Q28 156 14 144Z", ln: "M14 144 Q28 156 42 146 Q56 158 70 148 Q84 158 98 146 Q112 156 126 144" }
  ];
  function surfY(k, x) { var T = TIERS[k], dx = Math.abs(x - 70); if (dx > T.hw + 1.5) return null; return T.A[1] + (dx / T.hw) * (T.L[1] - T.A[1]); }
  function capPath(k, lv) {
    var T = TIERS[k], f = 0.08 + 0.52 * clamp(lv, 0, 1.15), ax = T.A[0], ay = T.A[1];
    var lx = ax + (T.L[0] - ax) * f - 1.8 * lv, rx = ax + (T.R[0] - ax) * f + 1.8 * lv, y = ay + (T.L[1] - ay) * f;
    var th = 1.6 + 5.5 * lv, d = "M" + ax + " " + (ay - 0.4) + " L" + rx.toFixed(1) + " " + y.toFixed(1), n = 4, w = (rx - lx) / n, x = rx, i;
    for (i = 0; i < n; i++) { d += " Q" + (x - w / 2).toFixed(1) + " " + (y + th * (i % 2 ? 0.8 : 1.15)).toFixed(1) + " " + (x - w).toFixed(1) + " " + y.toFixed(1); x -= w; }
    return d + "Z";
  }
  function treeSvg() {
    var s = '<ellipse cx="70" cy="182" rx="56" ry="8" fill="rgba(30,50,80,.2)"/><rect x="61" y="150" width="18" height="28" rx="3" fill="url(#xmBrown)"/>' +
      '<ellipse class="xm-pile" cx="70" cy="178" rx="20" ry="3" fill="url(#xmSnowBall)" opacity="0"/>';
    [2, 1, 0].forEach(function (k) {
      var T = TIERS[k];
      s += '<g class="xm-tier xm-t' + k + '"><path d="' + T.d + '" fill="url(#xmGreenH)"/><path d="' + T.ln + '" fill="none" stroke="#0c3d27" stroke-opacity=".5" stroke-width="2"/>' +
        '<path class="xm-cap" d="' + capPath(k, 0.2) + '" fill="#fff" stroke="#c4d6ea" stroke-width=".7" stroke-linejoin="round"/>' +
        '<ellipse class="xm-tipL" cx="' + (T.L[0] + 4) + '" cy="' + (T.L[1] + 1) + '" rx="3" ry="1.5" fill="#fff"/><ellipse class="xm-tipR" cx="' + (T.R[0] - 4) + '" cy="' + (T.R[1] + 1) + '" rx="3" ry="1.5" fill="#fff"/></g>';
    });
    s += '<path d="M33 98 Q52 110 70 100 T107 98 M22 138 Q46 152 70 140 T118 138 M46 62 Q58 70 70 63 T94 62" fill="none" stroke="url(#xmGold)" stroke-width="2.4" stroke-dasharray="3.4 2.2" stroke-linecap="round"/>';
    var L = [[56, 56], [86, 54], [40, 92], [70, 86], [100, 90], [26, 130], [54, 124], [86, 126], [114, 130], [70, 126]];
    L.forEach(function (p, i) { var c = i % 5; s += '<g class="xm-tl" data-i="' + i + '"><circle cx="' + p[0] + '" cy="' + p[1] + '" r="6" fill="' + BULBS[c][0] + '" opacity=".5" filter="url(#xmBlur)"/><circle cx="' + p[0] + '" cy="' + p[1] + '" r="3" fill="url(#xmB' + c + ')"/></g>'; });
    var O = [[76, 48, "#xmGold"], [58, 84, "#xmRed"], [90, 100, "#xmB3"], [42, 124, "#xmGold"], [72, 116, "#xmRed"], [102, 128, "#xmB4"], [64, 56, "#xmB3"]];
    O.forEach(function (p, i) {
      s += '<g class="xm-orn" style="animation-delay:' + (-i * 0.7).toFixed(1) + 's"><rect x="' + (p[0] - 1.6) + '" y="' + (p[1] - 8) + '" width="3.2" height="3" fill="#c98a14"/><circle cx="' + p[0] + '" cy="' + p[1] + '" r="5.2" fill="url(' + p[2] + ')"/><ellipse cx="' + (p[0] - 1.8) + '" cy="' + (p[1] - 2) + '" rx="1.4" ry="2" fill="#fff" opacity=".7"/></g>';
    });
    s += '<g class="xm-star"><circle cx="70" cy="20" r="22" fill="url(#xmGlowG)" class="xm-halo"/><path d="M70 4 L75 15.2 L87.4 16.4 L78 24.6 L80.8 36.8 L70 30.4 L59.2 36.8 L62 24.6 L52.6 16.4 L65 15.2Z" fill="url(#xmGold)" stroke="#c98a14" stroke-width="1" stroke-linejoin="round"/>' +
      '<path d="M70 4 L70 30.4 M52.6 16.4 L80.8 36.8 M87.4 16.4 L59.2 36.8" stroke="#fff" stroke-opacity=".4" stroke-width=".8"/></g>' +
      '<g class="xm-clumps"></g>';
    return s;
  }
  // Controlador de nieve del árbol: acumula, se sobrecarga, se desliza y cae por pisos
  function treeCtl(svg) {
    var tiers = [], pile = 0, clumps = [], puffs = [], gC = svg.querySelector(".xm-clumps"), pileEl = svg.querySelector(".xm-pile"), k;
    var rnd = seeded(31 + trees.length * 7);
    for (k = 0; k < 3; k++) {
      var g = svg.querySelector(".xm-t" + k);
      tiers.push({ g: g, cap: g.querySelector(".xm-cap"), tl: g.querySelector(".xm-tipL"), tr: g.querySelector(".xm-tipR"), lv: 0.06 + rnd() * 0.1, shown: -1, rate: 0.011 + rnd() * 0.006, thr: 0.94 + rnd() * 0.14, busy: 0 });
    }
    var ctl = { tiers: tiers, pileV: function () { return pile; } };
    function draw(T, k2) {
      if (Math.abs(T.lv - T.shown) < 0.006) return; T.shown = T.lv;
      var lv = clamp(T.lv, 0, 1.15); T.cap.setAttribute("d", capPath(k2, lv));
      var rx = 1.2 + 5.2 * lv, ry = 0.7 + 3.8 * lv; T.tl.setAttribute("rx", rx.toFixed(1)); T.tl.setAttribute("ry", ry.toFixed(1)); T.tr.setAttribute("rx", rx.toFixed(1)); T.tr.setAttribute("ry", ry.toFixed(1));
    }
    function puff(x, y, big) {
      if (puffs.length > 40) return;
      var e = S("circle", { cx: x, cy: y, r: 2, fill: "#fff" }, gC); puffs.push({ e: e, x: x, y: y, life: 0, max: 0.45 + rnd() * 0.25, r0: 1.5 + big * 2.2, vx: (rnd() - 0.5) * 18, vy: -6 - rnd() * 10 });
    }
    function spring(k2) { var g = tiers[k2].g; g.classList.remove("xm-spring"); void g.getBoundingClientRect(); g.classList.add("xm-spring"); later(function () { g.classList.remove("xm-spring"); }, 900); }
    // suelta una fracción de la nieve de un piso en varios bloques; snd = suena (clic del usuario)
    ctl.shed = function (k2, frac, delay, snd) {
      var T = tiers[k2], amt = T.lv * frac, n, i, TT = TIERS[k2];
      if (amt < 0.03) return 0;
      T.lv -= amt; T.thr = 0.94 + rnd() * 0.14; T.busy = 1.1 + delay; spring(k2);
      n = Math.max(2, Math.round(2 + 7 * amt));
      for (i = 0; i < n; i++) {
        var side = (i % 2 ? 1 : -1) * (rnd() < 0.8 ? 1 : -1), m = amt / n, r = 2.2 + 9 * Math.sqrt(m), x = 70 + side * TT.hw * (0.45 + rnd() * 0.5);
        clumps.push({ k: k2, x: x, y: surfY(k2, x) - r * 0.5, vx: 0, vy: 0, side: side, r: r, m: m, st: 0, wait: delay + i * (0.04 + rnd() * 0.09), snd: !!snd, el: null });
      }
      dbg.tree.sheds++;
      return amt;
    };
    ctl.total = function () { return tiers[0].lv + tiers[1].lv + tiers[2].lv; };
    ctl.set = function (v) { tiers.forEach(function (T) { T.lv = v; }); };
    function step(s) {
      var i, c, j;
      for (i = clumps.length - 1; i >= 0; i--) {
        c = clumps[i];
        if (c.st === 0) {                                              // espera su turno (el piso cruje un instante)
          c.wait -= s; if (c.wait > 0) continue; c.st = 1; c.el = S("ellipse", { rx: c.r, ry: c.r * 0.85, fill: "url(#xmSnowBall)", stroke: "#c4d6ea", "stroke-width": 0.5 }, gC);
        }
        if (c.st === 1) {                                              // se desliza por la rama
          c.vx += c.side * 70 * s; c.x += c.vx * s; var sy = surfY(c.k, c.x);
          if (sy === null) { c.st = 2; c.vy = 6; } else c.y = sy - c.r * 0.5;
          c.el.setAttribute("rx", (c.r * 1.15).toFixed(1)); c.el.setAttribute("ry", (c.r * 0.8).toFixed(1));
        } else {                                                        // cae con la gravedad
          c.vy += 300 * s; c.x += c.vx * s * 0.6; c.y += c.vy * s;
          c.el.setAttribute("rx", (c.r * 0.9).toFixed(1)); c.el.setAttribute("ry", (c.r * (1 + Math.min(0.35, c.vy / 600))).toFixed(1));
          if (rnd() < s * 14) puff(c.x, c.y, 0.3);
          var landed = false;
          for (j = c.k + 1; j < 3; j++) { var sj = surfY(j, c.x); if (sj !== null && c.y + c.r * 0.4 >= sj && c.vy > 0) { tiers[j].lv = Math.min(1.2, tiers[j].lv + c.m * 0.72); puff(c.x, sj, 1); puff(c.x, sj, 0.6); dbg.tree.landed++; if (c.snd) sfx("thud", c.m * 4); landed = true; break; } }
          if (!landed && c.y >= 176) { pile = Math.min(1, pile + c.m * 0.55); puff(c.x, 177, 1.6); puff(c.x + 3, 177, 1); dbg.tree.landed++; if (c.snd) sfx("thud", c.m * 5); landed = true; }
          if (landed) { if (c.el.parentNode) c.el.remove(); clumps.splice(i, 1); continue; }
        }
        c.el.setAttribute("transform", "translate(" + c.x.toFixed(1) + " " + c.y.toFixed(1) + ")");
      }
      for (i = puffs.length - 1; i >= 0; i--) {
        var p = puffs[i]; p.life += s; if (p.life >= p.max) { p.e.remove(); puffs.splice(i, 1); continue; }
        p.x += p.vx * s; p.y += p.vy * s; var u = p.life / p.max; p.e.setAttribute("cx", p.x.toFixed(1)); p.e.setAttribute("cy", p.y.toFixed(1)); p.e.setAttribute("r", (p.r0 + u * 6).toFixed(1)); p.e.setAttribute("opacity", ((1 - u) * 0.85).toFixed(2));
      }
    }
    ctl.update = function (t, dt) {
      var k2, rem = dt, it = 0;
      for (k2 = 0; k2 < 3; k2++) {
        var T = tiers[k2]; T.lv = Math.min(1.2, T.lv + dt * T.rate); if (T.busy > 0) T.busy -= dt;
        if (T.busy <= 0 && T.lv >= T.thr) ctl.shed(k2, 0.55 + rnd() * 0.25, 0, false);   // demasiado peso: se desliza sola
        draw(T, k2);
      }
      while (rem > 1e-4 && it++ < 60) { var s = Math.min(rem, 0.04); step(s); rem -= s; }
      pile = Math.max(0, pile - dt * 0.006);
      if (pileEl) { pileEl.setAttribute("rx", (8 + 44 * pile).toFixed(1)); pileEl.setAttribute("ry", (1.2 + 5.5 * pile).toFixed(1)); pileEl.setAttribute("opacity", pile > 0.02 ? "1" : "0"); }
      if (trees[0] === ctl) { dbg.tree.levels = [tiers[0].lv, tiers[1].lv, tiers[2].lv]; dbg.tree.pile = pile; dbg.tree.clumps = clumps.length; }
    };
    ctl.paint = function () { tiers.forEach(draw); };
    return ctl;
  }
  function buildTree(cls) {
    var el = D("xm-tree-w " + (cls || "")); el.appendChild(svgEl("xm-tree", "0 0 140 190", treeSvg()));
    var svg = el.firstChild, ctl = treeCtl(svg);
    trees.push(ctl); ctl.paint();
    svg.querySelectorAll(".xm-tl").forEach(function (g) { treeLights.push({ g: g, i: +g.getAttribute("data-i"), lv: 0.9, sh: -1, sp: 0 }); });
    tap(el, function () {
      var tot = ctl.total(), n, k;
      pulse(svg, "xm-shake", 1500); pulse(svg, "xm-flashT", 2000);
      dbg.tree.shakes++;
      for (k = 0; k < 3; k++) ctl.shed(k, 0.9, k * 0.2, true);          // cae tanta nieve como hubiera acumulada
      sfx("tree", tot);
      var st = svg.querySelector(".xm-star").getBoundingClientRect();
      burst(st.left + st.width / 2, st.top + st.height / 2, { n: 14 });
      later(function () { var r = el.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height * 0.5, { n: Math.round(4 + tot * 8), kind: "conf", col: "#fff" }); }, 260);
      bubble(el, tot > 1.9 ? "¡Cuánta nieve!" : tot > 0.7 ? "¡Brrr, qué frío!" : FRASES[(Math.random() * 3) | 0]);
    });
    return { el: el, ctl: ctl };
  }

  // ======================================================================
  //  Regalos (se abren con un clic)
  // ======================================================================
  function giftsSvg() {
    function bow(x, y, c) { return '<g transform="translate(' + x + ' ' + y + ')"><path d="M0 0 C-12 -12 -17 2 -6 4 C-3 4 -1 2 0 0Z" fill="' + c + '"/><path d="M0 0 C12 -12 17 2 6 4 C3 4 1 2 0 0Z" fill="' + c + '"/><circle r="2.8" fill="' + c + '" stroke="rgba(0,0,0,.18)" stroke-width=".6"/><path d="M-8 -5 Q-10 -1 -6 2" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1"/></g>'; }
    var s = '<ellipse cx="65" cy="76" rx="58" ry="5" fill="rgba(30,50,80,.18)"/>';
    s += '<g class="xm-gift g1"><rect class="beam" x="12" y="-22" width="34" height="58" fill="url(#xmBeam)"/><rect class="bx" x="10" y="38" width="44" height="36" rx="3" fill="url(#xmRedH)"/><rect x="28" y="38" width="8" height="36" fill="url(#xmGold)"/>' +
      '<g class="lid"><rect x="6" y="28" width="52" height="12" rx="3" fill="url(#xmRedH)"/><rect x="28" y="28" width="8" height="12" fill="url(#xmGold)"/>' + bow(32, 27, "#f5c04a") + '</g></g>';
    s += '<g class="xm-gift g2"><rect class="beam" x="62" y="-14" width="28" height="56" fill="url(#xmBeam)"/><rect class="bx" x="60" y="50" width="34" height="24" rx="3" fill="url(#xmGreenBox)"/><rect x="73" y="50" width="7" height="24" fill="#e03545"/>' +
      '<g class="lid"><rect x="57" y="42" width="40" height="10" rx="3" fill="url(#xmGreenBox)"/><rect x="73" y="42" width="7" height="10" fill="#e03545"/>' + bow(77, 41, "#e03545") + '</g></g>';
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
        sfx("gift");
        later(function () { g.classList.remove("open"); }, 1900);
      });
    });
    return el;
  }

  // ======================================================================
  //  Muñeco de nieve (animaciones propias al azar + reacciones variadas al clic)
  // ======================================================================
  function snowmanSvg() {
    return '<ellipse cx="50" cy="143" rx="36" ry="5" fill="rgba(30,50,80,.2)"/>' +
      '<g class="xm-arm xm-arm-l"><path d="M30 68 L6 54 M12 57 L5 49 M10 55 L3 57" fill="none" stroke="#6b4528" stroke-width="3.2" stroke-linecap="round"/></g>' +
      '<g class="xm-arm xm-arm-r"><path d="M70 68 L94 52 M88 55 L95 46 M90 53 L97 55" fill="none" stroke="#6b4528" stroke-width="3.2" stroke-linecap="round"/></g>' +
      '<circle cx="50" cy="110" r="32" fill="url(#xmSnowBall)"/><circle cx="50" cy="68" r="24" fill="url(#xmSnowBall)"/>' +
      '<g fill="#2b2b36"><circle cx="50" cy="93" r="2.6"/><circle cx="50" cy="106" r="2.6"/><circle cx="50" cy="119" r="2.6"/><circle cx="50" cy="66" r="2.3"/><circle cx="50" cy="77" r="2.3"/></g>' +
      '<g fill="#fff" opacity=".6"><circle cx="49.3" cy="92.2" r=".8"/><circle cx="49.3" cy="105.2" r=".8"/><circle cx="49.3" cy="118.2" r=".8"/></g>' +
      '<g class="xm-scarf-tail"><path d="M58 54 L72 57 L79 82 L66 80Z" fill="url(#xmRedH)"/><path d="M60 62 L74 65 M62 70 L76 73" stroke="#fff" stroke-width="2.2" opacity=".85"/><path d="M66 80 L79 82 M68 80 l-1 5 M72 81 l-1 5 M76 82 l-1 5" stroke="#b81d2e" stroke-width="1.6" stroke-linecap="round"/></g>' +
      '<path d="M30 49 Q50 63 70 49 L71 58 Q50 72 29 58Z" fill="url(#xmRedH)"/><path d="M36 54 Q50 64 64 54" fill="none" stroke="#fff" stroke-width="2.4" opacity=".85"/><path d="M33 51.5 Q50 62 67 51.5" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1.2"/>' +
      '<g class="xm-head"><circle cx="50" cy="33" r="18" fill="url(#xmSnowBall)"/>' +
      '<g class="xm-eyes"><g class="xm-pup"><circle cx="43" cy="30" r="2.5" fill="#1a1a22"/><circle cx="57" cy="30" r="2.5" fill="#1a1a22"/><circle cx="43.8" cy="29.2" r=".8" fill="#fff"/><circle cx="57.8" cy="29.2" r=".8" fill="#fff"/></g></g>' +
      '<g class="xm-carrot"><path d="M50 34.5 L71 38.6 L50 41.4Z" fill="url(#xmCarrot)"/><path d="M56 36 L57 39.2 M62 37.2 L62.6 39.8" stroke="#b9470f" stroke-width=".8" stroke-opacity=".6"/></g>' +
      '<g class="xm-mouth" fill="#1a1a22"><circle cx="40.5" cy="40.5" r="1.2"/><circle cx="43.5" cy="43.6" r="1.2"/><circle cx="48" cy="45" r="1.2"/><circle cx="53" cy="45" r="1.2"/><circle cx="57.5" cy="43.6" r="1.2"/></g>' +
      '<ellipse cx="38" cy="37" rx="4" ry="2.6" fill="#ff9ab0" opacity=".5"/><ellipse cx="62" cy="37" rx="4" ry="2.6" fill="#ff9ab0" opacity=".45"/>' +
      '<g class="xm-hat"><ellipse cx="50" cy="19" rx="22" ry="5" fill="url(#xmHat)"/><path d="M38 -2 L62 -2 L63 19 Q50 23 37 19Z" fill="url(#xmHat)"/><ellipse cx="50" cy="-2" rx="12" ry="3" fill="#2d2d3a"/>' +
      '<path d="M37.4 12 Q50 17 62.6 12 L63 18.6 Q50 22.6 37 18.6Z" fill="url(#xmRedH)"/><g transform="translate(60 12)"><path d="M0 0 C4 -6 9 -2 5 1 C8 3 4 8 0 3Z" fill="#37a768"/><circle cx="-2.4" cy="2.4" r="2" fill="url(#xmRed)"/><circle cx="1" cy="4.2" r="1.8" fill="url(#xmRed)"/></g></g></g>';
  }
  function buildSnowman(cls) {
    var el = D("xm-snowman " + (cls || "")); el.appendChild(svgEl("xm-sm", "-6 -10 112 160", snowmanSvg()));
    var react = 0, lastIdle = "";
    function top() { var r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * 0.18, r]; }
    function cls1(c, ms) { pulse(el, c, ms); }
    var IDLE = {
      mira: function () { var c = Math.random() < 0.5 ? "lookL" : "lookR"; cls1(c, 1600); },
      saluda: function () { cls1("wave", 1500); },
      tirita: function () { cls1("shiver", 1000); },
      inclina: function () { cls1("tilt", 1700); },
      silba: function () { var p = top(); notes(p[0], p[1], 3); cls1("tilt", 1200); },
      sombrero: function () { cls1("tip", 1400); },
      salta: function () { cls1("hop", 750); }
    };
    var IKEYS = Object.keys(IDLE);
    function ball() {
      if (!fxBox || !animar()) return;
      var r = el.getBoundingClientRect(), b = D("xm-ball", fxBox), sx = r.left + r.width * 0.85, sy = r.top + r.height * 0.36;
      var dx = -Math.min(sx - 30, rr(140, 340)), dy = rr(-10, 60);
      b.style.left = sx + "px"; b.style.top = sy + "px"; b.style.setProperty("--dx", dx.toFixed(0) + "px"); b.style.setProperty("--dy", dy.toFixed(0) + "px");
      later(function () { var q = b.getBoundingClientRect(); burst(q.left + q.width / 2, q.top + q.height / 2, { n: 9, col: "#fff" }); b.remove(); }, 900);
    }
    var REACT = [
      ["sombrero", function () { cls1("tip", 1500); bubble(el, "¡Hola!"); sfx("pop"); }],
      ["salto", function () { cls1("hop", 800); bubble(el, "¡Boing!"); sfx("boing"); }],
      ["baile", function () { cls1("dance", 2600); var p = top(); notes(p[0], p[1], 6); bubble(el, "¡A bailar!"); sfx("dance"); }],
      ["nariz", function () { cls1("nose", 1000); bubble(el, "¡Mi nariz!"); sfx("boing"); }],
      ["bola", function () { cls1("throw", 900); ball(); bubble(el, "¡Bola de nieve!"); sfx("throw"); }],
      ["risa", function () { cls1("giggle", 1500); bubble(el, "¡Jajajá!"); sfx("giggle"); }]
    ];
    tap(el, function () {
      var a = REACT[react % REACT.length]; react++;
      dbg.snowman.last = a[0]; dbg.snowman.clicks++;
      a[1](); var c = centro(el); burst(c[0], c[1] - 30, { n: 10, col: "#fff" });
    });
    return {
      el: el,
      idle: { next: rr(2.5, 5), update: function (t, dt) {
        this.next -= dt; if (this.next > 0) return; this.next = rr(3, 7);
        var k; do { k = IKEYS[(Math.random() * IKEYS.length) | 0]; } while (k === lastIdle); lastIdle = k; dbg.snowman.idle = k; IDLE[k]();
      } }
    };
  }

  // ======================================================================
  //  Chocolatada caliente con vapor y panetón (genérico, sin marcas)
  // ======================================================================
  function treatSvg() {
    function el(cx, cy, rx, ry, c, o, r) { return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + c + '" opacity="' + o + '"' + (r ? ' transform="rotate(' + r + ' ' + cx + ' ' + cy + ')"' : "") + '/>'; }
    var pores = "", k, rnd = seeded(77);
    for (k = 0; k < 22; k++) pores += el((78 + rnd() * 28).toFixed(1), (52 + rnd() * 22).toFixed(1), (0.8 + rnd() * 1.3).toFixed(1), (0.5 + rnd() * 0.8).toFixed(1), "#c98f2c", (0.35 + rnd() * 0.3).toFixed(2), (rnd() * 90) | 0);
    var rais = [[80, 62], [90, 55], [99, 66], [86, 70], [104, 57], [94, 62]], fruit = [[84, 57, "#6fb04a"], [101, 70, "#6fb04a"], [92, 71, "#d9473f"], [97, 53, "#e08a2c"], [79, 70, "#d9473f"]], fr = "";
    rais.forEach(function (p) { fr += '<ellipse cx="' + p[0] + '" cy="' + p[1] + '" rx="2.5" ry="2.1" fill="#4a2a38"/><ellipse cx="' + (p[0] - 0.7) + '" cy="' + (p[1] - 0.7) + '" rx=".8" ry=".6" fill="#fff" opacity=".35"/>'; });
    fruit.forEach(function (p) { fr += '<rect x="' + p[0] + '" y="' + p[1] + '" width="3.6" height="3.2" rx=".8" fill="' + p[2] + '" transform="rotate(' + (p[0] * 7 % 40) + ' ' + p[0] + ' ' + p[1] + ')"/>'; });
    var bar = '<g transform="translate(103 70) rotate(-14)"><rect width="13" height="9" rx="1" fill="#3a2418"/><path d="M4.3 0 V9 M8.6 0 V9 M0 4.5 H13" stroke="#6a4630" stroke-width=".7"/><path d="M0.5 .5 H12.5" stroke="#8a6048" stroke-width=".6"/></g>';
    return '<ellipse cx="82" cy="86" rx="76" ry="5" fill="rgba(30,50,80,.2)"/><rect x="2" y="76" width="156" height="9" rx="4.5" fill="url(#xmBrown)"/><path d="M8 78.4 L152 78.4" stroke="#d8aa78" stroke-opacity=".55" stroke-width="1"/>' +
      // panetón entero (genérico: papel liso con cinta roja)
      '<g class="xm-pan"><path d="M8 76 C6 52 17 30 33 30 C49 30 60 52 58 76Z" fill="url(#xmPan)"/><path d="M11 58 C14 40 22 32 33 31 C44 32 52 40 55 58 C46 52 20 52 11 58Z" fill="#a4631f" opacity=".45"/>' +
      '<g fill="#fff" opacity=".85"><circle cx="24" cy="40" r=".9"/><circle cx="33" cy="35" r=".9"/><circle cx="42" cy="41" r=".9"/><circle cx="30" cy="47" r=".9"/><circle cx="47" cy="48" r=".9"/><circle cx="21" cy="50" r=".9"/></g>' +
      '<path d="M7.4 62 L58.6 62 L58 76 L8 76Z" fill="#f6ead0"/><path d="M7.7 66 L58.3 66 L58.1 72 L7.9 72Z" fill="url(#xmRedH)"/><text x="33" y="71" text-anchor="middle" font-size="5.6" font-weight="700" fill="#fff6c4" font-family="Georgia,serif">Panetón</text>' +
      '<path d="M18 33 Q24 27 33 30" stroke="#fff" stroke-opacity=".5" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>' +
      // plato y tajada (miga amarilla con pasas y frutas confitadas)
      '<path d="M66 75.4 L120 75.4 L116 79 L70 79Z" fill="#fff"/><ellipse cx="93" cy="76.2" rx="27" ry="3" fill="#fff"/><ellipse cx="93" cy="76.2" rx="27" ry="3" fill="none" stroke="#d5dbe7" stroke-width=".8"/>' +
      '<g class="xm-slice"><path d="M72 76 L75 54 C79 44 105 44 109 54 L113 76Z" fill="#f4cf62"/><path d="M72 76 L75 54 C79 44 105 44 109 54 L113 76Z" fill="url(#xmPan)" opacity=".28"/>' + pores + fr +
      '<path d="M75 54 C79 44 105 44 109 54" fill="none" stroke="#b9772d" stroke-width="3" stroke-linecap="round"/><path d="M75.4 54 L72 76 M108.6 54 L113 76" stroke="#d99a3d" stroke-width="1.6" stroke-linecap="round"/><path d="M79 49 Q92 44.4 104 49" stroke="#fff" stroke-opacity=".35" stroke-width="1.2" fill="none"/></g>' + bar +
      // taza blanca de esmalte con chocolate espumoso y canela
      '<g class="xm-mug"><path d="M118 52 L118 71 Q118 78 126 78 L145 78 Q153 78 153 71 L153 52Z" fill="url(#xmMug)"/><path d="M117.6 53 L153.4 53" stroke="#2b2f3a" stroke-width="1.2"/>' +
      '<path d="M153 57 C165 55 165 72 151 71" fill="none" stroke="#d6deeb" stroke-width="4.4" stroke-linecap="round"/><path d="M153 57 C165 55 165 72 151 71" fill="none" stroke="#c4cddd" stroke-width=".7" stroke-linecap="round" opacity=".7"/>' +
      '<ellipse cx="135.5" cy="52" rx="18.5" ry="4.8" fill="#fff" stroke="#2b2f3a" stroke-width="1.2"/><ellipse cx="135.5" cy="52.4" rx="16.4" ry="3.6" fill="#a8705a"/>' +
      '<g fill="#d9b09a" opacity=".85"><circle cx="128" cy="52" r="1.2"/><circle cx="132" cy="53.4" r="1"/><circle cx="137" cy="51.6" r="1.3"/><circle cx="141" cy="53" r="1"/><circle cx="144.4" cy="51.8" r=".9"/><circle cx="133" cy="51" r=".8"/></g><ellipse cx="130" cy="51.2" rx="5" ry="1" fill="#fff" opacity=".35"/>' +
      '<path d="M142 52.5 L151 36" stroke="#b86a34" stroke-width="3.2" stroke-linecap="round"/><path d="M142.6 52 L150.6 37.2" stroke="#d99a62" stroke-width="1" stroke-linecap="round"/><ellipse cx="121.6" cy="66" rx="1.3" ry="8" fill="#fff" opacity=".6"/></g>' +
      '<g class="xm-steam" fill="none" stroke="#8fa4c0" stroke-width="3" stroke-linecap="round" filter="url(#xmBlurS)"><path class="s1" d="M128 44 C122 36 134 30 128 22 C123 15 132 10 128 2"/><path class="s2" d="M137 44 C131 34 144 28 137 18 C132 10 141 4 137 -6"/><path class="s3" d="M146 44 C141 37 152 32 146 24 C142 17 150 12 146 4"/></g>';
  }
  function buildTreat() {
    var el = D("xm-treat"), react = 0; el.appendChild(svgEl("xm-tr", "0 -14 168 104", treatSvg()));
    var R = [
      ["chocolate", function () { pulse(el, "puff", 1700); sfx("sip"); bubble(el, "¡Chocolatada caliente!"); var c = centro(el); burst(c[0] + 40, c[1] - 20, { n: 6, col: "#ff8fb1" }); }],
      ["paneton", function () { pulse(el, "bounce", 900); sfx("pop"); bubble(el, "¡Con panetón sabe mejor!"); }],
      ["salud", function () { pulse(el, "cheers", 1000); sfx("clink"); bubble(el, "¡Salud!"); var c = centro(el); burst(c[0] + 30, c[1] - 24, { n: 10 }); }]
    ];
    dbg.treat = { last: "", clicks: 0 };
    tap(el, function () { var a = R[react % R.length]; react++; dbg.treat.last = a[0]; dbg.treat.clicks++; a[1](); });
    return el;
  }

  // ======================================================================
  //  Trineo de Papá Noel con tres renos (cruza la pantalla de vez en cuando; clic = lluvia de regalos)
  // ======================================================================
  function leg(hx, hy, cls, col) {
    return '<g class="xm-th ' + cls + '"><path d="M' + (hx - 3.8) + ' ' + hy + ' Q' + (hx - 4.4) + ' ' + (hy + 7) + ' ' + (hx - 2) + ' ' + (hy + 11.5) + ' L' + (hx + 2) + ' ' + (hy + 11.5) + ' Q' + (hx + 4.4) + ' ' + (hy + 7) + ' ' + (hx + 3.8) + ' ' + hy + 'Z" fill="' + col + '"/>' +
      '<g class="xm-sh ' + cls + '"><path d="M' + (hx - 2) + ' ' + (hy + 11) + ' L' + (hx - 1.5) + ' ' + (hy + 18.5) + ' L' + (hx + 1.5) + ' ' + (hy + 18.5) + ' L' + (hx + 2) + ' ' + (hy + 11) + 'Z" fill="' + col + '"/>' +
      '<path d="M' + (hx - 2.3) + ' ' + (hy + 18) + ' L' + (hx + 2.6) + ' ' + (hy + 18) + ' L' + (hx + 3) + ' ' + (hy + 21.2) + ' L' + (hx - 2.6) + ' ' + (hy + 21.2) + 'Z" fill="#2b1a10"/></g></g>';
  }
  function deerSvg(x, lead, i) {
    var s = '<g transform="translate(' + x + ' 0)"><g class="xm-dr" style="--ph:' + (-i * 0.17).toFixed(2) + 's">';
    s += leg(13, 43, "gb", "#6a3f20") + leg(44, 43, "ga", "#6a3f20");                                     // patas lejanas
    s += '<g class="xm-tail"><path d="M9 31 C1 25 -2 34 3 39 C7 38 9 35 9 31Z" fill="#fff"/><path d="M5 30 C2 31 1 34 3 37" stroke="#e3e9f2" stroke-width="1" fill="none"/></g>';
    s += '<path d="M8 36 C6 26 18 22 32 22 C45 22 52 26 53 33 C54 41 46 48 32 48 C18 48 10 46 8 36Z" fill="url(#xmDeer)"/>' +
      '<path d="M13 41 C22 50 42 50 50 40 C45 46 22 48 13 41Z" fill="#ecc89b" opacity=".85"/><path d="M12 30 C20 24 38 24 48 28" stroke="#d9a26a" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"/>' +
      '<path d="M21 22.4 Q32 19.6 43 23.4 L41 35 Q32 37.4 23 34Z" fill="url(#xmRedV)"/><path d="M21.4 25 Q32 22.4 42.6 26" stroke="#f5c04a" stroke-width="1.4" fill="none"/><circle cx="32" cy="29.4" r="1.8" fill="#f5c04a"/>';
    s += leg(13, 43, "ga", "#a86a37") + leg(44, 43, "gb", "#a86a37");                                      // patas cercanas
    s += '<path d="M43 27 C47 19 51 13 55 8 L67 14 C63 22 61 31 58 41 L48 40Z" fill="url(#xmDeer)"/><path d="M47 33 C53 31 57 36 54 43 C51 40 48 42 45 41Z" fill="#fff6ea"/>' +
      '<path d="M50 24 Q57 32 52 41" fill="none" stroke="#c9323f" stroke-width="3.2" stroke-linecap="round"/><g class="xm-jing"><circle cx="52" cy="41.4" r="2.8" fill="url(#xmGold)" stroke="#b7791f" stroke-width=".5"/><path d="M50.4 41.4 L53.6 41.4" stroke="#b7791f" stroke-width=".5"/></g>' +
      '<path d="M52 41 Q46 48 36 48" fill="none" stroke="#c9323f" stroke-width="2.2" stroke-linecap="round"/>';
    // cabeza con astas, orejas y hocico
    s += '<g class="xm-hd">' +
      '<path d="M57 8 C53 0 55 -8 51 -15 M54 -3 C49 -5 46 -9 45 -13 M55 -9 C59 -11 60 -15 58 -19 M52.4 -11 C49 -11 47 -15 48 -18" fill="none" stroke="#5b3a20" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M61 7 C58 -1 61 -8 58 -15 M59.4 -4 C55 -6 53 -10 52 -14 M60.4 -9 C64 -11 65 -15 63 -19" fill="none" stroke="#7a4f2c" stroke-width="2.5" stroke-linecap="round"/>' +
      '<g class="xm-ear"><ellipse cx="53.4" cy="7" rx="2.7" ry="5.8" transform="rotate(-38 53.4 7)" fill="#8a5229"/><ellipse cx="53.6" cy="7.2" rx="1.4" ry="3.6" transform="rotate(-38 53.6 7.2)" fill="#e8a58e"/></g>' +
      '<ellipse cx="60" cy="13" rx="9.2" ry="7.6" transform="rotate(-14 60 13)" fill="url(#xmDeer)"/><ellipse cx="69.4" cy="17.4" rx="6.4" ry="4.6" transform="rotate(8 69.4 17.4)" fill="#d6ad80"/>' +
      '<ellipse cx="58" cy="9.4" rx="3.4" ry="2" fill="#fff" opacity=".18"/>' +
      '<g class="xm-ear"><ellipse cx="58.6" cy="6" rx="2.6" ry="5.4" transform="rotate(-18 58.6 6)" fill="#a2652f"/><ellipse cx="58.8" cy="6.2" rx="1.3" ry="3.4" transform="rotate(-18 58.8 6.2)" fill="#f0b6a0"/></g>' +
      '<circle cx="62.6" cy="11.6" r="1.9" fill="#1a1a22"/><circle cx="63.2" cy="11" r=".7" fill="#fff"/><path d="M60.6 9.6 Q62.6 8.4 64.6 9.4" stroke="#5e3a1e" stroke-width=".9" fill="none"/>' +
      '<path d="M66 20.2 Q70 21.4 74 19.6" stroke="#8a5a36" stroke-width=".8" fill="none"/>' +
      (lead ? '<circle class="xm-nose" cx="75" cy="16.6" r="11" fill="url(#xmNoseGlow)"/><circle cx="75" cy="16.6" r="3.8" fill="#ff3434" stroke="#b81d1d" stroke-width=".6"/><circle cx="74" cy="15.5" r="1.1" fill="#fff" opacity=".8"/>'
        : '<circle cx="74.6" cy="16.2" r="2.3" fill="#2a1a12"/><circle cx="73.8" cy="15.4" r=".7" fill="#fff" opacity=".6"/>') +
      '</g></g></g>';
    return s;
  }
  function sleighSvg() {
    var s = '<path d="M116 52 L200 40 L282 40 L364 40" fill="none" stroke="#e9c46a" stroke-width="1.5"/>' +      // tirantes dorados
      '<g class="xm-reins"><path d="M100 14 Q150 26 202 38 M100 14 Q190 22 284 38" fill="none" stroke="#7a4a26" stroke-width="1.1" opacity=".9"/></g>';
    s += '<g class="xm-sl">' + deerSvg(314, true, 0) + deerSvg(232, false, 1) + deerSvg(150, false, 2);
    // trineo: patines, cuerpo, adornos
    s += '<g class="xm-sled"><path d="M4 71 Q50 77 108 71 Q124 69 126 56" fill="none" stroke="#6b4a1e" stroke-width="5.2" stroke-linecap="round" opacity=".35" transform="translate(0 1.4)"/>' +
      '<path d="M8 66 Q0 66 1 58 Q2 53 8 54 M4 70 Q50 76 108 70 Q124 68 127 55 Q127 49 121 50" fill="none" stroke="#e8b84a" stroke-width="3.6" stroke-linecap="round"/><path d="M6 70 Q50 75.4 108 69.4" fill="none" stroke="#fff6c0" stroke-width="1" stroke-linecap="round" opacity=".7"/>' +
      '<path d="M26 69 L28 56 M60 71 L58 56 M94 70 L94 54 M118 62 L116 52" stroke="#c98a14" stroke-width="2.4" stroke-linecap="round"/>' +
      '<g class="xm-sack"><path d="M2 28 C-6 36 -2 52 12 54 L34 52 C42 44 38 30 28 26 C20 22 8 22 2 28Z" fill="#a8743f"/><path d="M6 30 Q16 36 12 50 M20 28 Q26 38 22 52" stroke="#7d5129" stroke-width="1" fill="none" opacity=".7"/>' +
      '<path d="M18 23 Q24 14 30 22" fill="none" stroke="#e03545" stroke-width="2.4" stroke-linecap="round"/><circle cx="24" cy="21" r="3" fill="url(#xmGold)"/>' +
      '<rect x="3" y="14" width="13" height="12" rx="2" fill="url(#xmGreenBox)" transform="rotate(-10 9 20)"/><rect x="8" y="13" width="3" height="13" fill="#e03545" transform="rotate(-10 9 20)"/>' +
      '<rect x="16" y="10" width="11" height="12" rx="2" fill="url(#xmBlueH)" transform="rotate(9 21 16)"/><rect x="20.4" y="10" width="2.4" height="12" fill="#fff" transform="rotate(9 21 16)"/><circle cx="31" cy="16" r="3.6" fill="url(#xmRed)"/></g>' +
      '<path d="M14 26 Q10 55 34 59 L98 59 Q118 56 121 32 Q112 42 98 42 L32 42 Q16 42 14 26Z" fill="url(#xmWood)"/>' +
      '<path d="M14 26 Q10 55 34 59 L98 59 Q118 56 121 32" fill="none" stroke="#f5c04a" stroke-width="2.8" stroke-linecap="round"/><path d="M30 48 Q56 54 98 48" fill="none" stroke="#f5c04a" stroke-width="1.4" stroke-dasharray="1 4" stroke-linecap="round"/>' +
      '<path d="M40 44 Q36 52 46 54 Q54 54 50 48 M84 44 Q88 52 78 54 Q70 54 74 48" fill="none" stroke="#f5c04a" stroke-width="1.5" stroke-linecap="round"/><path d="M20 36 Q36 40 60 40" stroke="#fff" stroke-opacity=".22" stroke-width="2" fill="none" stroke-linecap="round"/>' +
      '<path d="M121 32 Q132 28 131 42 Q130 50 122 50" fill="none" stroke="#f5c04a" stroke-width="3" stroke-linecap="round"/><circle cx="127" cy="34" r="3.2" fill="url(#xmGlowG)" class="xm-nose"/><circle cx="127" cy="34" r="1.6" fill="#fff6c4"/>' +
      // Papá Noel
      '<path d="M54 40 C54 22 60 18 74 18 C88 18 92 24 91 40Z" fill="url(#xmRed)"/><rect x="55" y="36.6" width="36" height="5.4" fill="#2b2b36"/><rect x="68" y="35.8" width="8" height="6.8" rx="1" fill="url(#xmGold)"/><rect x="70" y="37.4" width="4" height="3.6" fill="#2b2b36"/>' +
      '<path d="M72 20 L72 36" stroke="#fff" stroke-width="3.4" opacity=".9"/>' +
      '<g class="xm-santa-arm"><path d="M52 28 Q44 20 40 8" stroke="#d1242f" stroke-width="7.4" stroke-linecap="round" fill="none"/><path d="M50 26 L42 14" stroke="#fff" stroke-width="3" opacity=".9" stroke-linecap="round"/><circle cx="39" cy="5.4" r="4.6" fill="#f3f3f7"/><path d="M36.4 3.6 Q39 1 41.6 3.6" stroke="#cfd2dc" stroke-width=".8" fill="none"/></g>' +
      '<path d="M86 26 Q96 30 100 18" stroke="#d1242f" stroke-width="7" stroke-linecap="round" fill="none"/><path d="M93 24 L97.6 22" stroke="#fff" stroke-width="3" opacity=".9"/><circle cx="100.4" cy="15.6" r="4.4" fill="#f3f3f7"/>' +
      '<g class="xm-head-s"><circle cx="72" cy="9" r="10.4" fill="#ffd9bd"/><circle cx="65.2" cy="12.4" r="2.2" fill="#ff9ab0" opacity=".5"/><circle cx="78.8" cy="12.4" r="2.2" fill="#ff9ab0" opacity=".5"/>' +
      '<g class="xm-beard"><path d="M61.4 9 Q60 22 66 28 Q72 34 78 28 Q84 22 82.6 9 Q80 17 72 17 Q64 17 61.4 9Z" fill="#fff"/><path d="M64 20 Q66 26 70 28 M74 28 Q79 26 80 20" stroke="#dfe5f0" stroke-width="1" fill="none"/></g>' +
      '<path d="M65.4 13.4 Q72 9.4 78.6 13.4 Q72 16.6 65.4 13.4Z" fill="#fff"/><circle cx="72" cy="11.2" r="2" fill="#f1a08a"/>' +
      '<circle cx="68.2" cy="7.2" r="1.15" fill="#1a1a22"/><circle cx="75.8" cy="7.2" r="1.15" fill="#1a1a22"/><path d="M65.8 4.6 Q68.2 3 70.4 4.4 M73.6 4.4 Q75.8 3 78.2 4.6" stroke="#e8e8f0" stroke-width="1.3" fill="none" stroke-linecap="round"/>' +
      '<circle cx="68.2" cy="7.2" r="3.2" fill="none" stroke="#c98a14" stroke-width=".8"/><circle cx="75.8" cy="7.2" r="3.2" fill="none" stroke="#c98a14" stroke-width=".8"/><path d="M71.4 7 L72.6 7" stroke="#c98a14" stroke-width=".8"/>' +
      '<path d="M62 4 Q60 -9 72 -11 Q82 -11 84 0 Q80 -4 71 -3 Q64 -2 62 4Z" fill="url(#xmRed)"/><path d="M61 3.4 Q72 -3 83.6 0 L84.4 4.6 Q72 -0.4 60.4 7.4Z" fill="#fff"/>' +
      '<g class="xm-pom"><path d="M80 -6 Q90 -4 92 4" stroke="#d1242f" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="92.6" cy="5.4" r="4.6" fill="#fff"/><circle cx="91.2" cy="4" r="1.2" fill="#e3e9f2"/></g></g>' +
      '</g></g>';
    return s;
  }
  function buildSleigh(layer, w, h) {
    var big = w > 900, el = D("xm-sleigh", layer), W = big ? 380 : 250; el.style.width = W + "px"; el.style.height = Math.round(W * 106 / 420) + "px";
    var inner = D("xm-sl-in", el); inner.appendChild(svgEl("xm-sl-svg", "-8 -24 420 106", sleighSvg()));
    var rnd = seeded(5), st = { wait: 5, flying: false, u: 0, T: 17, dir: 1, y0: 120, A: 30, lastTrail: 0, hide: true };
    function soltar() {
      var c = centro(el), i; bubble(el, "¡Ho, ho, ho! ¡Feliz Navidad!"); sfx("sleigh");
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
        if (!st.flying) { st.wait -= dt; el.style.visibility = "hidden"; dbg.sleigh.flying = false; if (st.wait <= 0) { st.flying = true; st.u = 0; st.dir = -st.dir; st.T = big ? 20 : 15; st.y0 = 70 + rnd() * Math.max(40, h * 0.3); st.A = 18 + rnd() * 26; inner.style.transform = "scaleX(" + (st.dir > 0 ? 1 : -1) + ")"; } return; }
        st.u += dt / st.T;
        if (st.u >= 1) { st.flying = false; st.wait = 16 + rnd() * 14; return; }
        el.style.visibility = "visible";
        var ew = el.offsetWidth, x = st.dir > 0 ? -ew + st.u * (w + ew * 2) : w + ew - st.u * (w + ew * 2);
        var y = st.y0 + st.A * Math.sin(st.u * 7) - 12 * Math.sin(st.u * PI), tilt = Math.cos(st.u * 7) * 3.2 * st.dir * -1;
        el.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) rotate(" + tilt.toFixed(1) + "deg)";
        dbg.sleigh.flying = true; dbg.sleigh.x = x; dbg.sleigh.y = y;
        if (t - st.lastTrail > 0.09 && animar()) { st.lastTrail = t; var tx = x + (st.dir > 0 ? ew * 0.06 : ew * 0.94), ty = y + el.offsetHeight * 0.6; var lay = el.parentNode.getBoundingClientRect(); burst(lay.left + tx, lay.top + ty, { n: 1, col: "#fff3b0" }); }
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
  var layerEl = null, resizeT = 0, lastBig = null, boton = null, botonSon = null;
  function navAlto() { var nav = document.querySelector(".topnav"); return nav ? nav.offsetHeight : 0; }
  function montarCapa() {
    var anim = animar(), w = window.innerWidth, big = w > 900; lastBig = big;
    var h = Math.max(240, window.innerHeight - navAlto());
    var layer = D("xm-layer"); layer.setAttribute("aria-hidden", "true"); layer.style.top = navAlto() + "px";
    fxBox = D("xm-fx"); document.body.appendChild(fxBox);
    if (anim) objs.push(buildSnow(layer, w, h)); else { var sn = buildSnow(layer, w, h); }
    var gar = buildGarland(w); layer.appendChild(gar);
    buildHangs(layer, w, gar._gy);
    var man = buildSnowman("corner"); layer.appendChild(man.el);
    if (anim) objs.push(man.idle);
    if (anim) objs.push(buildSleigh(layer, w, h));
    document.body.appendChild(layer); layerEl = layer;
  }
  function montar() {
    if (document.querySelector(".xm-layer")) return;
    // la Navidad reemplaza a Halloween (nunca las dos a la vez)
    if (window.PangoaHalloween && document.querySelector(".hw-layer")) window.PangoaHalloween.desmontar();
    root.setAttribute("data-navidad", "on");
    if (!document.querySelector(".xm-defs")) document.body.appendChild(D("xm-defs-wrap")).innerHTML = DEFS;
    trees = []; treeLights = []; light.mode = 0; light.t = 0; light.lock = 0; light.next = 9; dbg.mode = 0; dbg.modeName = MODES[0];
    montarCapa();
    document.querySelectorAll(".scene").forEach(function (sc) {
      if (sc.querySelector(".xm-deco")) return;
      var deco = D("xm-deco"); deco.setAttribute("aria-hidden", "true");
      var tr = buildTree("t1"); deco.appendChild(tr.el); deco.appendChild(buildGifts("g1")); deco.appendChild(buildTreat());
      if (animar()) objs.push(tr.ctl);
      sc.appendChild(deco);
    });
    if (animar()) { objs.push({ update: lightsUpdate }); }
    if (animar() && objs.length) startLoop();
    actualizarBoton(); crearSonido();
  }
  function desmontar() {
    stopLoop();
    timers.forEach(clearTimeout); timers = [];
    root.removeAttribute("data-navidad");
    document.querySelectorAll(".xm-layer, .xm-deco, .xm-fx, .xm-defs-wrap").forEach(function (n) { n.remove(); });
    layerEl = null; fxBox = null; bulbs = []; trees = []; treeLights = [];
    if (botonSon) { botonSon.remove(); botonSon = null; }
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

  // ---------- Botones (junto al de modo oscuro) ----------
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
  function textoSonido() { if (!botonSon) return; botonSon.textContent = AU.on ? "Sonido: activado" : "Sonido: silenciado"; botonSon.setAttribute("aria-pressed", AU.on ? "true" : "false"); }
  function crearSonido() {
    if (botonSon || !boton) return;
    botonSon = boton.cloneNode(false); botonSon.id = "navidadSoundBtn";
    botonSon.setAttribute("aria-label", "Activar o silenciar los sonidos de la decoración de Navidad");
    botonSon.addEventListener("click", function () {
      AU.on = !AU.on; dbg.sounds.on = AU.on;
      try { localStorage.setItem(SKEY, AU.on ? "on" : "off"); } catch (e) {}
      textoSonido(); if (AU.on) sfx("bulb", 3);
    });
    boton.parentNode.insertBefore(botonSon, boton.nextSibling); textoSonido();
  }

  function init() { crearBoton(); if (activo()) montar(); else actualizarBoton(); }
  dbg.fillTree = function (v) { trees.forEach(function (t) { t.set(v); }); };
  dbg.sleighSvg = function () { return DEFS + '<svg viewBox="-8 -24 420 106" width="1260" height="318">' + sleighSvg() + "</svg>"; };
  dbg.treatSvg = function () { return DEFS + '<svg viewBox="0 -14 168 104" width="1000" height="620">' + treatSvg() + "</svg>"; };
  dbg.snowmanSvg = function () { return DEFS + '<svg viewBox="-6 -10 112 160" width="448" height="640">' + snowmanSvg() + "</svg>"; };
  window.PangoaNavidad = { montar: montar, desmontar: desmontar, debug: dbg };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
