// Decoración de Halloween con figuras articuladas y 3D por capas (solo visual, aria-hidden, sin clics).
//  - Capa FIJA: se ve también al bajar la página (telarañas bajo el menú, araña, murciélagos, fantasma errante, calabaza de esquina).
//  - Araña: hilo anclado a la telaraña, patas por segmentos en capas 3D; baja por tramos y sube agarrando el hilo con las patas delanteras.
//  - Murciélagos: alas en 3D (barrido hacia el espectador), giro del cuerpo y profundidad; cruzan desde ambos lados.
//  - Calabazas y fantasma en capas 3D que miran al puntero según su posición real en pantalla.
// Se activa sola del 24 de octubre al 2 de noviembre; la elección de la persona manda siempre.
(function () {
  "use strict";
  var root = document.documentElement;
  var KEY = "pangoa_halloween";
  var NS = "http://www.w3.org/2000/svg";
  var RAD = Math.PI / 180;

  // ---------- utilidades ----------
  function guardado() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function guardar(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function enTemporada() { var d = new Date(), m = d.getMonth(), n = d.getDate(); return (m === 9 && n >= 24) || (m === 10 && n <= 2); }
  function activo() { var g = guardado(); return g === null ? enTemporada() : g === "on"; }
  function animar() { return root.getAttribute("data-fx") === "on"; }
  function S(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function D(cls, parent) { var e = document.createElement("div"); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeIO(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
  function seeded(s) { return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  var uid = 0;

  // ---------- estado global y puntero ----------
  var objs = [], raf = 0, lastT = 0;
  var ptr = { x: 0, y: 0, tx: 0, ty: 0, mx: null, my: null, last: -999 };
  var dbg = { spider: null, bats: [] };
  function onMove(e) {
    ptr.mx = e.clientX; ptr.my = e.clientY;
    ptr.tx = (e.clientX / window.innerWidth) * 2 - 1; ptr.ty = (e.clientY / window.innerHeight) * 2 - 1;
    ptr.last = performance.now() / 1000;
  }
  // peso con el que las figuras siguen al puntero (se relajan si no hay movimiento por 4 s)
  function followW(t) { if (ptr.mx === null) return 0; return clamp(1 - (t - ptr.last - 4) / 1.5, 0, 1); }
  // ángulos hacia el puntero según la posición real de la figura en pantalla
  function makeAim(el) {
    var c = { x: 0, y: 0, t: -9 }, yaw = 0, pitch = 0;
    return {
      get: function (t, dt) {
        if (t - c.t > 0.12) { var r = el.getBoundingClientRect(); c.x = r.left + r.width / 2; c.y = r.top + r.height / 2; c.t = t; }
        var yt = 0, pt = 0;
        if (ptr.mx !== null) {
          var dx = ptr.mx - c.x, dy = ptr.my - c.y;
          yt = clamp(Math.atan(dx / 330) / RAD * 0.78, -60, 60);
          pt = clamp(-Math.atan(dy / 300) / RAD * 0.55, -32, 32);
        }
        var k = Math.min(1, dt * 9);
        yaw += (yt - yaw) * k; pitch += (pt - pitch) * k;
        return { yaw: yaw, pitch: pitch, w: followW(t) };
      }
    };
  }
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    var t = ts / 1000, dt = Math.min(0.05, t - lastT || 0.016);
    lastT = t;
    var k = Math.min(1, dt * 5);
    ptr.x += (ptr.tx - ptr.x) * k; ptr.y += (ptr.ty - ptr.y) * k;
    for (var i = 0; i < objs.length; i++) objs[i].update(t, dt);
  }
  function startLoop() {
    if (raf) return;
    window.addEventListener("pointermove", onMove, { passive: true });
    lastT = performance.now() / 1000;
    raf = requestAnimationFrame(frame);
  }
  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0; objs = [];
    window.removeEventListener("pointermove", onMove);
  }

  // ---------- degradados compartidos ----------
  var DEFS = '<svg class="hw-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>' +
    '<radialGradient id="hwBody" cx=".35" cy=".28" r=".85"><stop offset="0" stop-color="#ffb84d"/><stop offset=".45" stop-color="#ff7a1a"/><stop offset="1" stop-color="#c2410c"/></radialGradient>' +
    '<radialGradient id="hwLobe" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#ff8f2e"/><stop offset="1" stop-color="#9c3009"/></radialGradient>' +
    '<radialGradient id="hwLobeD" cx=".5" cy=".3" r=".9"><stop offset="0" stop-color="#d9600f"/><stop offset="1" stop-color="#6e2105"/></radialGradient>' +
    '<radialGradient id="hwShade" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#320a00" stop-opacity=".5"/></radialGradient>' +
    '<linearGradient id="hwStem" x1="0" x2="1"><stop offset="0" stop-color="#8a6a36"/><stop offset=".6" stop-color="#5d4420"/><stop offset="1" stop-color="#3d2a10"/></linearGradient>' +
    '<radialGradient id="hwFlame" cx=".5" cy=".6" r=".7"><stop offset="0" stop-color="#fff6b0"/><stop offset=".55" stop-color="#ffc21a"/><stop offset="1" stop-color="#ff7a00"/></radialGradient>' +
    '<linearGradient id="hwGhost" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ddd3ff"/></linearGradient>' +
    '<radialGradient id="hwGhostShade" cx=".5" cy=".15" r=".95"><stop offset=".45" stop-color="#8f7bd6" stop-opacity="0"/><stop offset="1" stop-color="#6b55c0" stop-opacity=".38"/></radialGradient>' +
    '<radialGradient id="hwSpBody" cx=".35" cy=".28" r=".85"><stop offset="0" stop-color="#6b4596"/><stop offset=".55" stop-color="#2b1646"/><stop offset="1" stop-color="#0e0718"/></radialGradient>' +
    '<radialGradient id="hwSpHead" cx=".4" cy=".3" r=".85"><stop offset="0" stop-color="#7b52a8"/><stop offset="1" stop-color="#1a0d2c"/></radialGradient>' +
    '<radialGradient id="hwBatFur" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#5b3b86"/><stop offset="1" stop-color="#1a0f2c"/></radialGradient>' +
    '<radialGradient id="hwDew" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#bfe3ff" stop-opacity=".35"/></radialGradient>' +
    '<filter id="hwBlur" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3"/></filter>' +
    '<filter id="hwBlurS" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.2"/></filter>' +
    '</defs></svg>';

  // ======================================================================
  //  TELARAÑA (la derecha se dibuja en espejo, sin transformar el contenedor)
  // ======================================================================
  function buildWeb(size, mirrored) {
    var wrap = D("hw-web" + (mirrored ? " hw-web-r" : " hw-web-l"));
    wrap.style.width = wrap.style.height = size + "px";
    var R = size, n = 8, rnd = seeded(mirrored ? 11 : 7), i, j;
    var svg = S("svg", { viewBox: "0 0 " + R + " " + R, width: R, height: R, class: "hw-web-svg" }, wrap);
    var g = S("g", mirrored ? { transform: "translate(" + R + " 0) scale(-1 1)" } : {}, svg);
    var ang = [];
    for (i = 0; i < n; i++) {
      var a = (i * Math.PI / 2) / (n - 1);
      if (i > 0 && i < n - 1) a += (rnd() - 0.5) * 0.05;
      ang.push(a);
    }
    var rad = "", ring = "";
    ang.forEach(function (a, idx) {
      var len = idx === 0 ? R : R * (0.94 + rnd() * 0.05);
      rad += "M0 0 L" + (Math.cos(a) * len).toFixed(1) + " " + (Math.sin(a) * len).toFixed(1) + " ";
    });
    var rs = [0.1, 0.19, 0.29, 0.4, 0.52, 0.64, 0.76, 0.88];
    rs.forEach(function (k) {
      for (j = 0; j < n - 1; j++) {
        var r = R * k * (0.97 + rnd() * 0.05), a1 = ang[j], a2 = ang[j + 1], am = (a1 + a2) / 2, sag = r * (0.83 + rnd() * 0.05);
        ring += "M" + (Math.cos(a1) * r).toFixed(1) + " " + (Math.sin(a1) * r).toFixed(1) +
          " Q" + (Math.cos(am) * sag).toFixed(1) + " " + (Math.sin(am) * sag).toFixed(1) + " " +
          (Math.cos(a2) * r).toFixed(1) + " " + (Math.sin(a2) * r).toFixed(1) + " ";
      }
    });
    S("path", { d: ring, class: "hw-web-ring", fill: "none" }, g);
    S("path", { d: rad, class: "hw-web-main", fill: "none" }, g);
    var loose = "M" + (R * 0.62).toFixed(0) + " " + (R * 0.74).toFixed(0) + " q 6 14 -2 26 M" + (R * 0.3).toFixed(0) + " " + (R * 0.9).toFixed(0) + " q -5 12 3 22";
    S("path", { d: loose, class: "hw-web-ring", fill: "none" }, g);
    for (i = 0; i < 9; i++) {
      var k2 = rs[1 + Math.floor(rnd() * 6)], aa = ang[Math.floor(rnd() * (n - 1))] + 0.07, rr = R * k2 * 0.92;
      S("circle", { cx: (Math.cos(aa) * rr).toFixed(1), cy: (Math.sin(aa) * rr).toFixed(1), r: (1.6 + rnd() * 1.2).toFixed(1), fill: "url(#hwDew)", stroke: "rgb(255 255 255 / .35)", "stroke-width": ".4" }, g);
    }
    var fx = Math.cos(ang[3] + 0.1) * R * 0.5, fy = Math.sin(ang[3] + 0.1) * R * 0.5;
    var fl = S("g", { transform: "translate(" + fx.toFixed(1) + " " + fy.toFixed(1) + ") rotate(35)" }, g);
    S("ellipse", { rx: 7, ry: 3.4, fill: "rgb(240 235 255 / .85)", stroke: "rgb(120 100 160 / .5)", "stroke-width": ".6" }, fl);
    S("path", { d: "M-3 -3 L-3 3 M0 -3.3 L0 3.3 M3 -3 L3 3", stroke: "rgb(120 100 160 / .55)", "stroke-width": ".5", fill: "none" }, fl);
    S("path", { d: "M-7 0 l-4 -3 M-7 0 l-4 3", stroke: "rgb(80 60 110 / .6)", "stroke-width": ".6", fill: "none" }, fl);
    return wrap;
  }

  // ======================================================================
  //  ARAÑA 3D (capas con profundidad; baja por tramos y sube agarrando el hilo)
  // ======================================================================
  function buildSpider(layer, size, sc, maxLen, animated) {
    var host = D("hw-spider", layer); host.style.left = size + "px";
    var thr = S("svg", { class: "sp-thr", width: 2, height: 2 }, host);
    var knot = S("g", {}, thr);
    S("circle", { cx: 0, cy: 0, r: 2.6, class: "hw-knot" }, knot);
    S("path", { d: "M0 0 L-14 0 M0 0 L-9 7 M0 0 L9 6", class: "hw-web-main", fill: "none" }, knot);
    var tg = S("g", {}, thr);
    var thread = S("line", { x1: 0, y1: 0, x2: 0, y2: 30, class: "hw-thread" }, tg);
    var stage = D("sp-stage", host), b3 = D("sp-3d", stage);
    function Ly(z) {
      var s = S("svg", { viewBox: "-70 0 140 120", class: "sp-l" });
      s.style.transform = "translateZ(" + z + "px)"; b3.appendChild(s); return s;
    }

    var HIPS = [[8, 50], [10.5, 56], [10.5, 62], [8, 68]], ZL = [15, 6, -6, -15];
    var L1 = 24, L2 = 27, L3 = 15, legs = [];
    [1, -1].forEach(function (side) {
      HIPS.forEach(function (h, i) {
        var sv = Ly(ZL[i]);
        sv.style.transformOrigin = (70 + h[0] * side) + "px " + h[1] + "px";
        if (ZL[i] < 0) sv.style.opacity = "0.86";
        var g1 = S("g", {}, sv);
        S("line", { x1: 0, y1: 0, x2: L1, y2: 0, class: "sp-leg l1" }, g1);
        S("line", { x1: 1, y1: -1, x2: L1 - 1, y2: -1, class: "sp-hi" }, g1);
        var g2 = S("g", {}, g1);
        S("line", { x1: 0, y1: 0, x2: L2, y2: 0, class: "sp-leg l2" }, g2);
        S("line", { x1: 1, y1: -0.8, x2: L2 - 1, y2: -0.8, class: "sp-hi" }, g2);
        var g3 = S("g", {}, g2);
        S("line", { x1: 0, y1: 0, x2: L3, y2: 0, class: "sp-leg l3" }, g3);
        S("circle", { cx: L2, cy: 0, r: 1.9, class: "sp-joint" }, g2);
        S("circle", { cx: 0, cy: 0, r: 2.3, class: "sp-joint" }, g1);
        legs.push({ i: i, side: side, sv: sv, hx: h[0] * side, hy: h[1], g1: g1, g2: g2, g3: g3, a1: 30, v1: 0, a2: 40, v2: 0 });
      });
    });
    var ab = Ly(-8), th = Ly(5);
    S("path", { d: "M-3 44 L-3 50 L3 50 L3 44Z", fill: "#150b24" }, ab);
    S("ellipse", { cx: 0, cy: 1.5, rx: 3, ry: 2, fill: "#150b24" }, ab);
    S("ellipse", { cx: 0, cy: 24, rx: 17, ry: 22, fill: "url(#hwSpBody)", class: "sp-body" }, ab);
    S("path", { d: "M-6 12 L6 12 L1.2 24 L6 36 L-6 36 L-1.2 24Z", fill: "#ff6a1a", opacity: ".92" }, ab);
    S("path", { d: "M-6 12 L6 12 L1.2 24 L6 36 L-6 36 L-1.2 24Z", fill: "none", stroke: "#ffd08a", "stroke-width": ".5", opacity: ".7" }, ab);
    S("ellipse", { cx: -7, cy: 12, rx: 4.2, ry: 8, fill: "#fff", opacity: ".2", transform: "rotate(18 -7 12)" }, ab);
    S("ellipse", { cx: 0, cy: 58, rx: 12.5, ry: 11.5, fill: "url(#hwSpHead)", class: "sp-body" }, th);
    S("ellipse", { cx: -4, cy: 53, rx: 4, ry: 3, fill: "#fff", opacity: ".18" }, th);
    [[-4.4, 55, 2.9], [4.4, 55, 2.9], [-8.2, 51.5, 1.8], [8.2, 51.5, 1.8], [-2.2, 49.6, 1.3], [2.2, 49.6, 1.3]].forEach(function (e) {
      S("circle", { cx: e[0], cy: e[1], r: e[2], fill: "#ff4d2e" }, th);
      S("circle", { cx: e[0] - e[2] * 0.3, cy: e[1] - e[2] * 0.3, r: e[2] * 0.32, fill: "#fff" }, th);
    });
    S("path", { d: "M-5 66 C-6 70 -5.5 74 -3.6 75 C-3 72 -3 69 -2.4 66Z", fill: "#2a1840", stroke: "#ff9a5a", "stroke-width": ".4" }, th);
    S("path", { d: "M5 66 C6 70 5.5 74 3.6 75 C3 72 3 69 2.4 66Z", fill: "#2a1840", stroke: "#ff9a5a", "stroke-width": ".4" }, th);

    // ----- poses (cada una con su peso) -----
    var W = { h: 1, d: 0, c: 0 }, ts = { h: 1, d: 0, c: 0 };
    var st = { name: "rest", t: 0, len: 28, lenV: 0, pendAmp: 3, tgtLen: 28, phase: 0, mv: 0 };
    var DUR = { rest: 1.6, down: 4.2, hang: 3.8, up: 4.8 }, minLen = 28, STEPS = 6;
    var aim = makeAim(host);

    function dropProfile(p) {            // desciende por tramos: caída, pausa, caída final
      if (p < 0.42) return 0.45 * easeIO(p / 0.42);
      if (p < 0.52) return 0.45;
      return 0.45 + 0.55 * easeIO((p - 0.52) / 0.48);
    }
    function stairs(p) {                 // sube "mano sobre mano": pulsos
      var s = p * STEPS, k = Math.floor(s), f = s - k;
      return clamp((k + easeIO(clamp(f * 1.5, 0, 1))) / STEPS, 0, 1);
    }
    function poseTargets(i, side, t) {
      var ph = (i % 2 ? Math.PI : 0) + (side < 0 ? Math.PI : 0);
      // colgando: patas relajadas hacia abajo
      var h1 = [8, 32, 58, 80][i] + 4 * Math.sin(t * 1.6 + i);
      var h2 = [60, 52, 42, 32][i] + 6 * Math.sin(t * 1.9 + i * 0.7);
      // bajando: patas abiertas, remando suave (más si se mueve)
      var amp = 4 + 10 * st.mv;
      var d1 = [-48, -14, 22, 52][i] + amp * Math.sin(t * 6 + ph);
      var d2 = 52 + amp * 1.4 * Math.sin(t * 6 + ph + 1);
      // subiendo: el par delantero agarra el hilo alternando; las demás se recogen
      var cph = st.phase + (side < 0 ? Math.PI : 0), c1, c2;
      if (i === 0) { c1 = -92 + 30 * Math.sin(cph); c2 = 46 - 32 * Math.sin(cph); }
      else if (i === 1) { c1 = -46 + 12 * Math.sin(cph + 1.6); c2 = 44; }
      else { c1 = [0, 28, 48][i - 1] + 6 * Math.sin(t * 2 + i); c2 = 50; }
      return [h1 * W.h + d1 * W.d + c1 * W.c, h2 * W.h + d2 * W.d + c2 * W.c];
    }
    function apply(t, yaw, pitch, pend) {
      var bx = -st.len * Math.sin(pend * RAD), by = st.len * Math.cos(pend * RAD);
      tg.setAttribute("transform", "rotate(" + pend.toFixed(2) + ")");
      thread.setAttribute("y2", st.len.toFixed(1));
      b3.style.transform = "translate(" + bx.toFixed(1) + "px," + by.toFixed(1) + "px) perspective(520px) rotate(" + pend.toFixed(2) + "deg) scale3d(" + sc + "," + sc + "," + sc + ") translate(0px,40px) rotateY(" + yaw.toFixed(1) + "deg) rotateX(" + pitch.toFixed(1) + "deg) translate(0px,-40px)";
      for (var k = 0; k < legs.length; k++) {
        var L = legs[k];
        L.g1.setAttribute("transform", "translate(" + L.hx + " " + L.hy + ") scale(" + L.side + " 1) rotate(" + L.a1.toFixed(1) + ")");
        L.g2.setAttribute("transform", "translate(" + L1 + " 0) rotate(" + L.a2.toFixed(1) + ")");
        L.g3.setAttribute("transform", "translate(" + L2 + " 0) rotate(" + (L.a2 * 0.45 + 12).toFixed(1) + ")");
        // inclinación 3D de cada pata: las levantadas se acercan al espectador
        var tilt = clamp(L.side * L.a1 * 0.4 + (L.i < 2 ? -L.side * 6 : L.side * 6), -42, 42);
        L.sv.style.transform = "translateZ(" + ZL[L.i] + "px) rotateY(" + tilt.toFixed(1) + "deg)";
      }
    }
    function setState(name) {
      st.name = name; st.t = 0;
      if (name === "rest") { ts = { h: 1, d: 0, c: 0 }; }
      if (name === "down") { ts = { h: 0, d: 1, c: 0 }; }
      if (name === "hang") { ts = { h: 1, d: 0, c: 0 }; st.pendAmp = 10; }
      if (name === "up") { ts = { h: 0, d: 0, c: 1 }; }
      dbg.spider.state = name;
    }
    dbg.spider = { state: "rest", len: st.len, maxLen: maxLen };

    function update(t, dt) {
      st.t += dt;
      var p = clamp(st.t / DUR[st.name], 0, 1);
      if (st.name === "rest") st.tgtLen = minLen;
      else if (st.name === "down") st.tgtLen = minLen + (maxLen - minLen) * dropProfile(p);
      else if (st.name === "hang") st.tgtLen = maxLen;
      else if (st.name === "up") { st.tgtLen = maxLen - (maxLen - minLen) * stairs(p); st.phase = Math.PI * 2 * (p * STEPS) + Math.PI; }
      if (p >= 1) setState({ rest: "down", down: "hang", hang: "up", up: "rest" }[st.name]);
      var acc = 80 * (st.tgtLen - st.len) - 10 * st.lenV;
      st.lenV += acc * dt; st.len += st.lenV * dt;
      dbg.spider.len = st.len;
      st.mv += (clamp(Math.abs(st.lenV) / 60, 0, 1) - st.mv) * Math.min(1, dt * 8);
      var kw = Math.min(1, dt * 6);
      W.h += (ts.h - W.h) * kw; W.d += (ts.d - W.d) * kw; W.c += (ts.c - W.c) * kw;
      for (var k = 0; k < legs.length; k++) {
        var L = legs[k], tg2 = poseTargets(L.i, L.side, t);
        var step = Math.min(dt, 0.02), n = Math.ceil(dt / step);
        for (var q = 0; q < n; q++) {
          L.v1 += (150 * (tg2[0] - L.a1) - 9 * L.v1) * step; L.a1 += L.v1 * step;
          L.v2 += (150 * (tg2[1] - L.a2) - 9 * L.v2) * step; L.a2 += L.v2 * step;
        }
      }
      var moving = st.name === "down" || st.name === "up";
      st.pendAmp += ((moving ? 2.5 : 5) - st.pendAmp) * Math.min(1, dt * 0.9);
      var pend = st.pendAmp * Math.sin(t * 1.5);
      var a = aim.get(t, dt), wf = a.w;
      var yaw = lerp(26 * Math.sin(t * 0.8), a.yaw * 0.7, wf);
      var pitch = lerp(0, a.pitch * 0.6, wf) + (st.name === "down" ? -10 * st.mv : st.name === "up" ? 8 * st.mv : 0) + 3 * Math.sin(t * 1.7);
      apply(t, yaw, pitch, pend);
    }
    if (!animated) {
      st.len = 96;
      legs.forEach(function (L) { var tg2 = poseTargets(L.i, L.side, 0); L.a1 = tg2[0]; L.a2 = tg2[1]; });
      apply(0, 18, 0, 0);
      return null;
    }
    return { update: update };
  }

  // ======================================================================
  //  MURCIÉLAGOS 3D (alas con barrido hacia el espectador, giro del cuerpo, profundidad)
  // ======================================================================
  function wingShape(a, u) {
    var sx = 5, sy = -1, f = 1 - 0.22 * Math.max(0, u);
    var L1 = 19 * f, A = a * RAD;
    var wx = sx + L1 * Math.cos(A), wy = sy + L1 * Math.sin(A);
    var fa = [-6, 19, 42], fl = [36, 38, 30], tips = [];
    for (var k = 0; k < 3; k++) {
      var an = (a + fa[k] * (1 - 0.18 * Math.max(0, u))) * RAD, ln = fl[k] * (1 - 0.14 * Math.max(0, u));
      tips.push([wx + ln * Math.cos(an), wy + ln * Math.sin(an)]);
    }
    function pull(p1, p2) { var mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2; return [mx + (wx - mx) * 0.34, my + (wy - my) * 0.34]; }
    var c1 = pull(tips[0], tips[1]), c2 = pull(tips[1], tips[2]), hip = [4, 13], c3 = [(tips[2][0] + hip[0]) / 2 - 2, (tips[2][1] + hip[1]) / 2 - 3];
    function P(p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }
    return {
      mem: "M" + sx + " " + sy + " L" + P([wx, wy]) + " L" + P(tips[0]) + " Q" + P(c1) + " " + P(tips[1]) + " Q" + P(c2) + " " + P(tips[2]) + " Q" + P(c3) + " " + P(hip) + "Z",
      bones: "M" + P([wx, wy]) + " L" + P(tips[0]) + " M" + P([wx, wy]) + " L" + P(tips[1]) + " M" + P([wx, wy]) + " L" + P(tips[2]),
      arm: "M" + sx + " " + sy + " L" + P([wx, wy])
    };
  }

  function buildBat(layer, idx, layerW, layerH) {
    var host = D("hw-bat", layer), b3 = D("bt-3d", host);
    function Ly(z) {
      var s = S("svg", { viewBox: "-60 -45 120 110", class: "bt-l" });
      s.style.transform = "translateZ(" + z + "px)"; s.style.transformOrigin = "60px 45px"; b3.appendChild(s); return s;
    }
    var svR = Ly(-3), svL = Ly(-3), svB = Ly(3);
    var wings = [{ sv: svR, mir: false }, { sv: svL, mir: true }].map(function (w) {
      var g = S("g", w.mir ? { transform: "scale(-1 1)" } : {}, w.sv);
      return {
        sv: w.sv, mir: w.mir,
        mem: S("path", { class: "bat-mem" }, g), shade: S("path", { class: "bat-shade" }, g),
        bones: S("path", { class: "bat-bone", fill: "none" }, g), arm: S("path", { class: "bat-arm", fill: "none" }, g)
      };
    });
    var body = S("g", {}, svB);
    S("ellipse", { cx: 0, cy: 6, rx: 6, ry: 10, fill: "url(#hwBatFur)", class: "bat-body" }, body);
    S("path", { d: "M-3 4 Q0 8 3 4 M-3.4 8 Q0 12 3.4 8", stroke: "rgb(255 255 255 / .12)", "stroke-width": ".7", fill: "none" }, body);
    S("path", { d: "M-2.5 15 q-1 4 -3 4 M2.5 15 q1 4 3 4", class: "bat-bone", fill: "none" }, body);
    S("circle", { cx: 0, cy: -7, r: 6.2, fill: "url(#hwBatFur)", class: "bat-body" }, body);
    S("path", { d: "M-5.6 -10 L-5.8 -22 L-1.2 -12Z M5.6 -10 L5.8 -22 L1.2 -12Z", fill: "#1a0f2c", class: "bat-body" }, body);
    S("path", { d: "M-4.8 -12 L-5 -19 L-2.4 -12.5Z M4.8 -12 L5 -19 L2.4 -12.5Z", fill: "#7a4a9a", opacity: ".55" }, body);
    S("circle", { class: "bat-eye", cx: -2.5, cy: -8, r: 1.35 }, body);
    S("circle", { class: "bat-eye", cx: 2.5, cy: -8, r: 1.35 }, body);
    S("path", { d: "M-1.3 -3.6 L-1 -1 L-0.2 -3.4Z M1.3 -3.6 L1 -1 L0.2 -3.4Z", fill: "#fff" }, body);

    var rnd = seeded(31 + idx * 17);
    var bat = {
      dir: idx % 2 ? -1 : 1, wait: 0.8 + idx * 2.4 + rnd() * 2, flying: false, u: 0, T: 8,
      y0: 60, A1: 40, f1: 1.4, A2: 8, f2: 3, ph: 0, flap: rnd() * 6, hz: 4 + rnd() * 1.4, s: 1, base: 0.8 + rnd() * 0.45, rnd: rnd
    };
    dbg.bats.push(bat);
    function launch() {
      bat.flying = true; bat.u = 0; bat.dir = -bat.dir;
      bat.T = 7 + bat.rnd() * 4;
      bat.y0 = 40 + bat.rnd() * Math.max(60, layerH - 170);
      bat.A1 = 25 + bat.rnd() * 55; bat.f1 = 0.8 + bat.rnd() * 1.4; bat.A2 = 4 + bat.rnd() * 8; bat.f2 = 2 + bat.rnd() * 2;
      bat.ph = bat.rnd() * 6.28; bat.s = 0.65 + bat.rnd() * 0.55;
    }
    function update(t, dt) {
      bat.flap += dt * bat.hz * 2 * Math.PI;
      var u = Math.sin(bat.flap), a = -10 - 54 * u, down = (1 - u) / 2;
      var w = wingShape(a, u);
      wings.forEach(function (p) {
        p.mem.setAttribute("d", w.mem); p.shade.setAttribute("d", w.mem);
        p.bones.setAttribute("d", w.bones); p.arm.setAttribute("d", w.arm);
        p.shade.setAttribute("opacity", (0.06 + 0.32 * (1 - down)).toFixed(2));
        // barrido en 3D: en la bajada las alas van hacia el espectador
        var sweep = 8 + 34 * down;
        p.sv.style.transform = "translateZ(-3px) rotateY(" + (p.mir ? sweep : -sweep).toFixed(1) + "deg)";
      });
      body.setAttribute("transform", "translate(0 " + (2.6 * u).toFixed(2) + ")");
      if (!bat.flying) {
        bat.wait -= dt; host.style.visibility = "hidden";
        if (bat.wait <= 0) launch();
        return;
      }
      bat.u += dt / bat.T;
      if (bat.u >= 1) { bat.flying = false; bat.wait = 1.5 + bat.rnd() * 5; host.style.visibility = "hidden"; return; }
      host.style.visibility = "visible";
      var span = layerW + 200, p = bat.u;
      var x = bat.dir > 0 ? -100 + p * span : layerW + 100 - p * span;
      var wave = p * bat.f1 * 6.283 + bat.ph;
      var y = bat.y0 + bat.A1 * Math.sin(wave) + bat.A2 * Math.sin(p * bat.f2 * 6.283 + bat.ph) - 2.6 * u * bat.s;
      var vy = bat.A1 * Math.cos(wave) * bat.f1 * 6.283 / (bat.T * 40);
      var roll = bat.dir * 8 + clamp(vy * 12, -14, 14);
      // profundidad: se acerca y se aleja mientras vuela
      var depth = 1 + 0.28 * Math.sin(wave * 0.7 + 1);
      var sc = bat.s * bat.base * depth;
      var yaw = bat.dir * 24 + 18 * Math.sin(wave), pitch = 12 * Math.cos(wave) - 4;
      host.style.opacity = clamp(0.62 + 0.28 * depth, 0.5, 0.98).toFixed(2);
      host.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) rotate(" + roll.toFixed(1) + "deg) scale(" + sc.toFixed(3) + ")";
      b3.style.transform = "perspective(420px) rotateY(" + yaw.toFixed(1) + "deg) rotateX(" + pitch.toFixed(1) + "deg)";
    }
    return { update: update };
  }

  // ======================================================================
  //  CALABAZA 3D (más capas = más volumen; mira al puntero de forma precisa)
  // ======================================================================
  function faceShapes(kind) {
    if (kind === 2) {
      return {
        eyes: [{ tag: "circle", a: { cx: 46, cy: 58, r: 6.5 }, top: [46, 51.5] }, { tag: "circle", a: { cx: 74, cy: 58, r: 6.5 }, top: [74, 51.5] }],
        nose: [],
        mouth: [{ tag: "path", a: { d: "M40 77 Q60 101 80 77 Q60 87 40 77Z" } }]
      };
    }
    return {
      eyes: [{ tag: "path", a: { d: "M37 59 L53 62 L45 42Z" }, top: [45, 42] }, { tag: "path", a: { d: "M83 59 L67 62 L75 42Z" }, top: [75, 42] }],
      nose: [{ tag: "path", a: { d: "M60 65 L55 72 L65 72Z" } }],
      mouth: [{ tag: "path", a: { d: "M37 78 L45 84 L51 77 L57 86 L63 86 L69 77 L75 84 L83 78 C81 94 72 101 60 101 C48 101 39 94 37 78Z" } }]
    };
  }

  function buildPumpkin(kind, cls, W) {
    var id = ++uid, H = W * 114 / 120, zs = W / 104, ph = id * 1.7;
    var el = D("hw-pumpkin " + cls); el.style.width = W + "px"; el.style.height = H + "px";
    var glow = D("pk-glow", el), stage = D("pk-stage", el), body = D("pk-body", stage), floor = D("pk-floor", el), shadow = D("pk-shadow", el);
    function layer(z) {
      var s = S("svg", { viewBox: "0 0 120 114", class: "pk-l" });
      s.style.transform = "translateZ(" + (z * zs).toFixed(1) + "px)";
      body.appendChild(s); return s;
    }
    function shapes(list, parent, attrs) {
      return list.map(function (sh) {
        var a = {}; for (var k in sh.a) a[k] = sh.a[k];
        if (attrs) for (var k2 in attrs) a[k2] = attrs[k2];
        return S(sh.tag, a, parent);
      });
    }
    var face = faceShapes(kind), all = face.eyes.concat(face.nose, face.mouth);

    var L1 = layer(-30);
    [26, 94].forEach(function (cx) {
      S("ellipse", { cx: cx, cy: 68, rx: 24, ry: 37, fill: "url(#hwLobeD)" }, L1);
      S("ellipse", { cx: cx, cy: 68, rx: 24, ry: 37, fill: "url(#hwShade)" }, L1);
    });
    // grosor de la calabaza: rebanadas del lóbulo central, de oscuras (atrás) a claras
    [-26, -22, -18, -14].forEach(function (z, i) {
      var Ls = layer(z);
      S("ellipse", { cx: 60, cy: 68, rx: 28.4 - i * 0.2, ry: 42.2, fill: "url(#hwLobeD)" }, Ls);
    });
    var L2 = layer(-17);
    [44, 76].forEach(function (cx) {
      S("ellipse", { cx: cx, cy: 68, rx: 27, ry: 41, fill: "url(#hwLobe)" }, L2);
      S("ellipse", { cx: cx, cy: 68, rx: 27, ry: 41, fill: "url(#hwShade)" }, L2);
    });
    S("path", { d: "M20 40 C12 58 12 80 22 97 M100 40 C108 58 108 80 98 97", fill: "none", stroke: "rgb(90 25 0 / .4)", "stroke-width": "1.5", "stroke-linecap": "round" }, L2);
    var L3 = layer(-10);
    S("ellipse", { cx: 60, cy: 69, rx: 28, ry: 41, fill: "#3b1100" }, L3);
    var L4 = layer(-6);
    var fl = S("g", { transform: "translate(60 72) scale(.93) translate(-60 -72)" }, L4);
    var flGlow = S("g", { filter: "url(#hwBlur)", fill: "#ffb300" }, fl);
    var eyesGlow = S("g", {}, flGlow), mouthGlow = S("g", {}, flGlow);
    shapes(face.eyes.concat(face.nose), eyesGlow); shapes(face.mouth, mouthGlow);
    var flCrisp = S("g", { fill: "url(#hwFlame)" }, fl);
    var eyesFl = S("g", {}, flCrisp), mouthFl = S("g", {}, flCrisp);
    shapes(face.eyes.concat(face.nose), eyesFl); shapes(face.mouth, mouthFl);

    var L5 = layer(0), mid = "hwMk" + id;
    var mask = S("mask", { id: mid, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: 120, height: 114 }, L5);
    S("rect", { x: 0, y: 0, width: 120, height: 114, fill: "#fff" }, mask);
    shapes(all, S("g", { fill: "#000" }, mask));
    var front = S("g", { mask: "url(#" + mid + ")" }, L5);
    S("ellipse", { cx: 60, cy: 68, rx: 29, ry: 43, fill: "url(#hwBody)" }, front);
    S("path", { d: "M45 28 C37 48 37 88 45 108 M75 28 C83 48 83 88 75 108 M60 26 C54 50 54 88 60 111", fill: "none", stroke: "rgb(110 35 5 / .38)", "stroke-width": "1.6", "stroke-linecap": "round" }, front);
    var shade = S("ellipse", { cx: 60, cy: 68, rx: 29, ry: 43, fill: "url(#hwShade)" }, front);
    var hi = S("ellipse", { cx: 47, cy: 43, rx: 9, ry: 14, fill: "#fff", opacity: ".2", transform: "rotate(-18 47 43)" }, front);
    shapes(all, L5, { fill: "none", stroke: "rgb(120 40 5 / .8)", "stroke-width": "1.5", "stroke-linejoin": "round" });
    var lids = face.eyes.map(function (sh) {
      var a = {}; for (var k in sh.a) a[k] = sh.a[k];
      a.fill = "#f27818"; a.stroke = "rgb(120 40 5 / .6)"; a["stroke-width"] = "1";
      var e = S(sh.tag, a, L5); e.setAttribute("opacity", "0");
      return { e: e, top: sh.top };
    });

    var L6 = layer(12);
    var stem = S("g", {}, L6);
    S("path", { d: "M54 33 C53 21 57 13 65 8 L73 14 C68 18 68 24 70 33Z", fill: "url(#hwStem)" }, stem);
    S("path", { d: "M58 30 C58 22 60 17 64 13 M63 31 C63 25 64 21 67 17", fill: "none", stroke: "rgb(40 25 8 / .5)", "stroke-width": ".9", "stroke-linecap": "round" }, stem);
    S("ellipse", { cx: 69, cy: 11, rx: 4.6, ry: 2.2, fill: "#3d2a10", transform: "rotate(30 69 11)" }, stem);
    var L7 = layer(18);
    var vine = S("g", {}, L7);
    S("path", { d: "M70 16 C84 7 95 18 86 24 C81 27 77 23 80 20", fill: "none", stroke: "#58b04a", "stroke-width": "2.2", "stroke-linecap": "round" }, vine);
    S("path", { d: "M83 13 C92 4 106 9 103 18 C95 21 86 20 83 13Z", fill: "#58b04a", stroke: "#3c8a33", "stroke-width": ".8" }, vine);
    S("path", { d: "M85 14 C92 11 98 12 102 15", fill: "none", stroke: "#3c8a33", "stroke-width": ".7" }, vine);
    stem.style.transformOrigin = "58px 32px"; vine.style.transformOrigin = "70px 16px";

    var aim = makeAim(el);
    var st = { nextHop: 2 + id, hopT: -1, nextBlink: 2 + id * 0.8, blinkT: -1 };
    var JUMP = H * 0.26;
    function update(t, dt) {
      var a = aim.get(t, dt), wf = a.w;
      var ryI = Math.sin(t * 0.8 + ph) * 14, rxI = -4 + Math.sin(t * 0.6 + ph) * 4;
      var ry = lerp(ryI, a.yaw, wf), rx = lerp(rxI, a.pitch, wf);
      var br = Math.sin(t * 2 + ph) * 0.014, sx = 1 - br, sy = 1 + br, y = 0;
      if (st.hopT < 0 && t > st.nextHop) st.hopT = 0;
      if (st.hopT >= 0) {
        st.hopT += dt; var h = st.hopT;
        if (h < 0.22) { var p0 = easeIO(h / 0.22); sx = 1 + 0.1 * p0; sy = 1 - 0.12 * p0; }
        else if (h < 0.72) { var q = (h - 0.22) / 0.5; y = -JUMP * 4 * q * (1 - q); sy = 1 + 0.08 * Math.sin(Math.PI * q); sx = 1 - 0.04 * Math.sin(Math.PI * q); }
        else if (h < 0.9) { var p1 = (h - 0.72) / 0.18; sx = 1 + 0.12 * Math.sin(Math.PI * p1); sy = 1 - 0.14 * Math.sin(Math.PI * p1); }
        else if (h < 1.3) { var p2 = (h - 0.9) / 0.4; sy = 1 + 0.05 * Math.exp(-5 * p2) * Math.sin(14 * p2); sx = 1 - 0.03 * Math.exp(-5 * p2) * Math.sin(14 * p2); }
        else { st.hopT = -1; st.nextHop = t + 4 + Math.random() * 5; }
      }
      body.style.transform = "translateY(" + y.toFixed(1) + "px) rotateX(" + rx.toFixed(1) + "deg) rotateY(" + ry.toFixed(1) + "deg) scale(" + sx.toFixed(3) + "," + sy.toFixed(3) + ")";
      // la luz del lóbulo se desplaza con el giro: más volumen
      shade.setAttribute("transform", "translate(" + (-ry * 0.16).toFixed(2) + " " + (-rx * 0.1).toFixed(2) + ")");
      hi.setAttribute("transform", "translate(" + (-ry * 0.3).toFixed(2) + " " + (-rx * 0.2).toFixed(2) + ") rotate(-18 47 43)");
      var lift = clamp(-y / (JUMP || 1), 0, 1);
      shadow.style.transform = "scaleX(" + (1 - 0.35 * lift).toFixed(2) + ")"; shadow.style.opacity = (0.9 - 0.4 * lift).toFixed(2);
      var n = 0.5 + 0.25 * Math.sin(t * 13) + 0.15 * Math.sin(t * 7.3 + 1) + 0.1 * Math.sin(t * 19.1);
      flCrisp.setAttribute("opacity", (0.8 + 0.2 * n).toFixed(2)); flGlow.setAttribute("opacity", (0.7 + 0.3 * n).toFixed(2));
      glow.style.opacity = (0.55 + 0.45 * n).toFixed(2); floor.style.opacity = (0.5 + 0.5 * n).toFixed(2);
      // la llama de los ojos mira donde mira la calabaza
      var ex = clamp(a.yaw / 58, -1, 1) * 3.6 * wf, ey = clamp(-a.pitch / 32, -1, 1) * 2.2 * wf;
      eyesFl.setAttribute("transform", "translate(" + ex.toFixed(2) + " " + ey.toFixed(2) + ")");
      eyesGlow.setAttribute("transform", "translate(" + ex.toFixed(2) + " " + ey.toFixed(2) + ")");
      mouthFl.setAttribute("transform", "translate(" + (ex * 0.4).toFixed(2) + " " + (Math.sin(t * 2.4 + ph) * 0.7 + ey * 0.3).toFixed(2) + ")");
      if (st.blinkT < 0 && t > st.nextBlink) st.blinkT = 0;
      var bs = 0;
      if (st.blinkT >= 0) { st.blinkT += dt; var b = st.blinkT / 0.18; if (b >= 1) { st.blinkT = -1; st.nextBlink = t + 2.5 + Math.random() * 3.5; } else bs = 1 - Math.abs(2 * b - 1); }
      lids.forEach(function (l) {
        l.e.setAttribute("opacity", bs > 0.03 ? "1" : "0");
        l.e.setAttribute("transform", "translate(" + l.top[0] + " " + l.top[1] + ") scale(1 " + bs.toFixed(3) + ") translate(" + (-l.top[0]) + " " + (-l.top[1]) + ")");
      });
      stem.style.transform = "rotate(" + (Math.sin(t * 1.7 + ph) * 3).toFixed(2) + "deg)";
      vine.style.transform = "rotate(" + (Math.sin(t * 1.3 + ph + 1) * 7).toFixed(2) + "deg)";
    }
    return { el: el, update: update, staticPose: function () { body.style.transform = "rotateY(14deg) rotateX(-4deg)"; } };
  }

  // ======================================================================
  //  FANTASMA 3D (dobladillo ondulante, brazos, ojos que siguen, gira hacia el puntero)
  // ======================================================================
  function ghostBody(t, k) {
    var tips = [], i, d = "M8 34 C8 14 19 3 32 3 C45 3 56 14 56 34 L56 63";
    for (i = 0; i < 7; i++) {
      var x = 56 - i * 8, even = i % 2 === 0;
      tips.push([x, even ? 71 + 4 * Math.sin(t * 4 + i * 1.1) * k : 63 + 3 * Math.sin(t * 4 + i * 1.1 + 1) * k]);
    }
    d += " L" + tips[0][0] + " " + tips[0][1].toFixed(1);
    for (i = 0; i < 6; i++) {
      var p = tips[i], q = tips[i + 1], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      d += " Q" + p[0] + " " + p[1].toFixed(1) + " " + mx + " " + my.toFixed(1);
    }
    d += " L8 " + tips[6][1].toFixed(1) + " L8 34Z";
    return d;
  }

  function buildGhost(cls) {
    var el = D("hw-ghost" + (cls ? " " + cls : "")), aura = D("gh-aura", el), stage = D("gh-stage", el), body = D("gh-body", stage), shadow = D("gh-shadow", el);
    function layer(z) { var s = S("svg", { viewBox: "0 0 64 84", class: "gh-l" }); s.style.transform = "translateZ(" + z + "px)"; body.appendChild(s); return s; }
    var back = layer(-16);
    var backPath = S("path", { fill: "rgb(170 150 255 / .5)", filter: "url(#hwBlurS)" }, back);
    var mid2 = layer(-7);
    var midPath = S("path", { fill: "rgb(200 185 255 / .55)" }, mid2);
    var f = layer(0);
    var armL = S("g", {}, f), armR = S("g", {}, f);
    [armL, armR].forEach(function (a, idx) {
      var inner = S("g", { transform: idx === 0 ? "scale(-1 1)" : "" }, a);
      S("path", { d: "M0 -3.5 C8 -4.5 14 0 16 6 C12 8 6 7 0 4Z", fill: "url(#hwGhost)", stroke: "rgb(140 110 210 / .5)", "stroke-width": ".9" }, inner);
    });
    var main = S("path", { fill: "url(#hwGhost)", stroke: "rgb(140 110 210 / .55)", "stroke-width": "1.1", "stroke-linejoin": "round" }, f);
    var shade = S("path", { fill: "url(#hwGhostShade)" }, f);
    S("ellipse", { cx: 22, cy: 16, rx: 7, ry: 10, fill: "#fff", opacity: ".55", transform: "rotate(-20 22 16)" }, f);
    var face = layer(6);
    var eyeL = S("g", {}, face), eyeR = S("g", {}, face), glints = [];
    [[eyeL, 23], [eyeR, 41]].forEach(function (e) {
      S("ellipse", { cx: e[1], cy: 31, rx: 3.6, ry: 5.8, fill: "#2a1840" }, e[0]);
      glints.push(S("circle", { cx: e[1] - 1, cy: 29, r: 1.3, fill: "#fff" }, e[0]));
    });
    var mouth = S("ellipse", { cx: 32, cy: 45, rx: 4, ry: 5.2, fill: "#2a1840" }, face);
    S("circle", { cx: 16, cy: 40, r: 3.6, fill: "#ff9ec4", opacity: ".5" }, face);
    S("circle", { cx: 48, cy: 40, r: 3.6, fill: "#ff9ec4", opacity: ".5" }, face);
    var orbs = [];
    for (var i = 0; i < 6; i++) { var o = D("gh-orb", el); orbs.push({ e: o, life: Math.random() }); }
    var aim = makeAim(el);
    var st = { nextBoo: 4, boo: -1, nextBlink: 2, blinkT: -1 };
    function update(t, dt) {
      var a = aim.get(t, dt), wf = a.w;
      var ox = 10 * Math.sin(t * 0.7), oy = 12 * Math.sin(t * 1.2), lean = Math.cos(t * 0.7) * 5 + a.yaw * 0.08 * wf;
      var scale = 1, armUp = 0, mo = 0, eyeS = 1;
      if (st.boo < 0 && t > st.nextBoo) st.boo = 0;
      if (st.boo >= 0) {
        st.boo += dt; var b = st.boo / 1.1;
        if (b >= 1) { st.boo = -1; st.nextBoo = t + 7 + Math.random() * 5; }
        else { var e = Math.sin(Math.PI * b); scale = 1 + 0.2 * e; armUp = e; mo = e; eyeS = 1 + 0.25 * e; }
      }
      var d = ghostBody(t, 1);
      main.setAttribute("d", d); shade.setAttribute("d", d); backPath.setAttribute("d", d); midPath.setAttribute("d", d);
      var wv = Math.sin(t * 2.1);
      armR.setAttribute("transform", "translate(55 42) rotate(" + (24 + 14 * wv - 80 * armUp).toFixed(1) + ")");
      armL.setAttribute("transform", "translate(9 42) rotate(" + (24 - 14 * wv - 80 * armUp).toFixed(1) + ")");
      mouth.setAttribute("rx", (4 + 2.4 * mo).toFixed(2)); mouth.setAttribute("ry", (5.2 + 1.2 * Math.sin(t * 3) + 5 * mo).toFixed(2));
      if (st.blinkT < 0 && t > st.nextBlink) st.blinkT = 0;
      var bs = 1;
      if (st.blinkT >= 0) { st.blinkT += dt; var bb = st.blinkT / 0.2; if (bb >= 1) { st.blinkT = -1; st.nextBlink = t + 2 + Math.random() * 3; } else bs = Math.max(0.08, Math.abs(2 * bb - 1)); }
      [[eyeL, 23], [eyeR, 41]].forEach(function (e) {
        e[0].setAttribute("transform", "translate(" + e[1] + " 31) scale(" + eyeS.toFixed(2) + " " + (bs * eyeS).toFixed(2) + ") translate(" + (-e[1]) + " -31)");
      });
      var gx = clamp(a.yaw / 60, -1, 1) * 1.7 * wf, gy = clamp(-a.pitch / 32, -1, 1) * 1.3 * wf;
      glints.forEach(function (g) { g.style.transform = "translate(" + gx.toFixed(2) + "px," + gy.toFixed(2) + "px)"; });
      stage.style.transform = "translate(" + ox.toFixed(1) + "px," + oy.toFixed(1) + "px) rotate(" + lean.toFixed(1) + "deg) scale(" + scale.toFixed(3) + ")";
      var ry = lerp(Math.sin(t * 0.9) * 10, a.yaw, wf), rx = lerp(0, a.pitch, wf);
      body.style.transform = "rotateY(" + ry.toFixed(1) + "deg) rotateX(" + rx.toFixed(1) + "deg)";
      aura.style.opacity = (0.5 + 0.25 * Math.sin(t * 2) + 0.4 * mo).toFixed(2);
      shadow.style.transform = "translateX(" + ox.toFixed(1) + "px) scaleX(" + (1 - oy / 60).toFixed(2) + ")"; shadow.style.opacity = (0.5 - oy / 60).toFixed(2);
      orbs.forEach(function (o, i) {
        o.life += dt * 0.35; if (o.life > 1) { o.life = 0; o.x = (Math.random() - 0.5) * 40; }
        if (o.x === undefined) o.x = (Math.random() - 0.5) * 40;
        o.e.style.transform = "translate(" + (o.x + Math.sin(t * 2 + i) * 6 + ox).toFixed(1) + "px," + (-o.life * 70 + oy).toFixed(1) + "px)";
        o.e.style.opacity = (Math.sin(Math.PI * o.life) * 0.8).toFixed(2);
      });
    }
    return {
      el: el, update: update,
      staticPose: function () { var d = ghostBody(0, 0); [main, shade, backPath, midPath].forEach(function (p) { p.setAttribute("d", d); }); armR.setAttribute("transform", "translate(55 42) rotate(24)"); armL.setAttribute("transform", "translate(9 42) rotate(24)"); body.style.transform = "rotateY(8deg)"; }
    };
  }

  // fantasma errante: cruza el borde de la pantalla despacio, también al bajar la página
  function buildWanderGhost(layer, layerW, layerH) {
    var g = buildGhost("wander");
    layer.appendChild(g.el);
    var rnd = seeded(77), st = { wait: 9, flying: false, u: 0, T: 26, dir: 1, y0: 120, A: 40 };
    return {
      update: function (t, dt) {
        g.update(t, dt);
        if (!st.flying) { st.wait -= dt; g.el.style.visibility = "hidden"; if (st.wait <= 0) { st.flying = true; st.u = 0; st.dir = -st.dir; st.T = 22 + rnd() * 10; st.y0 = 90 + rnd() * Math.max(40, layerH - 260); st.A = 25 + rnd() * 40; } return; }
        st.u += dt / st.T;
        if (st.u >= 1) { st.flying = false; st.wait = 14 + rnd() * 14; return; }
        g.el.style.visibility = "visible";
        var x = st.dir > 0 ? -90 + st.u * (layerW + 180) : layerW + 30 - st.u * (layerW + 180);
        var y = st.y0 + st.A * Math.sin(st.u * 9);
        g.el.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)";
        g.el.style.opacity = (0.55 + 0.35 * Math.sin(Math.PI * st.u)).toFixed(2);
      }
    };
  }

  // ======================================================================
  //  Montaje / desmontaje
  // ======================================================================
  var layerEl = null, resizeT = 0, lastBig = null, spiderHost = null, webSize = 240;
  function navAlto() { var nav = document.querySelector(".topnav"); return nav ? nav.offsetHeight : 0; }
  function alturaCapa() { return Math.max(240, window.innerHeight - navAlto()); }
  function montarCapa() {
    var anim = animar(), big = window.innerWidth > 900, size = big ? 240 : 150, sc = big ? 0.72 : 0.52;
    lastBig = big; webSize = size;
    var layer = D("hw-layer"); layer.setAttribute("aria-hidden", "true");
    var nh = navAlto(), h = alturaCapa();
    layer.style.top = nh + "px";
    layer.appendChild(buildWeb(size, false));
    layer.appendChild(buildWeb(size, true));
    var lw = window.innerWidth;
    var sp = buildSpider(layer, size, sc, Math.min(Math.round(h * 0.42), big ? 230 : 160), anim);
    spiderHost = layer.querySelector(".hw-spider");
    if (sp) objs.push(sp);
    // calabaza asomada en la esquina inferior (queda visible al bajar)
    var corner = buildPumpkin(1, "corner", big ? 78 : 58);
    layer.appendChild(corner.el);
    if (anim) {
      objs.push(corner);
      var nb = big ? 3 : 2;
      for (var i = 0; i < nb; i++) objs.push(buildBat(layer, i, lw, h));
      objs.push(buildWanderGhost(layer, lw, h));
    } else corner.staticPose();
    document.body.appendChild(layer);
    layerEl = layer;
    alScroll();
  }
  // al bajar, las telarañas se achican y la araña sigue colgando de su punta
  function alScroll() {
    if (!layerEl) return;
    var abajo = window.scrollY > 140;
    layerEl.classList.toggle("is-scrolled", abajo);
    if (spiderHost) spiderHost.style.left = (abajo ? webSize * 0.58 : webSize) + "px";
  }
  window.addEventListener("scroll", alScroll, { passive: true });
  function montar() {
    if (document.querySelector(".hw-layer")) return;
    root.setAttribute("data-halloween", "on");
    if (!document.querySelector(".hw-defs")) document.body.appendChild(D("hw-defs-wrap")).innerHTML = DEFS;
    var anim = animar();
    montarCapa();
    document.querySelectorAll(".scene").forEach(function (sc) {
      if (sc.querySelector(".hw-deco")) return;
      var deco = D("hw-deco"); deco.setAttribute("aria-hidden", "true");
      var big = buildPumpkin(1, "big", 104), small = buildPumpkin(2, "small", 62), gh = buildGhost();
      deco.appendChild(big.el); deco.appendChild(small.el); deco.appendChild(gh.el);
      sc.appendChild(deco);
      if (anim) { objs.push(big, small, gh); } else { big.staticPose(); small.staticPose(); gh.staticPose(); }
    });
    if (anim && objs.length) startLoop();
    actualizarBoton();
  }
  function desmontar() {
    stopLoop(); dbg.bats = []; dbg.spider = null; spiderHost = null;
    root.removeAttribute("data-halloween");
    document.querySelectorAll(".hw-layer, .hw-deco, .hw-defs-wrap").forEach(function (n) { n.remove(); });
    layerEl = null;
    actualizarBoton();
  }
  window.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      if (!layerEl) return;
      var big = window.innerWidth > 900;
      layerEl.style.top = navAlto() + "px";
      if (big !== lastBig) { desmontar(); montar(); }
    }, 250);
  });

  // ---------- Botón (junto al de modo oscuro) ----------
  var boton = null;
  function actualizarBoton() {
    if (!boton) return;
    var on = !!document.querySelector(".hw-layer");
    boton.textContent = on ? "Halloween: activado" : "Halloween: desactivado";
    boton.setAttribute("aria-pressed", on ? "true" : "false");
  }
  function crearBoton() {
    var tema = document.getElementById("themeToggleBtn");
    if (!tema || document.getElementById("halloweenToggleBtn")) return;
    boton = tema.cloneNode(false);
    boton.id = "halloweenToggleBtn";
    boton.setAttribute("aria-label", "Activar o desactivar la decoración de Halloween");
    boton.addEventListener("click", function () {
      var on = !!document.querySelector(".hw-layer");
      guardar(on ? "off" : "on");
      if (on) desmontar(); else montar();
    });
    tema.parentNode.insertBefore(boton, tema.nextSibling);
    actualizarBoton();
  }

  function init() { crearBoton(); if (activo()) montar(); else actualizarBoton(); }
  window.PangoaHalloween = { montar: montar, desmontar: desmontar, debug: dbg };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
