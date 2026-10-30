// Decoración de Halloween con figuras articuladas (solo visual, aria-hidden, sin clics).
//  - Telarañas con araña real: hilo anclado a la telaraña, patas por segmentos (baja, cuelga, sube).
//  - Murciélagos que cruzan desde AMBOS lados, con alas articuladas y cuerpo que se mueve.
//  - Calabazas en capas 3D (giran con el puntero, parpadean, saltan, la vela parpadea por dentro).
//  - Fantasma con dobladillo ondulante, brazos, ojos que siguen el puntero y 3D por capas.
// Se activa sola del 24 de octubre al 2 de noviembre; la elección de la persona manda siempre.
(function () {
  "use strict";
  var root = document.documentElement;
  var KEY = "pangoa_halloween";
  var NS = "http://www.w3.org/2000/svg";

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

  // ---------- estado global ----------
  var objs = [], raf = 0, lastT = 0, ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  var dbg = { spider: null, bats: [] };
  function onMove(e) { ptr.tx = (e.clientX / window.innerWidth) * 2 - 1; ptr.ty = (e.clientY / window.innerHeight) * 2 - 1; }
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
  //  TELARAÑA
  // ======================================================================
  function buildWeb(size, mirrored) {
    var wrap = D("hw-web" + (mirrored ? " hw-web-r" : " hw-web-l"));
    wrap.style.width = wrap.style.height = size + "px";
    var R = size, n = 8, rnd = seeded(mirrored ? 11 : 7), i, j;
    var svg = S("svg", { viewBox: "0 0 " + R + " " + R, width: R, height: R, class: "hw-web-svg" }, wrap);
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
    S("path", { d: ring, class: "hw-web-ring", fill: "none" }, svg);
    S("path", { d: rad, class: "hw-web-main", fill: "none" }, svg);
    // hebras sueltas que cuelgan del borde
    var loose = "M" + (R * 0.62).toFixed(0) + " " + (R * 0.74).toFixed(0) + " q 6 14 -2 26 M" + (R * 0.3).toFixed(0) + " " + (R * 0.9).toFixed(0) + " q -5 12 3 22";
    S("path", { d: loose, class: "hw-web-ring", fill: "none" }, svg);
    // gotas de rocío
    for (i = 0; i < 9; i++) {
      var k2 = rs[1 + Math.floor(rnd() * 6)], aa = ang[Math.floor(rnd() * (n - 1))] + 0.07, rr = R * k2 * 0.92;
      var cx = Math.cos(aa) * rr, cy = Math.sin(aa) * rr;
      S("circle", { cx: cx.toFixed(1), cy: cy.toFixed(1), r: (1.6 + rnd() * 1.2).toFixed(1), fill: "url(#hwDew)", stroke: "rgb(255 255 255 / .35)", "stroke-width": ".4" }, svg);
    }
    // mosca envuelta en seda
    var fx = Math.cos(ang[3] + 0.1) * R * 0.5, fy = Math.sin(ang[3] + 0.1) * R * 0.5;
    var fl = S("g", { transform: "translate(" + fx.toFixed(1) + " " + fy.toFixed(1) + ") rotate(35)" }, svg);
    S("ellipse", { rx: 7, ry: 3.4, fill: "rgb(240 235 255 / .85)", stroke: "rgb(120 100 160 / .5)", "stroke-width": ".6" }, fl);
    S("path", { d: "M-3 -3 L-3 3 M0 -3.3 L0 3.3 M3 -3 L3 3", stroke: "rgb(120 100 160 / .55)", "stroke-width": ".5", fill: "none" }, fl);
    S("path", { d: "M-7 0 l-4 -3 M-7 0 l-4 3", stroke: "rgb(80 60 110 / .6)", "stroke-width": ".6", fill: "none" }, fl);
    return wrap;
  }

  // ======================================================================
  //  ARAÑA (hilo anclado a la telaraña, patas por segmentos con resortes)
  // ======================================================================
  function buildSpider(layer, ax, sc, maxLen, animated) {
    var svg = S("svg", { class: "hw-spider", width: 2, height: 2 }, layer);
    svg.style.left = ax + "px"; svg.style.top = "0px";
    // nudo de seda en el punto de anclaje (en la telaraña)
    var knot = S("g", {}, svg);
    S("circle", { cx: 0, cy: 0, r: 2.6, class: "hw-knot" }, knot);
    S("path", { d: "M0 0 L-14 0 M0 0 L-9 7 M0 0 L9 6", class: "hw-web-main", fill: "none" }, knot);
    var g = S("g", {}, svg);
    var thread = S("line", { x1: 0, y1: 0, x2: 0, y2: 30, class: "hw-thread" }, g);
    var bodyG = S("g", {}, g);
    var legLayer = S("g", {}, bodyG);

    var HIPS = [[8, 50], [10.5, 56], [10.5, 62], [8, 68]];
    var L1 = 24, L2 = 27, L3 = 15, legs = [];
    [1, -1].forEach(function (side) {
      HIPS.forEach(function (h, i) {
        var g1 = S("g", {}, legLayer);
        S("line", { x1: 0, y1: 0, x2: L1, y2: 0, class: "sp-leg l1" }, g1);
        S("line", { x1: 1, y1: -1, x2: L1 - 1, y2: -1, class: "sp-hi" }, g1);
        var g2 = S("g", {}, g1);
        S("line", { x1: 0, y1: 0, x2: L2, y2: 0, class: "sp-leg l2" }, g2);
        S("line", { x1: 1, y1: -0.8, x2: L2 - 1, y2: -0.8, class: "sp-hi" }, g2);
        var g3 = S("g", {}, g2);
        S("line", { x1: 0, y1: 0, x2: L3, y2: 0, class: "sp-leg l3" }, g3);
        g2.setAttribute("transform", "translate(" + L1 + " 0)");
        g3.setAttribute("transform", "translate(" + L2 + " 0)");
        S("circle", { cx: L2, cy: 0, r: 1.9, class: "sp-joint" }, g2);
        S("circle", { cx: 0, cy: 0, r: 2.3, class: "sp-joint" }, g1);
        legs.push({ i: i, side: side, hx: h[0] * side, hy: h[1], g1: g1, g2: g2, g3: g3, a1: 30, v1: 0, a2: 40, v2: 0 });
      });
    });

    // cuerpo
    S("path", { d: "M-3 44 L-3 50 L3 50 L3 44Z", fill: "#150b24" }, bodyG);
    S("ellipse", { cx: 0, cy: 1.5, rx: 3, ry: 2, fill: "#150b24" }, bodyG);
    S("ellipse", { cx: 0, cy: 24, rx: 17, ry: 22, fill: "url(#hwSpBody)", class: "sp-body" }, bodyG);
    S("path", { d: "M-6 12 L6 12 L1.2 24 L6 36 L-6 36 L-1.2 24Z", fill: "#ff6a1a", opacity: ".92" }, bodyG);
    S("path", { d: "M-6 12 L6 12 L1.2 24 L6 36 L-6 36 L-1.2 24Z", fill: "none", stroke: "#ffd08a", "stroke-width": ".5", opacity: ".7" }, bodyG);
    S("ellipse", { cx: -7, cy: 12, rx: 4.2, ry: 8, fill: "#fff", opacity: ".2", transform: "rotate(18 -7 12)" }, bodyG);
    S("ellipse", { cx: 0, cy: 58, rx: 12.5, ry: 11.5, fill: "url(#hwSpHead)", class: "sp-body" }, bodyG);
    S("ellipse", { cx: -4, cy: 53, rx: 4, ry: 3, fill: "#fff", opacity: ".18" }, bodyG);
    // ojos (6) con brillo
    [[-4.4, 55, 2.9], [4.4, 55, 2.9], [-8.2, 51.5, 1.8], [8.2, 51.5, 1.8], [-2.2, 49.6, 1.3], [2.2, 49.6, 1.3]].forEach(function (e) {
      S("circle", { cx: e[0], cy: e[1], r: e[2], fill: "#ff4d2e" }, bodyG);
      S("circle", { cx: e[0] - e[2] * 0.3, cy: e[1] - e[2] * 0.3, r: e[2] * 0.32, fill: "#fff" }, bodyG);
    });
    // colmillos
    S("path", { d: "M-5 66 C-6 70 -5.5 74 -3.6 75 C-3 72 -3 69 -2.4 66Z", fill: "#2a1840", stroke: "#ff9a5a", "stroke-width": ".4" }, bodyG);
    S("path", { d: "M5 66 C6 70 5.5 74 3.6 75 C3 72 3 69 2.4 66Z", fill: "#2a1840", stroke: "#ff9a5a", "stroke-width": ".4" }, bodyG);

    var W = { s: 0, h: 1, c: 0 }, ts = { s: 0, h: 1, c: 0 };
    var st = { name: "rest", t: 0, len: 28, lenV: 0, pendAmp: 3, tgtLen: 28 };
    var DUR = { rest: 1.6, down: 3.6, hang: 3.8, up: 4.2 };
    var minLen = 28;

    function targets(i, side, t) {
      var ph = (i % 2 ? Math.PI : 0) + (side < 0 ? Math.PI : 0);
      var sc1 = [-35, 0, 30, 55][i] + 22 * Math.sin(t * 12 + ph);
      var sc2 = 58 + 28 * Math.sin(t * 12 + ph + 1.0);
      var hg1 = [8, 32, 58, 80][i] + 4 * Math.sin(t * 1.6 + i);
      var hg2 = [60, 52, 42, 32][i] + 6 * Math.sin(t * 1.9 + i * 0.7);
      var cl1 = [-78, -52, -22, 12][i] + 20 * Math.sin(t * 7 + ph);
      var cl2 = [30, 34, 40, 44][i] + 28 * Math.sin(t * 7 + ph + 1.2);
      return [sc1 * W.s + hg1 * W.h + cl1 * W.c, sc2 * W.s + hg2 * W.h + cl2 * W.c];
    }
    function apply(sx, pend) {
      g.setAttribute("transform", "rotate(" + pend.toFixed(2) + ")");
      thread.setAttribute("y2", st.len.toFixed(1));
      bodyG.setAttribute("transform", "translate(0 " + st.len.toFixed(1) + ") scale(" + (sx * sc).toFixed(3) + " " + sc + ")");
      for (var k = 0; k < legs.length; k++) {
        var L = legs[k];
        L.g1.setAttribute("transform", "translate(" + L.hx + " " + L.hy + ") scale(" + L.side + " 1) rotate(" + L.a1.toFixed(1) + ")");
        L.g2.setAttribute("transform", "translate(" + L1 + " 0) rotate(" + L.a2.toFixed(1) + ")");
        L.g3.setAttribute("transform", "translate(" + L2 + " 0) rotate(" + (L.a2 * 0.45 + 12).toFixed(1) + ")");
      }
    }
    function setState(name) {
      st.name = name; st.t = 0;
      if (name === "rest") { ts = { s: 0, h: 1, c: 0 }; st.tgtLen = minLen; }
      if (name === "down") { ts = { s: 1, h: 0, c: 0 }; }
      if (name === "hang") { ts = { s: 0, h: 1, c: 0 }; st.pendAmp = 10; }
      if (name === "up") { ts = { s: 0, h: 0, c: 1 }; }
      dbg.spider.state = name;
    }
    dbg.spider = { state: "rest", len: st.len, maxLen: maxLen };

    function update(t, dt) {
      st.t += dt;
      var p = clamp(st.t / DUR[st.name], 0, 1);
      if (st.name === "rest") st.tgtLen = minLen;
      else if (st.name === "down") st.tgtLen = minLen + (maxLen - minLen) * easeIO(p);
      else if (st.name === "hang") st.tgtLen = maxLen;
      else if (st.name === "up") st.tgtLen = maxLen - (maxLen - minLen) * easeIO(p);
      if (p >= 1) setState({ rest: "down", down: "hang", hang: "up", up: "rest" }[st.name]);
      // el hilo es elástico: rebota al frenar
      var acc = 70 * (st.tgtLen - st.len) - 9 * st.lenV;
      st.lenV += acc * dt; st.len += st.lenV * dt;
      dbg.spider.len = st.len;
      var kw = Math.min(1, dt * 6);
      W.s += (ts.s - W.s) * kw; W.h += (ts.h - W.h) * kw; W.c += (ts.c - W.c) * kw;
      for (var k = 0; k < legs.length; k++) {
        var L = legs[k], tg = targets(L.i, L.side, t);
        var d1 = Math.min(dt, 0.02), steps = Math.ceil(dt / d1);
        for (var q = 0; q < steps; q++) {
          L.v1 += (150 * (tg[0] - L.a1) - 9 * L.v1) * d1; L.a1 += L.v1 * d1;
          L.v2 += (150 * (tg[1] - L.a2) - 9 * L.v2) * d1; L.a2 += L.v2 * d1;
        }
      }
      var moving = (st.name === "down" || st.name === "up") ? 1 : 0;
      st.pendAmp += ((moving ? 3 : 5) - st.pendAmp) * Math.min(1, dt * 0.9);
      var pend = st.pendAmp * Math.sin(t * 1.5);
      var sx = 0.78 + 0.22 * Math.cos(t * 0.9);       // giro sobre el hilo (ilusión 3D)
      apply(sx, pend);
    }
    var obj = { update: update, svg: svg };
    if (!animated) {
      st.len = 96; W = { s: 0, h: 1, c: 0 };
      legs.forEach(function (L) { var tg = targets(L.i, L.side, 0); L.a1 = tg[0]; L.a2 = tg[1]; });
      apply(1, 0);
      return null;
    }
    return obj;
  }

  // ======================================================================
  //  MURCIÉLAGOS (alas articuladas, cruzan desde ambos lados)
  // ======================================================================
  function wingShape(a, u) {
    var rad = Math.PI / 180, sx = 5, sy = -1, f = 1 - 0.22 * Math.max(0, u);
    var L1 = 19 * f, A = a * rad;
    var wx = sx + L1 * Math.cos(A), wy = sy + L1 * Math.sin(A);
    var fa = [-6, 19, 42], fl = [36, 38, 30], tips = [];
    for (var k = 0; k < 3; k++) {
      var an = (a + fa[k] * (1 - 0.18 * Math.max(0, u))) * rad, ln = fl[k] * (1 - 0.14 * Math.max(0, u));
      tips.push([wx + ln * Math.cos(an), wy + ln * Math.sin(an)]);
    }
    function pull(p1, p2) { var mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2; return [mx + (wx - mx) * 0.34, my + (wy - my) * 0.34]; }
    var c1 = pull(tips[0], tips[1]), c2 = pull(tips[1], tips[2]), hip = [4, 13], c3 = [(tips[2][0] + hip[0]) / 2 - 2, (tips[2][1] + hip[1]) / 2 - 3];
    function P(p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }
    var mem = "M" + sx + " " + sy + " L" + P([wx, wy]) + " L" + P(tips[0]) + " Q" + P(c1) + " " + P(tips[1]) + " Q" + P(c2) + " " + P(tips[2]) + " Q" + P(c3) + " " + P(hip) + "Z";
    var bones = "M" + P([wx, wy]) + " L" + P(tips[0]) + " M" + P([wx, wy]) + " L" + P(tips[1]) + " M" + P([wx, wy]) + " L" + P(tips[2]);
    var arm = "M" + sx + " " + sy + " L" + P([wx, wy]);
    return { mem: mem, bones: bones, arm: arm };
  }

  function buildBat(layer, idx, layerW, layerH) {
    var svg = S("svg", { class: "hw-bat", width: 2, height: 2 }, layer);
    var g = S("g", {}, svg);
    var wingR = S("g", {}, g), wingL = S("g", { transform: "scale(-1 1)" }, g);
    var parts = [wingR, wingL].map(function (w) {
      return { mem: S("path", { class: "bat-mem" }, w), bones: S("path", { class: "bat-bone", fill: "none" }, w), arm: S("path", { class: "bat-arm", fill: "none" }, w) };
    });
    var body = S("g", {}, g);
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
      svg: svg, dir: idx % 2 ? -1 : 1, wait: 0.8 + idx * 2.4 + rnd() * 2, flying: false, u: 0, T: 8,
      y0: 60, A1: 40, f1: 1.4, A2: 8, f2: 3, ph: 0, flap: rnd() * 6, hz: 4 + rnd() * 1.4, s: 1, base: 0.8 + rnd() * 0.45, x: 0, y: 0, rnd: rnd
    };
    dbg.bats.push(bat);
    function launch() {
      bat.flying = true; bat.u = 0;
      bat.dir = -bat.dir;
      bat.T = 7 + bat.rnd() * 4;
      bat.y0 = 40 + bat.rnd() * (layerH - 130);
      bat.A1 = 25 + bat.rnd() * 55; bat.f1 = 0.8 + bat.rnd() * 1.4; bat.A2 = 4 + bat.rnd() * 8; bat.f2 = 2 + bat.rnd() * 2;
      bat.ph = bat.rnd() * 6.28; bat.s = 0.65 + bat.rnd() * 0.55;
      svg.style.opacity = String(0.7 + bat.s * 0.25);
    }
    function update(t, dt) {
      bat.flap += dt * bat.hz * 2 * Math.PI;
      var u = Math.sin(bat.flap), a = -10 - 54 * u;
      var w = wingShape(a, u);
      parts.forEach(function (p) { p.mem.setAttribute("d", w.mem); p.bones.setAttribute("d", w.bones); p.arm.setAttribute("d", w.arm); });
      body.setAttribute("transform", "translate(0 " + (2.6 * u).toFixed(2) + ")");
      if (!bat.flying) {
        bat.wait -= dt; svg.style.visibility = "hidden";
        if (bat.wait <= 0) launch();
        return;
      }
      bat.u += dt / bat.T;
      if (bat.u >= 1) { bat.flying = false; bat.wait = 1.5 + bat.rnd() * 5; svg.style.visibility = "hidden"; return; }
      svg.style.visibility = "visible";
      var span = layerW + 200, p = bat.u;
      var x = bat.dir > 0 ? -100 + p * span : layerW + 100 - p * span;
      var wave = p * bat.f1 * 6.283 + bat.ph;
      var y = bat.y0 + bat.A1 * Math.sin(wave) + bat.A2 * Math.sin(p * bat.f2 * 6.283 + bat.ph) - 2.6 * u * bat.s;
      var vy = bat.A1 * Math.cos(wave) * bat.f1 * 6.283 / (bat.T * 40);
      var roll = bat.dir * 9 + clamp(vy * 12, -14, 14);
      bat.x = x; bat.y = y;
      var sc = bat.s * bat.base;
      svg.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) rotate(" + roll.toFixed(1) + "deg) scale(" + sc.toFixed(3) + ")";
    }
    return { update: update };
  }

  // ======================================================================
  //  CALABAZA 3D (capas con profundidad + vela por dentro)
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

    var L1 = layer(-22);
    [26, 94].forEach(function (cx) {
      S("ellipse", { cx: cx, cy: 68, rx: 24, ry: 37, fill: "url(#hwLobeD)" }, L1);
      S("ellipse", { cx: cx, cy: 68, rx: 24, ry: 37, fill: "url(#hwShade)" }, L1);
    });
    var L2 = layer(-12);
    [44, 76].forEach(function (cx) {
      S("ellipse", { cx: cx, cy: 68, rx: 27, ry: 41, fill: "url(#hwLobe)" }, L2);
      S("ellipse", { cx: cx, cy: 68, rx: 27, ry: 41, fill: "url(#hwShade)" }, L2);
    });
    S("path", { d: "M20 40 C12 58 12 80 22 97 M100 40 C108 58 108 80 98 97", fill: "none", stroke: "rgb(90 25 0 / .4)", "stroke-width": "1.5", "stroke-linecap": "round" }, L2);
    var L3 = layer(-8);
    S("ellipse", { cx: 60, cy: 69, rx: 28, ry: 41, fill: "#3b1100" }, L3);
    var L4 = layer(-5);
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
    S("ellipse", { cx: 60, cy: 68, rx: 29, ry: 43, fill: "url(#hwShade)" }, front);
    S("ellipse", { cx: 47, cy: 43, rx: 9, ry: 14, fill: "#fff", opacity: ".2", transform: "rotate(-18 47 43)" }, front);
    shapes(all, L5, { fill: "none", stroke: "rgb(120 40 5 / .8)", "stroke-width": "1.5", "stroke-linejoin": "round" });
    // párpados para parpadear
    var lids = face.eyes.map(function (sh) {
      var a = {}; for (var k in sh.a) a[k] = sh.a[k];
      a.fill = "#f27818"; a.stroke = "rgb(120 40 5 / .6)"; a["stroke-width"] = "1";
      var e = S(sh.tag, a, L5); e.setAttribute("opacity", "0");
      return { e: e, top: sh.top };
    });

    var L6 = layer(10);
    var stem = S("g", {}, L6);
    S("path", { d: "M54 33 C53 21 57 13 65 8 L73 14 C68 18 68 24 70 33Z", fill: "url(#hwStem)" }, stem);
    S("path", { d: "M58 30 C58 22 60 17 64 13 M63 31 C63 25 64 21 67 17", fill: "none", stroke: "rgb(40 25 8 / .5)", "stroke-width": ".9", "stroke-linecap": "round" }, stem);
    S("ellipse", { cx: 69, cy: 11, rx: 4.6, ry: 2.2, fill: "#3d2a10", transform: "rotate(30 69 11)" }, stem);
    var L7 = layer(15);
    var vine = S("g", {}, L7);
    S("path", { d: "M70 16 C84 7 95 18 86 24 C81 27 77 23 80 20", fill: "none", stroke: "#58b04a", "stroke-width": "2.2", "stroke-linecap": "round" }, vine);
    S("path", { d: "M83 13 C92 4 106 9 103 18 C95 21 86 20 83 13Z", fill: "#58b04a", stroke: "#3c8a33", "stroke-width": ".8" }, vine);
    S("path", { d: "M85 14 C92 11 98 12 102 15", fill: "none", stroke: "#3c8a33", "stroke-width": ".7" }, vine);
    stem.style.transformOrigin = "58px 32px"; vine.style.transformOrigin = "70px 16px";

    var st = { nextHop: 2 + id, hopT: -1, nextBlink: 2 + id * 0.8, blinkT: -1 };
    var JUMP = H * 0.26;
    function update(t, dt) {
      var ry = Math.sin(t * 0.8 + ph) * 14 + ptr.x * 24, rx = -4 + Math.sin(t * 0.6 + ph) * 4 - ptr.y * 10;
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
      var lift = clamp(-y / (JUMP || 1), 0, 1);
      shadow.style.transform = "scaleX(" + (1 - 0.35 * lift).toFixed(2) + ")"; shadow.style.opacity = (0.9 - 0.4 * lift).toFixed(2);
      // vela: parpadeo orgánico
      var n = 0.5 + 0.25 * Math.sin(t * 13) + 0.15 * Math.sin(t * 7.3 + 1) + 0.1 * Math.sin(t * 19.1);
      var fo = 0.8 + 0.2 * n;
      flCrisp.setAttribute("opacity", fo.toFixed(2)); flGlow.setAttribute("opacity", (0.7 + 0.3 * n).toFixed(2));
      glow.style.opacity = (0.55 + 0.45 * n).toFixed(2); floor.style.opacity = (0.5 + 0.5 * n).toFixed(2);
      // los ojos de la vela siguen al puntero
      eyesFl.setAttribute("transform", "translate(" + (ptr.x * 2.6).toFixed(2) + " " + (ptr.y * 1.6).toFixed(2) + ")");
      eyesGlow.setAttribute("transform", "translate(" + (ptr.x * 2.6).toFixed(2) + " " + (ptr.y * 1.6).toFixed(2) + ")");
      mouthFl.setAttribute("transform", "translate(0 " + (Math.sin(t * 2.4 + ph) * 0.7).toFixed(2) + ")");
      // parpadeo
      if (st.blinkT < 0 && t > st.nextBlink) st.blinkT = 0;
      var bs = 0;
      if (st.blinkT >= 0) { st.blinkT += dt; var b = st.blinkT / 0.18; if (b >= 1) { st.blinkT = -1; st.nextBlink = t + 2.5 + Math.random() * 3.5; } else bs = 1 - Math.abs(2 * b - 1); }
      lids.forEach(function (l) {
        l.e.setAttribute("opacity", bs > 0.03 ? "1" : "0");
        l.e.setAttribute("transform", "translate(" + l.top[0] + " " + l.top[1] + ") scale(1 " + (bs * 1).toFixed(3) + ") translate(" + (-l.top[0]) + " " + (-l.top[1]) + ")");
      });
      stem.style.transform = "rotate(" + (Math.sin(t * 1.7 + ph) * 3).toFixed(2) + "deg)";
      vine.style.transform = "rotate(" + (Math.sin(t * 1.3 + ph + 1) * 7).toFixed(2) + "deg)";
    }
    return { el: el, update: update, staticPose: function () { body.style.transform = "rotateY(10deg) rotateX(-4deg)"; } };
  }

  // ======================================================================
  //  FANTASMA (dobladillo ondulante, brazos, ojos que siguen, 3D por capas)
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

  function buildGhost() {
    var el = D("hw-ghost"), aura = D("gh-aura", el), stage = D("gh-stage", el), body = D("gh-body", stage), shadow = D("gh-shadow", el);
    function layer(z) { var s = S("svg", { viewBox: "0 0 64 84", class: "gh-l" }); s.style.transform = "translateZ(" + z + "px)"; body.appendChild(s); return s; }
    var back = layer(-12);
    var backPath = S("path", { fill: "rgb(170 150 255 / .5)", filter: "url(#hwBlurS)" }, back);
    var f = layer(0);
    var armL = S("g", {}, f), armR = S("g", {}, f);
    [armL, armR].forEach(function (a, idx) {
      var inner = S("g", { transform: idx === 0 ? "scale(-1 1)" : "" }, a);
      S("path", { d: "M0 -3.5 C8 -4.5 14 0 16 6 C12 8 6 7 0 4Z", fill: "url(#hwGhost)", stroke: "rgb(140 110 210 / .5)", "stroke-width": ".9" }, inner);
    });
    var main = S("path", { fill: "url(#hwGhost)", stroke: "rgb(140 110 210 / .55)", "stroke-width": "1.1", "stroke-linejoin": "round" }, f);
    var shade = S("path", { fill: "url(#hwGhostShade)" }, f);
    S("ellipse", { cx: 22, cy: 16, rx: 7, ry: 10, fill: "#fff", opacity: ".55", transform: "rotate(-20 22 16)" }, f);
    var eyeL = S("g", {}, f), eyeR = S("g", {}, f);
    var glints = [];
    [[eyeL, 23], [eyeR, 41]].forEach(function (e) {
      S("ellipse", { cx: e[1], cy: 31, rx: 3.6, ry: 5.8, fill: "#2a1840" }, e[0]);
      glints.push(S("circle", { cx: e[1] - 1, cy: 29, r: 1.3, fill: "#fff" }, e[0]));
    });
    var mouth = S("ellipse", { cx: 32, cy: 45, rx: 4, ry: 5.2, fill: "#2a1840" }, f);
    S("circle", { cx: 16, cy: 40, r: 3.6, fill: "#ff9ec4", opacity: ".5" }, f);
    S("circle", { cx: 48, cy: 40, r: 3.6, fill: "#ff9ec4", opacity: ".5" }, f);
    // chispas de espíritu que suben
    var orbs = [];
    for (var i = 0; i < 6; i++) { var o = D("gh-orb", el); orbs.push({ e: o, life: Math.random() }); }
    var st = { nextBoo: 4, boo: -1, nextBlink: 2, blinkT: -1 };
    function update(t, dt) {
      var k = 1;
      var ox = 10 * Math.sin(t * 0.7), oy = 12 * Math.sin(t * 1.2), lean = Math.cos(t * 0.7) * 5;
      var scale = 1, armUp = 0, mo = 0, eyeS = 1;
      if (st.boo < 0 && t > st.nextBoo) st.boo = 0;
      if (st.boo >= 0) {
        st.boo += dt; var b = st.boo / 1.1;
        if (b >= 1) { st.boo = -1; st.nextBoo = t + 7 + Math.random() * 5; }
        else { var e = Math.sin(Math.PI * b); scale = 1 + 0.2 * e; armUp = e; mo = e; eyeS = 1 + 0.25 * e; }
      }
      var d = ghostBody(t, k);
      main.setAttribute("d", d); shade.setAttribute("d", d); backPath.setAttribute("d", d);
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
      glints.forEach(function (g) { g.style.transform = "translate(" + (ptr.x * 1.6).toFixed(2) + "px," + (ptr.y * 1.2).toFixed(2) + "px)"; });
      stage.style.transform = "translate(" + ox.toFixed(1) + "px," + oy.toFixed(1) + "px) rotate(" + lean.toFixed(1) + "deg) scale(" + scale.toFixed(3) + ")";
      body.style.transform = "rotateY(" + (ptr.x * 26 + Math.sin(t * 0.9) * 8).toFixed(1) + "deg) rotateX(" + (-ptr.y * 10).toFixed(1) + "deg)";
      aura.style.opacity = (0.5 + 0.25 * Math.sin(t * 2) + 0.4 * mo).toFixed(2);
      shadow.style.transform = "translateX(" + ox.toFixed(1) + "px) scaleX(" + (1 - oy / 60).toFixed(2) + ")"; shadow.style.opacity = (0.5 - oy / 60).toFixed(2);
      orbs.forEach(function (o, i) {
        o.life += dt * 0.35; if (o.life > 1) { o.life = 0; o.x = (Math.random() - 0.5) * 40; }
        if (o.x === undefined) o.x = (Math.random() - 0.5) * 40;
        o.e.style.transform = "translate(" + (o.x + Math.sin(t * 2 + i) * 6 + ox).toFixed(1) + "px," + (-o.life * 70 + oy).toFixed(1) + "px)";
        o.e.style.opacity = (Math.sin(Math.PI * o.life) * 0.8).toFixed(2);
      });
    }
    return { el: el, update: update, staticPose: function () { var d = ghostBody(0, 0); main.setAttribute("d", d); shade.setAttribute("d", d); backPath.setAttribute("d", d); armR.setAttribute("transform", "translate(55 42) rotate(24)"); armL.setAttribute("transform", "translate(9 42) rotate(24)"); } };
  }

  // ======================================================================
  //  Montaje / desmontaje
  // ======================================================================
  var layerEl = null, resizeT = 0, lastBig = null;
  function navAlto() { var nav = document.querySelector(".topnav"); return nav ? nav.offsetHeight : 0; }
  function montarCapa() {
    var anim = animar(), big = window.innerWidth > 900, size = big ? 240 : 150, sc = big ? 0.7 : 0.5;
    lastBig = big;
    var layer = D("hw-layer"); layer.setAttribute("aria-hidden", "true");
    var h = big ? 400 : 320;
    layer.style.top = navAlto() + "px"; layer.style.height = h + "px";
    layer.appendChild(buildWeb(size, false));
    layer.appendChild(buildWeb(size, true));
    var lw = window.innerWidth;
    var sp = buildSpider(layer, size, sc, Math.min(h - 70, big ? 210 : 150), anim);
    if (sp) objs.push(sp);
    if (anim) {
      var nb = big ? 3 : 2;
      for (var i = 0; i < nb; i++) objs.push(buildBat(layer, i, lw, h));
    }
    document.body.appendChild(layer);
    layerEl = layer;
  }
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
    stopLoop(); dbg.bats = []; dbg.spider = null;
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
