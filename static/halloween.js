// Decoración de Halloween en 3D REAL (WebGL2, sin librerías). Solo visual, aria-hidden, sin clics.
//  - Todas las figuras son mallas con volumen (calabaza lobulada, fantasma, araña con patas articuladas, murciélago con alas membranosas),
//    iluminadas con luz clave, relleno, brillo y luz de borde. Al girar se ven redondas, no como capas.
//  - SOLO las calabazas siguen al ratón. Araña, murciélagos y fantasmas tienen su propia animación natural.
//  - Capa fija: se ve también al bajar la página.
// Se activa sola del 24 de octubre al 2 de noviembre; la elección de la persona manda siempre.
(function () {
  "use strict";
  var root = document.documentElement;
  var KEY = "pangoa_halloween";
  var NS = "http://www.w3.org/2000/svg";
  var RAD = Math.PI / 180, PI = Math.PI;

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
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function easeIO(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
  function seeded(s) { return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function esOscuro() { return root.getAttribute("data-theme") === "dark"; }

  // ---------- estado global y puntero ----------
  var objs = [], raf = 0, lastT = 0, GLR = null;
  var ptr = { mx: null, my: null, last: -999 };
  var dbg = { spider: null, bats: [], pumpkins: [], ghosts: [], gl: false };
  function onMove(e) { ptr.mx = e.clientX; ptr.my = e.clientY; ptr.last = performance.now() / 1000; }
  // peso con el que las CALABAZAS siguen al puntero (se relajan si no hay movimiento por 4 s)
  function followW(t) { if (ptr.mx === null) return 0; return clamp(1 - (t - ptr.last - 4) / 1.5, 0, 1); }

  // ======================================================================
  //  Matemática 4x4 (columnas) y utilidades de vectores
  // ======================================================================
  function m4() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  function mul(a, b) {
    var o = new Array(16), i, j;
    for (j = 0; j < 4; j++) for (i = 0; i < 4; i++)
      o[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
    return o;
  }
  function chain() { var r = arguments[0]; for (var i = 1; i < arguments.length; i++) r = mul(r, arguments[i]); return r; }
  function T(x, y, z) { var m = m4(); m[12] = x; m[13] = y; m[14] = z; return m; }
  function Sc(x, y, z) { var m = m4(); m[0] = x; m[5] = y === undefined ? x : y; m[10] = z === undefined ? x : z; return m; }
  function RX(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; }
  function RY(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; }
  function RZ(a) { var c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  function persp(fov, n, f) { var t = 1 / Math.tan(fov / 2); return [t, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; }
  function nmat(m) {
    var a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
    var C00 = e * i - h * f, C01 = -(b * i - h * c), C02 = b * f - e * c;
    var C10 = -(d * i - g * f), C11 = a * i - g * c, C12 = -(a * f - d * c);
    var C20 = d * h - g * e, C21 = -(a * h - g * b), C22 = a * e - d * b;
    var det = a * C00 + d * C01 + g * C02; if (!det) det = 1; var id = 1 / det;
    return new Float32Array([C00 * id, C10 * id, C20 * id, C01 * id, C11 * id, C21 * id, C02 * id, C12 * id, C22 * id]);
  }
  function inv4(m) {
    var a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7], a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    var b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    var b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!det) return m4(); det = 1 / det;
    return [(a11 * b11 - a12 * b10 + a13 * b09) * det, (a02 * b10 - a01 * b11 - a03 * b09) * det, (a31 * b05 - a32 * b04 + a33 * b03) * det, (a22 * b04 - a21 * b05 - a23 * b03) * det,
      (a12 * b08 - a10 * b11 - a13 * b07) * det, (a00 * b11 - a02 * b08 + a03 * b07) * det, (a32 * b02 - a30 * b05 - a33 * b01) * det, (a20 * b05 - a22 * b02 + a23 * b01) * det,
      (a10 * b10 - a11 * b08 + a13 * b06) * det, (a01 * b08 - a00 * b10 - a03 * b06) * det, (a30 * b04 - a31 * b02 + a33 * b00) * det, (a21 * b02 - a20 * b04 - a23 * b00) * det,
      (a11 * b07 - a10 * b09 - a12 * b06) * det, (a00 * b09 - a01 * b07 + a02 * b06) * det, (a31 * b01 - a30 * b03 - a32 * b00) * det, (a20 * b03 - a21 * b01 + a22 * b00) * det];
  }
  function vsub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function vcross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function vlen(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
  function vnorm(a) { var l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function vmix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  // matriz que lleva un cilindro unitario (eje +Y, de 0 a 1) del punto a al punto b con radio r
  function seg(a, b, r) {
    var d = vsub(b, a), L = vlen(d) || 1e-6, y = [d[0] / L, d[1] / L, d[2] / L];
    var up = Math.abs(y[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], x = vnorm(vcross(up, y)), z = vcross(y, x);
    return [x[0] * r, x[1] * r, x[2] * r, 0, y[0] * L, y[1] * L, y[2] * L, 0, z[0] * r, z[1] * r, z[2] * r, 0, a[0], a[1], a[2], 1];
  }

  // ======================================================================
  //  Mallas procedurales (vértice = pos3 + normal3 + color3)
  // ======================================================================
  // Superficie paramétrica P(u,v), u rodea el eje, v va de arriba a abajo. Normales numéricas; el sentido se orienta hacia afuera.
  function surfBuild(nu, nv, fn, colFn, cenFn, buf) {
    var W = nu + 1, e = 1e-3, k = 0, i, j, flip = 0;
    var v = buf || new Float32Array(W * (nv + 1) * 9);
    for (j = 0; j <= nv; j++) {
      for (i = 0; i <= nu; i++) {
        var u = i / nu, w = j / nv, P = fn(u, w), C = cenFn ? cenFn(u, w, P) : [0, 0, 0];
        var du = vsub(fn(u + e, w), fn(u - e, w)), dv = vsub(fn(u, Math.min(1, w + e)), fn(u, Math.max(0, w - e)));
        var n = vcross(du, dv), out = vsub(P, C);
        if (vlen(n) < 1e-9) n = out;
        if (!flip && j === (nv >> 1) && i === (nu >> 3)) flip = (n[0] * out[0] + n[1] * out[1] + n[2] * out[2]) >= 0 ? 1 : -1;
        n = vnorm(n);
        var col = colFn ? colFn(u, w, P) : [1, 1, 1];
        v[k++] = P[0]; v[k++] = P[1]; v[k++] = P[2];
        v[k++] = n[0]; v[k++] = n[1]; v[k++] = n[2];
        v[k++] = col[0]; v[k++] = col[1]; v[k++] = col[2];
      }
    }
    return { v: v, flip: flip || 1 };
  }
  function surfIndex(nu, nv, flip) {
    var W = nu + 1, idx = [], i, j;
    for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) {
      var a = j * W + i, b = a + 1, c = a + W, d = c + 1;
      if (flip > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    return new Uint16Array(idx);
  }
  function surf(nu, nv, fn, colFn, cenFn) {
    var s = surfBuild(nu, nv, fn, colFn, cenFn);
    if (s.flip < 0) for (var k = 0; k < s.v.length; k += 9) { s.v[k + 3] = -s.v[k + 3]; s.v[k + 4] = -s.v[k + 4]; s.v[k + 5] = -s.v[k + 5]; }
    return { v: s.v, i: surfIndex(nu, nv, s.flip), nu: nu, nv: nv, flip: s.flip, fn: fn, colFn: colFn, cenFn: cenFn };
  }
  function sphereFn(u, v) { var ph = PI * v, th = 2 * PI * u; return [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)]; }
  function mkSphere(nu, nv) { return surf(nu || 28, nv || 18, sphereFn); }
  function mkCyl(taper, nu) {
    return surf(nu || 12, 2, function (u, v) { var r = 1 - (1 - taper) * v, a = 2 * PI * u; return [r * Math.cos(a), v, r * Math.sin(a)]; }, null, function (u, v) { return [0, v, 0]; });
  }
  function groove(th) { return Math.pow(Math.abs(Math.cos(5 * th)), 0.55); }
  function pumpkinP(u, v) {
    var th = u * 2 * PI, ph = 0.004 + v * (PI - 0.008), s = Math.sin(ph), c = Math.cos(ph), g = groove(th);
    var rad = s * (0.87 + 0.13 * g), y = c * 0.8;
    y -= 0.2 * Math.exp(-Math.pow(ph / 0.36, 2)) * (0.9 + 0.1 * g);
    y += 0.12 * Math.exp(-Math.pow((PI - ph) / 0.36, 2));
    return [rad * Math.cos(th), y, rad * Math.sin(th)];
  }
  function mkPumpkin() {
    return surf(96, 56, pumpkinP, function (u, v, P) {
      var th = u * 2 * PI, g = Math.pow(groove(th), 1.4), ph = 0.004 + v * (PI - 0.008), s = Math.sin(ph);
      var dk = [0.66, 0.2, 0.02], lt = [1.0, 0.56, 0.12], c = vmix(dk, lt, g), sh = 0.78 + 0.22 * s;
      c = [c[0] * sh, c[1] * sh, c[2] * sh];
      var top = Math.exp(-Math.pow(ph / 0.42, 2)); c = vmix(c, [0.46, 0.34, 0.1], top * 0.85);
      return c;
    }, function (u, v, P) { return [0, P[1] * 0.0, 0]; });
  }
  function stemC(t) { return [0.04 + 0.3 * t * t, 0.5 + 0.62 * t, 0.06 * t]; }
  function mkStem() {
    return surf(18, 22, function (u, v) {
      var C = stemC(v), a = 2 * PI * u, tg = vnorm(vsub(stemC(Math.min(1, v + 0.01)), stemC(Math.max(0, v - 0.01))));
      var N = vnorm(vcross(tg, [0, 0, 1])), B = [0, 0, 1];
      var r = (0.16 - 0.06 * v + 0.07 * Math.pow(1 - v, 6)) * (1 + 0.14 * Math.cos(6 * a));
      if (v > 0.9) { var k = (v - 0.9) / 0.1; r *= Math.sqrt(Math.max(0, 1 - k * k * 0.9)); }
      return [C[0] + r * (Math.cos(a) * N[0]), C[1] + r * (Math.cos(a) * N[1]), C[2] + r * Math.sin(a)];
    }, function (u, v) { return vmix([0.4, 0.27, 0.09], [0.36, 0.42, 0.14], smooth(0.4, 1, v)); }, function (u, v) { return stemC(v); });
  }
  function vineC(t) {
    var a = 2 * PI * 1.7 * t, rr = 0.2 * (1 - 0.72 * t);
    return [0.2 + 0.28 * t + rr * Math.cos(a) - 0.2, 0.62 + 0.5 * t + rr * Math.sin(a) * 0.9, 0.2 + 0.05 * Math.sin(a * 0.5)];
  }
  function mkVine() {
    return surf(8, 34, function (u, v) {
      var C = vineC(v), a = 2 * PI * u, r = 0.04 * (1 - 0.7 * v) + 0.006;
      var tg = vnorm(vsub(vineC(Math.min(1, v + 0.01)), vineC(Math.max(0, v - 0.01)))), N = vnorm(vcross(tg, [0, 0, 1])), B = vnorm(vcross(tg, N));
      return [C[0] + r * (Math.cos(a) * N[0] + Math.sin(a) * B[0]), C[1] + r * (Math.cos(a) * N[1] + Math.sin(a) * B[1]), C[2] + r * (Math.cos(a) * N[2] + Math.sin(a) * B[2])];
    }, function () { return [0.32, 0.68, 0.24]; }, function (u, v) { return vineC(v); });
  }
  // fantasma (dinámico): cúpula + cuerpo que se ensancha + dobladillo ondulante
  var GH_NU = 44, GH_NV = 38;
  function ghostFn(t) {
    return function (u, v) {
      var th = u * 2 * PI, rho, y;
      if (v < 0.36) { var ph = v / 0.36 * (PI / 2); rho = 0.82 * Math.sin(ph); y = 0.58 + 0.92 * Math.cos(ph); }
      else {
        var q = (v - 0.36) / 0.64;
        rho = 0.82 + 0.2 * Math.pow(q, 1.3); y = 0.58 - q * 1.62;
        var w = smooth(0.55, 1, q), wave = 0.5 + 0.5 * Math.cos(3.5 * th * 2 + t * 2.6 + 0.8 * Math.sin(t * 1.3));
        y -= w * (0.16 * wave + 0.05 * Math.sin(th * 3 - t * 2));
        rho *= 1 + w * 0.06 * Math.cos(7 * th + t * 2.2);
        if (q > 0.93) { var k = (q - 0.93) / 0.07; rho *= 1 - 0.5 * k * k; y += 0.04 * k; }
      }
      return [rho * Math.cos(th), y, rho * Math.sin(th)];
    };
  }
  function mkGhost() {
    var m = surf(GH_NU, GH_NV, ghostFn(0), function (u, v) { return [1, 1, 1]; }, function (u, v, P) { return [0, P[1], 0]; });
    return m;
  }
  function updateGhost(m, t) { surfBuild(GH_NU, GH_NV, ghostFn(t), function () { return [1, 1, 1]; }, function (u, v, P) { return [0, P[1], 0]; }, m.v); if (m.flip < 0) for (var k = 0; k < m.v.length; k += 9) { m.v[k + 3] = -m.v[k + 3]; m.v[k + 4] = -m.v[k + 4]; m.v[k + 5] = -m.v[k + 5]; } }
  // membrana de ala: abanico alrededor de la muñeca, subdividido y con panza
  var WN = 4, WVERTS = 6 * WN * WN * 3;
  function wingFill(out, S_, W_, Tp, H_, bulge, mirror) {
    var m = function (a, b) { var mid = vmix(a, b, 0.5); return vmix(mid, W_, 0.2); };
    var M01 = m(Tp[0], Tp[1]), M12 = m(Tp[1], Tp[2]);
    var tris = [[W_, Tp[0], M01], [W_, M01, Tp[1]], [W_, Tp[1], M12], [W_, M12, Tp[2]], [W_, Tp[2], H_], [W_, H_, S_]];
    var k = 0, ti, i, j;
    function put(p, n) { out[k++] = mirror ? -p[0] : p[0]; out[k++] = p[1]; out[k++] = p[2]; out[k++] = mirror ? -n[0] : n[0]; out[k++] = n[1]; out[k++] = n[2]; out[k++] = 1; out[k++] = 1; out[k++] = 1; }
    for (ti = 0; ti < 6; ti++) {
      var A = tris[ti][0], B = tris[ti][1], C = tris[ti][2], n0 = vnorm(vcross(vsub(B, A), vsub(C, A)));
      var grid = [];
      for (j = 0; j <= WN; j++) { grid[j] = []; for (i = 0; i <= WN - j; i++) {
        var a = i / WN, b = j / WN, w0 = 1 - a - b, bl = bulge * 27 * w0 * a * b;
        grid[j][i] = [A[0] + (B[0] - A[0]) * a + (C[0] - A[0]) * b + n0[0] * bl, A[1] + (B[1] - A[1]) * a + (C[1] - A[1]) * b + n0[1] * bl, A[2] + (B[2] - A[2]) * a + (C[2] - A[2]) * b + n0[2] * bl];
      } }
      for (j = 0; j < WN; j++) for (i = 0; i < WN - j; i++) {
        var p00 = grid[j][i], p10 = grid[j][i + 1], p01 = grid[j + 1][i];
        if (mirror) { put(p00, n0); put(p01, n0); put(p10, n0); } else { put(p00, n0); put(p10, n0); put(p01, n0); }
        if (i < WN - j - 1) {
          var p11 = grid[j + 1][i + 1];
          if (mirror) { put(p10, n0); put(p01, n0); put(p11, n0); } else { put(p10, n0); put(p11, n0); put(p01, n0); }
        }
      }
    }
    return k / 9;
  }
  // une varias mallas ya transformadas en una sola (para detalles estáticos)
  function bake(parts) {
    var vs = [], is = [], base = 0;
    parts.forEach(function (p) {
      var M = p.M, N3 = nmat(M), mesh = p.mesh, c = p.col, n = mesh.v.length / 9, i;
      for (i = 0; i < n; i++) {
        var o = i * 9, x = mesh.v[o], y = mesh.v[o + 1], z = mesh.v[o + 2], nx = mesh.v[o + 3], ny = mesh.v[o + 4], nz = mesh.v[o + 5];
        var tx = M[0] * x + M[4] * y + M[8] * z + M[12], ty = M[1] * x + M[5] * y + M[9] * z + M[13], tz = M[2] * x + M[6] * y + M[10] * z + M[14];
        var qx = N3[0] * nx + N3[3] * ny + N3[6] * nz, qy = N3[1] * nx + N3[4] * ny + N3[7] * nz, qz = N3[2] * nx + N3[5] * ny + N3[8] * nz, ql = Math.sqrt(qx * qx + qy * qy + qz * qz) || 1;
        vs.push(tx, ty, tz, qx / ql, qy / ql, qz / ql, c[0], c[1], c[2]);
      }
      for (i = 0; i < mesh.i.length; i++) is.push(mesh.i[i] + base);
      base += n;
    });
    return { v: new Float32Array(vs), i: new Uint16Array(is) };
  }

  // ======================================================================
  //  Renderizador WebGL2 (una sola capa, una vista por figura)
  // ======================================================================
  var VS = "#version 300 es\n" +
    "layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec3 aCol;\n" +
    "uniform mat4 uMV, uP; uniform mat3 uNM; out vec3 vN, vV, vO, vC;\n" +
    "void main(){ vec4 v = uMV*vec4(aPos,1.); vV = v.xyz; vN = normalize(uNM*aNrm); vO = aPos; vC = aCol; gl_Position = uP*v; }";
  var FS = "#version 300 es\nprecision highp float;\n" +
    "in vec3 vN, vV, vO, vC; out vec4 oC;\n" +
    "uniform int uMat, uFace; uniform vec3 uTint, uRim, uEmis, uCamO; uniform float uAlpha, uSpec, uShin, uRimK, uWrap, uFuzz, uTime, uFlick, uDark;\n" +
    "float hash(vec3 p){ p = fract(p*.3183099+.1); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }\n" +
    "float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);\n" +
    " return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),\n" +
    "  mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }\n" +
    "float sdTri(vec2 p, vec2 a, vec2 b, vec2 c){ vec2 e0=b-a,e1=c-b,e2=a-c,v0=p-a,v1=p-b,v2=p-c;\n" +
    " vec2 q0=v0-e0*clamp(dot(v0,e0)/dot(e0,e0),0.,1.), q1=v1-e1*clamp(dot(v1,e1)/dot(e1,e1),0.,1.), q2=v2-e2*clamp(dot(v2,e2)/dot(e2,e2),0.,1.);\n" +
    " float s = sign(e0.x*e2.y-e0.y*e2.x);\n" +
    " vec2 d = min(min(vec2(dot(q0,q0),s*(v0.x*e0.y-v0.y*e0.x)), vec2(dot(q1,q1),s*(v1.x*e1.y-v1.y*e1.x))), vec2(dot(q2,q2),s*(v2.x*e2.y-v2.y*e2.x)));\n" +
    " return -sqrt(d.x)*sign(d.y); }\n" +
    "const vec2 MP[13] = vec2[13](vec2(-.6,-.12),vec2(-.42,-.23),vec2(-.24,-.12),vec2(-.09,-.25),vec2(.09,-.25),vec2(.24,-.12),vec2(.42,-.23),vec2(.6,-.12),vec2(.5,-.4),vec2(.3,-.57),vec2(0.,-.63),vec2(-.3,-.57),vec2(-.5,-.4));\n" +
    "float sdMouth(vec2 p){ float d = dot(p-MP[0],p-MP[0]), s = 1.;\n" +
    " for(int i=0,j=12;i<13;j=i,i++){ vec2 e=MP[j]-MP[i], w=p-MP[i], b=w-e*clamp(dot(w,e)/dot(e,e),0.,1.); d=min(d,dot(b,b));\n" +
    "  bvec3 c = bvec3(p.y>=MP[i].y, p.y<MP[j].y, e.x*w.y>e.y*w.x); if(all(c)||all(not(c))) s*=-1.; }\n" +
    " return s*sqrt(d); }\n" +
    "float faceSDF(vec2 q){\n" +
    " if(uFace==1){ float e1 = sdTri(q, vec2(-.52,.2), vec2(-.17,.12), vec2(-.35,.54));\n" +
    "  float e2 = sdTri(q, vec2(.52,.2), vec2(.17,.12), vec2(.35,.54));\n" +
    "  float n = sdTri(q, vec2(0.,.1), vec2(-.1,-.07), vec2(.1,-.07));\n" +
    "  return min(min(e1,e2),min(n,sdMouth(q))); }\n" +
    " float e1 = length(q-vec2(-.3,.2))-.13, e2 = length(q-vec2(.3,.2))-.13;\n" +
    " float sm = max(length(q-vec2(0.,-.02))-.5, -(length(q-vec2(0.,.15))-.47));\n" +
    " return min(min(e1,e2),sm); }\n" +
    "void main(){\n" +
    " vec3 N = normalize(vN); if(!gl_FrontFacing) N = -N;\n" +
    " vec3 V = normalize(-vV);\n" +
    " vec3 base = vC*uTint; vec3 emis = uEmis; float alpha = uAlpha, specK = uSpec, mIn = 0.;\n" +
    " if(uFuzz>0.){ float f = vn(vO*28.)*.6+vn(vO*70.)*.4; base *= 1.-uFuzz*.45+uFuzz*.9*f; }\n" +
    " if(uMat==1){\n" +
    "  base *= .88+.24*vn(vO*vec3(16.,3.5,16.));\n" +
    "  if(vO.z>.25){ vec2 q = vO.xy; float d = faceSDF(q); float aa = max(fwidth(q.x),1e-3)*1.2;\n" +
    "   vec3 dir = normalize(vO-uCamO); vec2 off = dir.xy/max(abs(dir.z),.3)*.1; float d2 = faceSDF(q+off);\n" +
    "   mIn = 1.-smoothstep(-aa,aa,d); float wall = smoothstep(-aa,aa,d2);\n" +
    "   float edge = 1.-smoothstep(0.,.035,max(d,0.)); base = mix(base, vec3(1.,.76,.38), edge*(1.-mIn)*.85);\n" +
    "   vec3 glow = mix(vec3(1.,.4,.03), vec3(1.,.9,.38), smoothstep(0.,-.2,d))*(.82+.3*uFlick);\n" +
    "   vec3 wallC = vec3(.95,.36,.05)*(.55+.25*uFlick);\n" +
    "   base = mix(base, vec3(.55,.18,.02), mIn*wall); emis = uEmis + mIn*mix(glow, wallC, wall); specK *= 1.-mIn; }\n" +
    " }\n" +
    " if(uMat==3 && vO.z>.05){ float y = vO.y; float w = .09+.4*pow(abs(y)/.62,1.4); float m = (1.-smoothstep(w-.04,w+.02,abs(vO.x)))*(1.-smoothstep(.6,.68,abs(y)));\n" +
    "  base = mix(base, vec3(1.,.42,.06), m); emis += m*vec3(.25,.07,0.); }\n" +
    " vec3 L1 = normalize(vec3(-.5,.8,.72)), L2 = normalize(vec3(.8,-.25,.45)), H = normalize(L1+V);\n" +
    " float d1 = clamp((dot(N,L1)+uWrap)/(1.+uWrap),0.,1.), d2 = clamp((dot(N,L2)+uWrap)/(1.+uWrap),0.,1.);\n" +
    " vec3 amb = mix(vec3(.2,.16,.3), vec3(.7,.66,.8), N.y*.5+.5)*mix(1.05,.78,uDark);\n" +
    " vec3 col = base*(amb*.62 + vec3(1.,.95,.88)*d1*.95 + vec3(.9,.6,.4)*d2*.32);\n" +
    " float nv = max(dot(N,V),0.), fr = pow(1.-nv,3.);\n" +
    " col += vec3(1.,.97,.9)*pow(max(dot(N,H),0.),uShin)*specK;\n" +
    " col += uRim*fr*uRimK;\n" +
    " if(uMat==2){ alpha = uAlpha*mix(1.,.55,pow(1.-nv,2.2)); col += vec3(.7,.6,1.)*fr*.35; col = mix(col, col*vec3(.86,.84,1.), .35*(1.-d1)); }\n" +
    " if(uMat==4){ float tr = max(dot(-N,L1),0.); col += vec3(.9,.45,.9)*tr*.22*(1.-uDark*.3); }\n" +
    " col += emis;\n" +
    " oC = vec4(col*alpha, alpha);\n" +
    "}";

  function makeRenderer(canvas) {
    var gl = canvas.getContext("webgl2", { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: "low-power" });
    if (!gl) return null;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error("Halloween shader:", gl.getShaderInfoLog(s)); return null; } return s; }
    var vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return null;
    var prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error("Halloween link:", gl.getProgramInfoLog(prog)); return null; }
    gl.useProgram(prog);
    var U = {};
    ["uMV", "uP", "uNM", "uMat", "uFace", "uTint", "uRim", "uEmis", "uCamO", "uAlpha", "uSpec", "uShin", "uRimK", "uWrap", "uFuzz", "uTime", "uFlick", "uDark"].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    var R = { gl: gl, canvas: canvas, view: m4(), w: 1, h: 1, dpr: 1, time: 0, flick: 0, dark: 0 };
    R.resize = function (w, h, dpr) { R.w = w; R.h = h; R.dpr = dpr; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); };
    R.upload = function (m, dyn) {
      var vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, m.v, dyn ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24);
      var ib = null;
      if (m.i) { ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.i, gl.STATIC_DRAW); }
      gl.bindVertexArray(null);
      return { vao: vao, vb: vb, n: m.i ? m.i.length : 0, indexed: !!m.i, src: m };
    };
    R.refresh = function (h, count) { gl.bindBuffer(gl.ARRAY_BUFFER, h.vb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, h.src.v, 0, count ? count * 9 : h.src.v.length); if (count) h.n = count; };
    R.begin = function (cx, cy, size, half, focus) {
      var d = R.dpr, vx = Math.round((cx - size / 2) * d), vy = Math.round(canvas.height - (cy + size / 2) * d), vw = Math.round(size * d);
      gl.enable(gl.SCISSOR_TEST); gl.viewport(vx, vy, vw, vw); gl.scissor(vx, vy, vw, vw); gl.clear(gl.DEPTH_BUFFER_BIT);
      var dist = 12, fov = 2 * Math.atan(half / dist);
      R.view = T(-focus[0], -focus[1], -focus[2] - dist);
      gl.uniformMatrix4fv(U.uP, false, new Float32Array(persp(fov, 4, 40)));
    };
    R.clear = function () { gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, canvas.width, canvas.height); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); };
    R.draw = function (h, M, o) {
      o = o || {};
      var mv = mul(R.view, M);
      gl.uniformMatrix4fv(U.uMV, false, new Float32Array(mv)); gl.uniformMatrix3fv(U.uNM, false, nmat(mv));
      var t = o.tint || [1, 1, 1], r = o.rim || [0.6, 0.45, 1], e = o.emis || [0, 0, 0];
      gl.uniform1i(U.uMat, o.mat || 0); gl.uniform1i(U.uFace, o.face || 0);
      gl.uniform3f(U.uTint, t[0], t[1], t[2]); gl.uniform3f(U.uRim, r[0], r[1], r[2]); gl.uniform3f(U.uEmis, e[0], e[1], e[2]);
      var co = o.camO || [0, 0, 5]; gl.uniform3f(U.uCamO, co[0], co[1], co[2]);
      gl.uniform1f(U.uAlpha, o.alpha === undefined ? 1 : o.alpha); gl.uniform1f(U.uSpec, o.spec === undefined ? 0.25 : o.spec); gl.uniform1f(U.uShin, o.shin || 30);
      gl.uniform1f(U.uRimK, o.rimK === undefined ? 0.5 : o.rimK); gl.uniform1f(U.uWrap, o.wrap === undefined ? 0.2 : o.wrap); gl.uniform1f(U.uFuzz, o.fuzz || 0);
      gl.uniform1f(U.uTime, R.time); gl.uniform1f(U.uFlick, R.flick); gl.uniform1f(U.uDark, R.dark);
      if (o.twoSided) gl.disable(gl.CULL_FACE); else gl.enable(gl.CULL_FACE);
      gl.bindVertexArray(h.vao);
      if (h.indexed) gl.drawElements(gl.TRIANGLES, h.n, gl.UNSIGNED_SHORT, 0); else gl.drawArrays(gl.TRIANGLES, 0, h.n);
      gl.bindVertexArray(null);
    };
    // cámara en el espacio del objeto (para la profundidad de los cortes de la calabaza)
    R.camObj = function (M) { var iv = inv4(mul(R.view, M)); return [iv[12], iv[13], iv[14]]; };
    return R;
  }

  // ---- mallas compartidas (se crean una vez por montaje) ----
  var G = {};
  function crearMallas(R) {
    G.sphere = R.upload(mkSphere(28, 18));
    G.cyl = R.upload(mkCyl(0.72, 12));
    G.cone = R.upload(mkCyl(0.02, 12));
    G.pumpkin = R.upload(mkPumpkin());
    G.stem = R.upload(mkStem());
    G.vine = R.upload(mkVine());
    // cabeza de la araña: ojos, colmillos y pedipalpos fundidos en una malla
    var sph = mkSphere(14, 10), cone = mkCyl(0.02, 8), parts = [];
    function onT(x, y) { return [x, y, 0.46 * Math.sqrt(Math.max(0.04, 1 - Math.pow(x / 0.46, 2) - Math.pow(y / 0.4, 2)))]; }
    [[-0.14, 0.08, 0.085], [0.14, 0.08, 0.085], [-0.28, 0.12, 0.055], [0.28, 0.12, 0.055], [-0.07, 0.2, 0.05], [0.07, 0.2, 0.05], [-0.22, -0.02, 0.04], [0.22, -0.02, 0.04]]
      .forEach(function (e) { var p = onT(e[0], e[1]); parts.push({ mesh: sph, M: chain(T(p[0], p[1], p[2] - 0.01), Sc(e[2])), col: [1, 0.22, 0.12] }); });
    [-1, 1].forEach(function (s) {
      var p = onT(s * 0.1, -0.22);
      parts.push({ mesh: cone, M: chain(T(p[0], p[1], p[2] - 0.01), RX(PI), Sc(0.06, 0.26, 0.06)), col: [0.98, 0.9, 0.8] });
      var q = onT(s * 0.2, -0.28);
      parts.push({ mesh: sph, M: chain(T(q[0], q[1], q[2] - 0.02), Sc(0.075, 0.1, 0.075)), col: [0.35, 0.2, 0.5] });
    });
    G.spHead = R.upload(bake(parts));
    // cuerpo del murciélago: cuerpo + cabeza + orejas + hocico + colmillos
    var bp = [];
    bp.push({ mesh: sph, M: chain(T(0, 0, 0), Sc(0.34, 0.5, 0.3)), col: [0.55, 0.45, 0.7] });
    bp.push({ mesh: sph, M: chain(T(0, 0.58, 0.1), Sc(0.27)), col: [0.62, 0.5, 0.78] });
    bp.push({ mesh: sph, M: chain(T(0, 0.5, 0.33), Sc(0.14, 0.11, 0.12)), col: [0.3, 0.22, 0.4] });
    [-1, 1].forEach(function (s) {
      bp.push({ mesh: cone, M: chain(T(s * 0.15, 0.78, 0.08), RZ(-s * 0.18), Sc(0.12, 0.34, 0.06)), col: [0.55, 0.45, 0.7] });
      bp.push({ mesh: cone, M: chain(T(s * 0.15, 0.8, 0.12), RZ(-s * 0.18), Sc(0.075, 0.24, 0.03)), col: [0.95, 0.55, 0.75] });
      bp.push({ mesh: cone, M: chain(T(s * 0.05, 0.4, 0.44), RX(PI), Sc(0.022, 0.1, 0.022)), col: [1, 1, 0.95] });
      bp.push({ mesh: cone, M: chain(T(s * 0.12, -0.45, 0.02), RX(PI * 0.9), Sc(0.04, 0.16, 0.04)), col: [0.4, 0.3, 0.5] });
    });
    G.batBody = R.upload(bake(bp));
    var eyes = [];
    [-1, 1].forEach(function (s) { eyes.push({ mesh: sph, M: chain(T(s * 0.1, 0.61, 0.33), Sc(0.045)), col: [1, 0.55, 0.1] }); });
    G.batEyes = R.upload(bake(eyes));
    G.ghost = R.upload(mkGhost(), true);
    G.ghostSrc = G.ghost.src;
  }

  // ======================================================================
  //  Seguimiento del ratón (SOLO calabazas)
  // ======================================================================
  function makeAim(el) {
    var c = { x: 0, y: 0, t: -9 }, yaw = 0, pitch = 0;
    return {
      get: function (t, dt) {
        if (t - c.t > 0.08) { var r = el.getBoundingClientRect(); c.x = r.left + r.width / 2; c.y = r.top + r.height / 2; c.t = t; }
        var yt = 0, pt = 0;
        if (ptr.mx !== null) {
          yt = clamp(Math.atan2(ptr.mx - c.x, 330) / RAD, -62, 62);
          pt = clamp(Math.atan2(ptr.my - c.y, 360) / RAD * 0.85, -34, 34);
        }
        var k = 1 - Math.exp(-dt * 11);
        yaw += (yt - yaw) * k; pitch += (pt - pitch) * k;
        return { yaw: yaw, pitch: pitch, w: followW(t) };
      }
    };
  }

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
  var DEFS = '<svg class="hw-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>' +
    '<radialGradient id="hwDew" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#bfe3ff" stop-opacity=".35"/></radialGradient></defs></svg>';

  // ======================================================================
  //  CALABAZA 3D: cuerpo lobulado con volumen, tallo, zarcillo y rostro tallado con luz de vela
  // ======================================================================
  function buildPumpkin(kind, cls, W, ph0) {
    var id = ph0 || (++uidP), ph = id * 1.7;
    var el = D("hw-pumpkin " + cls); el.style.width = W + "px"; el.style.height = (W * 0.96) + "px";
    D("pk-glow", el); D("pk-floor", el); D("pk-shadow", el);
    var aim = makeAim(el), st = { nextHop: 2 + id, hopT: -1 }, yaw = 14, pitch = -4, fl = 0;
    var info = { yaw: 0, pitch: 0, kind: kind };
    dbg.pumpkins.push(info);
    function pose(t, dt, estatica) {
      var a = aim.get(t, dt), wf = a.w;
      var ryI = Math.sin(t * 0.8 + ph) * 12, rxI = -5 + Math.sin(t * 0.6 + ph) * 3;
      yaw = estatica ? 14 : lerp(ryI, a.yaw, wf); pitch = estatica ? -4 : lerp(rxI, a.pitch, wf);
      var br = Math.sin(t * 2 + ph) * 0.012, sx = 1 - br, sy = 1 + br, y = 0;
      if (!estatica) {
        if (st.hopT < 0 && t > st.nextHop) st.hopT = 0;
        if (st.hopT >= 0) {
          st.hopT += dt; var h = st.hopT;
          if (h < 0.22) { var p0 = easeIO(h / 0.22); sx = 1 + 0.1 * p0; sy = 1 - 0.12 * p0; }
          else if (h < 0.72) { var q = (h - 0.22) / 0.5; y = 0.55 * 4 * q * (1 - q); sy = 1 + 0.08 * Math.sin(PI * q); sx = 1 - 0.04 * Math.sin(PI * q); }
          else if (h < 0.9) { var p1 = (h - 0.72) / 0.18; sx = 1 + 0.12 * Math.sin(PI * p1); sy = 1 - 0.14 * Math.sin(PI * p1); }
          else if (h < 1.3) { var p2 = (h - 0.9) / 0.4; sy = 1 + 0.05 * Math.exp(-5 * p2) * Math.sin(14 * p2); sx = 1 - 0.03 * Math.exp(-5 * p2) * Math.sin(14 * p2); }
          else { st.hopT = -1; st.nextHop = t + 4 + Math.random() * 5; }
        }
      }
      info.yaw = yaw; info.pitch = pitch; info.follow = wf;
      return { sx: sx, sy: sy, y: y };
    }
    var cur = { sx: 1, sy: 1, y: 0 }, glowEls = [el.children[0], el.children[1], el.children[2]], sombra = el.children[2];
    return {
      el: el, kind: "pumpkin",
      update: function (t, dt) {
        cur = pose(t, dt, false);
        var n = 0.5 + 0.25 * Math.sin(t * 13) + 0.15 * Math.sin(t * 7.3 + 1) + 0.1 * Math.sin(t * 19.1); fl = n;
        glowEls[0].style.opacity = (0.55 + 0.45 * n).toFixed(2); glowEls[1].style.opacity = (0.5 + 0.5 * n).toFixed(2);
        sombra.style.transform = "scaleX(" + (1 - 0.3 * clamp(cur.y / 0.55, 0, 1)).toFixed(2) + ")";
      },
      still: function () { cur = pose(0, 0.016, true); },
      draw: function (R, lay) {
        var r = el.getBoundingClientRect(); if (r.width < 2) return;
        var cx = r.left + r.width / 2 - lay.left, cy = r.top + r.height / 2 - lay.top;
        if (cx < -140 || cx > lay.width + 140 || cy < -140 || cy > lay.height + 140) return;
        var size = r.width * 1.7, half = 1.7;
        R.begin(cx, cy - r.width * 0.05, size, half, [0, 0.25, 0]);
        R.flick = fl;
        var base = chain(T(0, cur.y - 0.8, 0), Sc(cur.sx, cur.sy, cur.sx), T(0, 0.8, 0), RX(pitch * RAD), RY(yaw * RAD));
        var cam = R.camObj(base), dk = esOscuro();
        R.draw(G.pumpkin, base, { mat: 1, face: kind, camO: cam, spec: 0.5, shin: 38, rim: [1, 0.5, 0.15], rimK: dk ? 0.6 : 0.35, wrap: 0.35, emis: [0, 0, 0] });
        var sw = Math.sin(performance.now() / 1000 * 1.7 + ph) * 0.05;
        R.draw(G.stem, chain(base, T(0.04, 0.55, 0), RZ(sw), T(-0.04, -0.55, 0)), { spec: 0.15, shin: 14, rim: [0.8, 0.6, 0.3], rimK: 0.25 });
        R.draw(G.vine, chain(base, T(0.16, 0.7, 0), RZ(sw * 1.6), T(-0.16, -0.7, 0)), { spec: 0.5, shin: 36, rim: [0.6, 1, 0.5], rimK: 0.3 });
      }
    };
  }
  var uidP = 0;

  // ======================================================================
  //  FANTASMA 3D (cuerpo translúcido con volumen, dobladillo ondulante; animación propia, no sigue al ratón)
  // ======================================================================
  function buildGhost(cls, W) {
    var el = D("hw-ghost" + (cls ? " " + cls : "")); if (W) { el.style.width = W + "px"; el.style.height = (W * 1.3) + "px"; }
    var aura = D("gh-aura", el); D("gh-shadow", el);
    var mesh = { v: new Float32Array(G.ghostSrc.v.length), i: G.ghostSrc.i, flip: G.ghostSrc.flip };
    mesh.v.set(G.ghostSrc.v);
    var info = { yaw: 0, follow: 0 }; dbg.ghosts.push(info);
    var st = { nextBoo: 4 + Math.random() * 3, boo: -1, nextBlink: 2, blinkT: -1 }, P = { t: 0, ox: 0, oy: 0, lean: 0, yaw: 0, sc: 1, armUp: 0, mo: 0, eyeS: 1, bs: 1, gx: 0, gy: 0 };
    var ph = Math.random() * 6;
    function update(t, dt, estatica) {
      P.t = t;
      P.ox = estatica ? 0 : 0.05 * Math.sin(t * 0.7 + ph); P.oy = estatica ? 0 : 0.1 * Math.sin(t * 1.2 + ph);
      P.lean = estatica ? 0 : Math.cos(t * 0.7 + ph) * 5;
      P.yaw = estatica ? 10 : Math.sin(t * 0.55 + ph) * 28 + Math.sin(t * 0.23) * 10;      // gira sola, sin mirar al ratón
      P.sc = 1; P.armUp = 0; P.mo = 0; P.eyeS = 1; P.bs = 1;
      info.yaw = P.yaw; info.follow = 0;
      if (estatica) return;
      if (st.boo < 0 && t > st.nextBoo) st.boo = 0;
      if (st.boo >= 0) {
        st.boo += dt; var b = st.boo / 1.2;
        if (b >= 1) { st.boo = -1; st.nextBoo = t + 7 + Math.random() * 5; }
        else { var e = Math.sin(PI * b); P.sc = 1 + 0.14 * e; P.armUp = e; P.mo = e; P.eyeS = 1 + 0.25 * e; }
      }
      if (st.blinkT < 0 && t > st.nextBlink) st.blinkT = 0;
      if (st.blinkT >= 0) { st.blinkT += dt; var bb = st.blinkT / 0.2; if (bb >= 1) { st.blinkT = -1; st.nextBlink = t + 2 + Math.random() * 3; } else P.bs = Math.max(0.08, Math.abs(2 * bb - 1)); }
      P.gx = Math.sin(t * 0.6 + ph) * 0.05; P.gy = Math.sin(t * 0.9 + ph * 2) * 0.03;
      aura.style.opacity = (0.5 + 0.25 * Math.sin(t * 2) + 0.4 * P.mo).toFixed(2);
    }
    function draw(R, lay) {
      var r = el.getBoundingClientRect(); if (r.width < 2) return;
      var cx = r.left + r.width / 2 - lay.left, cy = r.top + r.height / 2 - lay.top;
      if (cx < -160 || cx > lay.width + 160 || cy < -160 || cy > lay.height + 160) return;
      var ppu = r.width / 1.9, size = ppu * 4.2, half = 2.1;
      R.begin(cx, cy, size, half, [0, 0.35, 0]);
      updateGhost(mesh, P.t); G.ghost.src = mesh; R.refresh(G.ghost);
      var base = chain(T(P.ox, P.oy, 0), RZ(P.lean * RAD), RY(P.yaw * RAD), Sc(P.sc), RX(-0.06));
      var fade = parseFloat(el.style.opacity); if (isNaN(fade)) fade = 1;
      var o = { mat: 2, alpha: 0.95 * fade, tint: [0.97, 0.96, 1], spec: 0.55, shin: 24, rim: [0.7, 0.6, 1], rimK: 0.6, wrap: 0.5 };
      // brazos (detrás del cuerpo en la capa de profundidad)
      var wv = Math.sin(P.t * 2.1);
      [-1, 1].forEach(function (s) {
        var ang = (s * (26 + 12 * wv * s) + s * 82 * P.armUp);
        var arm = chain(base, T(s * 0.9, 0.1, 0.16), RZ(-s * (0.55 + 0.25 * wv * s) - s * 1.2 * P.armUp), T(0, -0.3, 0), Sc(0.17, 0.4, 0.17));
        R.draw(G.sphere, arm, o);
      });
      R.draw(G.ghost, base, o);
      // rostro: ojos brillantes, boca y mejillas, sobre la superficie
      var dark = [0.1, 0.07, 0.17], eye = Sc(0.1 * P.eyeS, 0.16 * P.eyeS * P.bs, 0.06);
      [-1, 1].forEach(function (s) {
        var ex = s * 0.3 + P.gx, ey = 0.62 + P.gy, ez = Math.sqrt(Math.max(0.05, 0.82 * 0.82 - ex * ex)) - 0.02;
        R.draw(G.sphere, chain(base, T(ex, ey, ez), RY(s * Math.asin(clamp(ex / 0.82, -1, 1))), eye), { tint: dark, spec: 0.9, shin: 60, rim: [0.5, 0.4, 1], rimK: 0.2 });
        R.draw(G.sphere, chain(base, T(s * 0.3 + P.gx - 0.025, ey + 0.05, ez + 0.035), Sc(0.022)), { tint: [1, 1, 1], emis: [0.9, 0.9, 1], spec: 0 });
        R.draw(G.sphere, chain(base, T(s * 0.5, 0.36, 0.62), RY(s * 0.6), Sc(0.13, 0.08, 0.04)), { tint: [1, 0.55, 0.72], alpha: 0.7, spec: 0, rimK: 0 });
      });
      R.draw(G.sphere, chain(base, T(0, 0.17, 0.82), Sc(0.1 + 0.07 * P.mo, 0.13 + 0.06 * Math.sin(P.t * 3) * 0.3 + 0.1 * P.mo, 0.05)), { tint: dark, spec: 0.6, shin: 40, rimK: 0.1 });
    }
    return { el: el, update: function (t, dt) { update(t, dt, false); }, still: function () { update(0, 0.016, true); }, draw: draw };
  }

  // fantasma errante: cruza el borde de la pantalla despacio, también al bajar la página
  function buildWanderGhost(layer, layerW, layerH) {
    var g = buildGhost("wander", 66);
    layer.appendChild(g.el);
    var rnd = seeded(77), st = { wait: 9, flying: false, u: 0, T: 26, dir: 1, y0: 120, A: 40 };
    return {
      el: g.el, kind: "ghost",
      draw: function (R, lay) { if (g.el.style.visibility === "hidden") return; g.draw(R, lay); },
      update: function (t, dt) {
        g.update(t, dt);
        if (!st.flying) { st.wait -= dt; g.el.style.visibility = "hidden"; if (st.wait <= 0) { st.flying = true; st.u = 0; st.dir = -st.dir; st.T = 22 + rnd() * 10; st.y0 = 90 + rnd() * Math.max(40, layerH - 260); st.A = 25 + rnd() * 40; } return; }
        st.u += dt / st.T;
        if (st.u >= 1) { st.flying = false; st.wait = 14 + rnd() * 14; return; }
        g.el.style.visibility = "visible";
        var x = st.dir > 0 ? -90 + st.u * (layerW + 180) : layerW + 30 - st.u * (layerW + 180);
        var y = st.y0 + st.A * Math.sin(st.u * 9);
        g.el.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)";
        g.el.style.opacity = (0.55 + 0.35 * Math.sin(PI * st.u)).toFixed(2);
      }
    };
  }

  // ======================================================================
  //  ARAÑA 3D: cuerpo con abdomen marcado, cefalotórax con ojos y colmillos, 8 patas de 3 segmentos con cinemática en 3D
  // ======================================================================
  var L1 = 0.95, L2 = 1.05, L3 = 0.62;
  var HIPS = [[0.3, -1.3, 0.36], [0.33, -1.4, 0.3], [0.33, -1.5, 0.2], [0.3, -1.6, 0.08]];
  var ZT = [40, 14, -16, -40];                              // inclinación de cada pata hacia / lejos del espectador (grados)
  function buildSpider(layer, size, px, maxLen, animated) {
    var host = D("hw-spider", layer); host.style.left = size + "px";
    var thr = S("svg", { class: "sp-thr", width: 2, height: 2 }, host);
    var knot = S("g", {}, thr);
    S("circle", { cx: 0, cy: 0, r: 2.6, class: "hw-knot" }, knot);
    S("path", { d: "M0 0 L-14 0 M0 0 L-9 7 M0 0 L9 6", class: "hw-web-main", fill: "none" }, knot);
    var tg = S("g", {}, thr);
    var thread = S("line", { x1: 0, y1: 0, x2: 0, y2: 30, class: "hw-thread" }, tg);
    var legs = [];
    [1, -1].forEach(function (side) { for (var i = 0; i < 4; i++) legs.push({ i: i, side: side, a1: 30, v1: 0, a2: 40, v2: 0, P: null }); });
    var W = { h: 1, d: 0, c: 0 }, ts = { h: 1, d: 0, c: 0 };
    var st = { name: "rest", t: 0, len: 28, lenV: 0, pendAmp: 3, tgtLen: 28, phase: 0, mv: 0, pend: 0, yaw: 0, pitch: 0 };
    var DUR = { rest: 1.6, down: 4.2, hang: 3.8, up: 4.8 }, minLen = 28, STEPS = 6;
    function dropProfile(p) { if (p < 0.42) return 0.45 * easeIO(p / 0.42); if (p < 0.52) return 0.45; return 0.45 + 0.55 * easeIO((p - 0.52) / 0.48); }
    function stairs(p) { var s = p * STEPS, k = Math.floor(s), f = s - k; return clamp((k + easeIO(clamp(f * 1.5, 0, 1))) / STEPS, 0, 1); }
    function poseTargets(i, side, t) {
      var ph = (i % 2 ? PI : 0) + (side < 0 ? PI : 0);
      var h1 = [8, 32, 58, 80][i] + 4 * Math.sin(t * 1.6 + i);
      var h2 = [60, 52, 42, 32][i] + 6 * Math.sin(t * 1.9 + i * 0.7);
      var amp = 4 + 10 * st.mv;
      var d1 = [-48, -14, 22, 52][i] + amp * Math.sin(t * 6 + ph);
      var d2 = 52 + amp * 1.4 * Math.sin(t * 6 + ph + 1);
      var cph = st.phase + (side < 0 ? PI : 0), c1, c2;
      if (i === 0) { c1 = -92 + 30 * Math.sin(cph); c2 = 46 - 32 * Math.sin(cph); }
      else if (i === 1) { c1 = -46 + 12 * Math.sin(cph + 1.6); c2 = 44; }
      else { c1 = [0, 28, 48][i - 1] + 6 * Math.sin(t * 2 + i); c2 = 50; }
      return [h1 * W.h + d1 * W.d + c1 * W.c, h2 * W.h + d2 * W.d + c2 * W.c];
    }
    function solveLegs() {
      legs.forEach(function (L) {
        var s = L.side, hp = HIPS[L.i], hip = [s * hp[0], hp[1], hp[2]], ca = -s * ZT[L.i] * RAD, cc = Math.cos(ca), sn = Math.sin(ca);
        var A1 = L.a1 * RAD, A2 = A1 + L.a2 * RAD, A3 = A2 + (L.a2 * 0.45 + 12) * RAD;
        function dir(A) { var dx = s * Math.cos(A), dy = -Math.sin(A); return [dx * cc, dy, -dx * sn]; }
        var d1 = dir(A1), d2 = dir(A2), d3 = dir(A3);
        var p1 = [hip[0] + d1[0] * L1, hip[1] + d1[1] * L1, hip[2] + d1[2] * L1];
        var p2 = [p1[0] + d2[0] * L2, p1[1] + d2[1] * L2, p1[2] + d2[2] * L2];
        var p3 = [p2[0] + d3[0] * L3, p2[1] + d3[1] * L3, p2[2] + d3[2] * L3];
        L.P = [hip, p1, p2, p3];
      });
    }
    function setState(name) {
      st.name = name; st.t = 0;
      if (name === "rest") ts = { h: 1, d: 0, c: 0 };
      if (name === "down") ts = { h: 0, d: 1, c: 0 };
      if (name === "hang") { ts = { h: 1, d: 0, c: 0 }; st.pendAmp = 10; }
      if (name === "up") ts = { h: 0, d: 0, c: 1 };
      dbg.spider.state = name;
    }
    dbg.spider = { state: "rest", len: st.len, maxLen: maxLen, yaw: 0, mouseDriven: false };
    var ppu = px, sizeGL = ppu * 7.6, half = 3.8, FOC = [0, -1.5, 0];

    function drawBody(R, lay, attach) {
      R.begin(attach[0], attach[1] + 1.5 * ppu, sizeGL, half, FOC);
      var dk = esOscuro(), body = dk ? [0.62, 0.42, 0.9] : [0.4, 0.26, 0.6], leg = dk ? [0.5, 0.36, 0.78] : [0.3, 0.2, 0.46], rim = dk ? [0.75, 0.55, 1] : [0.55, 0.4, 0.9];
      var M0 = chain(RZ(-st.pend * RAD), RY(st.yaw * RAD), RX(st.pitch * RAD));
      // patas: segmentos como cilindros ahusados + articulaciones esféricas
      legs.forEach(function (L) {
        var P = L.P, k;
        for (k = 0; k < 3; k++) {
          var r = [0.085, 0.065, 0.045][k];
          R.draw(G.cyl, chain(M0, seg(P[k], P[k + 1], r)), { tint: leg, spec: 0.35, shin: 28, rim: rim, rimK: 0.55, fuzz: 0.25 });
          if (k < 2) R.draw(G.sphere, chain(M0, T(P[k + 1][0], P[k + 1][1], P[k + 1][2]), Sc(r * 1.25)), { tint: leg, spec: 0.35, shin: 28, rim: rim, rimK: 0.5 });
        }
        R.draw(G.cone, chain(M0, seg(P[3], vmix(P[3], [P[3][0] + (P[3][0] - P[2][0]) * 0.5, P[3][1] + (P[3][1] - P[2][1]) * 0.5, P[3][2] + (P[3][2] - P[2][2]) * 0.5], 1), 0.04)), { tint: [0.12, 0.08, 0.2], spec: 0.2 });
      });
      // abdomen (con marca naranja), cefalotórax y detalles de la cara
      var o = { tint: body, spec: 0.55, shin: 34, rim: rim, rimK: 0.5, fuzz: 0.35, wrap: 0.3 };
      R.draw(G.sphere, chain(M0, T(0, -0.8, -0.14), Sc(0.62, 0.74, 0.6)), { mat: 3, tint: [0.34, 0.2, 0.52], spec: 0.65, shin: 40, rim: rim, rimK: 0.55, fuzz: 0.3, wrap: 0.3 });
      R.draw(G.sphere, chain(M0, T(0, -1.52, 0.32), Sc(0.46, 0.4, 0.46)), o);
      R.draw(G.spHead, chain(M0, T(0, -1.52, 0.32)), { tint: [1, 1, 1], spec: 0.8, shin: 60, rimK: 0.25, emis: [0.12, 0.02, 0.01] });
      // hilo: la punta del abdomen queda unida
      R.draw(G.cone, chain(M0, T(0, -0.02, -0.12), RX(PI), Sc(0.05, 0.12, 0.05)), { tint: [0.9, 0.9, 0.95], spec: 0.1 });
    }

    function update(t, dt) {
      st.t += dt;
      var p = clamp(st.t / DUR[st.name], 0, 1);
      if (st.name === "rest") st.tgtLen = minLen;
      else if (st.name === "down") st.tgtLen = minLen + (maxLen - minLen) * dropProfile(p);
      else if (st.name === "hang") st.tgtLen = maxLen;
      else if (st.name === "up") { st.tgtLen = maxLen - (maxLen - minLen) * stairs(p); st.phase = PI * 2 * (p * STEPS) + PI; }
      if (p >= 1) setState({ rest: "down", down: "hang", hang: "up", up: "rest" }[st.name]);
      var acc = 80 * (st.tgtLen - st.len) - 10 * st.lenV;
      st.lenV += acc * dt; st.len += st.lenV * dt;
      dbg.spider.len = st.len;
      st.mv += (clamp(Math.abs(st.lenV) / 60, 0, 1) - st.mv) * Math.min(1, dt * 8);
      var kw = Math.min(1, dt * 6);
      W.h += (ts.h - W.h) * kw; W.d += (ts.d - W.d) * kw; W.c += (ts.c - W.c) * kw;
      for (var k = 0; k < legs.length; k++) {
        var L = legs[k], tg2 = poseTargets(L.i, L.side, t), step = Math.min(dt, 0.02), n = Math.ceil(dt / step);
        for (var q = 0; q < n; q++) {
          L.v1 += (150 * (tg2[0] - L.a1) - 9 * L.v1) * step; L.a1 += L.v1 * step;
          L.v2 += (150 * (tg2[1] - L.a2) - 9 * L.v2) * step; L.a2 += L.v2 * step;
        }
      }
      var moving = st.name === "down" || st.name === "up";
      st.pendAmp += ((moving ? 2.5 : 5) - st.pendAmp) * Math.min(1, dt * 0.9);
      st.pend = st.pendAmp * Math.sin(t * 1.5);
      // giro natural sobre el hilo (no sigue al ratón): deja ver el cuerpo desde varios lados
      st.yaw = 34 * Math.sin(t * 0.55) + 12 * Math.sin(t * 1.3 + 1) + (st.name === "down" ? 10 * st.mv : 0);
      st.pitch = 6 * Math.sin(t * 0.9) + (st.name === "down" ? -8 * st.mv : st.name === "up" ? 8 * st.mv : 0);
      dbg.spider.yaw = st.yaw;
      thread.setAttribute("y2", st.len.toFixed(1)); tg.setAttribute("transform", "rotate(" + st.pend.toFixed(2) + ")");
      solveLegs();
    }
    function draw(R, lay) {
      var hr = host.getBoundingClientRect();
      var ax = hr.left - lay.left - st.len * Math.sin(st.pend * RAD), ay = st.len * Math.cos(st.pend * RAD);
      drawBody(R, lay, [ax, ay]);
    }
    if (!animated) {
      st.len = 96; legs.forEach(function (L) { var tg2 = poseTargets(L.i, L.side, 0); L.a1 = tg2[0]; L.a2 = tg2[1]; });
      st.yaw = 18; st.pitch = 0; st.pend = 0; thread.setAttribute("y2", "96"); solveLegs();
      return { update: function () {}, draw: draw, still: true };
    }
    return { update: update, draw: draw };
  }

  // ======================================================================
  //  MURCIÉLAGOS 3D: cuerpo con volumen y alas de membrana (brazo + 3 dedos) que baten en 3D
  // ======================================================================
  function buildBat(layer, idx, layerW, layerH) {
    var rnd = seeded(31 + idx * 17);
    var wingBuf = [0, 1].map(function () { var m = { v: new Float32Array(WVERTS * 9), i: null }; m.h = GLR.upload(m, true); m.h.n = WVERTS; return m; });
    var bat = {
      dir: idx % 2 ? -1 : 1, wait: 0.8 + idx * 2.4 + rnd() * 2, flying: false, u: 0, T: 8, x: -999, y: 0,
      y0: 60, A1: 40, f1: 1.4, A2: 8, f2: 3, ph: 0, flap: rnd() * 6, hz: 3.4 + rnd() * 1.2, s: 1, base: 0.8 + rnd() * 0.3, rnd: rnd, yaw: 0, depth: 1, roll: 0
    };
    dbg.bats.push(bat);
    function launch() {
      bat.flying = true; bat.u = 0; bat.dir = -bat.dir; bat.T = 7 + bat.rnd() * 4;
      bat.y0 = 40 + bat.rnd() * Math.max(60, layerH - 170);
      bat.A1 = 25 + bat.rnd() * 55; bat.f1 = 0.8 + bat.rnd() * 1.4; bat.A2 = 4 + bat.rnd() * 8; bat.f2 = 2 + bat.rnd() * 2;
      bat.ph = bat.rnd() * 6.28; bat.s = 0.8 + bat.rnd() * 0.5;
    }
    function update(t, dt) {
      bat.flap += dt * bat.hz * 2 * PI;
      if (!bat.flying) { bat.wait -= dt; if (bat.wait <= 0) launch(); return; }
      bat.u += dt / bat.T;
      if (bat.u >= 1) { bat.flying = false; bat.wait = 1.5 + bat.rnd() * 5; return; }
      var span = layerW + 240, p = bat.u;
      bat.x = bat.dir > 0 ? -120 + p * span : layerW + 120 - p * span;
      var wave = p * bat.f1 * 6.283 + bat.ph, u = Math.sin(bat.flap);
      bat.y = bat.y0 + bat.A1 * Math.sin(wave) + bat.A2 * Math.sin(p * bat.f2 * 6.283 + bat.ph) - 7 * u * bat.s;
      var vy = bat.A1 * Math.cos(wave) * bat.f1 * 6.283 / (bat.T * 40);
      bat.roll = bat.dir * 7 + clamp(vy * 11, -14, 14);
      bat.depth = 1 + 0.25 * Math.sin(wave * 0.7 + 1);
      bat.yaw = bat.dir * (22 + 18 * Math.sin(wave * 0.8)) + 10 * Math.sin(wave);
    }
    function wing(R, base, mirror, bufM, flap) {
      var u = Math.sin(flap), cv = Math.cos(flap);
      var F = 0.2 + 0.75 * u;                                  // elevación del brazo (rad)
      var S_ = [0.22, 0.26, 0], dir0 = [Math.cos(F), Math.sin(F), -0.05];
      var Wp = [S_[0] + dir0[0] * 0.95, S_[1] + dir0[1] * 0.95, S_[2] + dir0[2] * 0.95];
      var ang0 = [-0.1, -0.64, -1.2], lens = [1.9, 1.75, 1.3], Tp = [];
      for (var i = 0; i < 3; i++) {
        var Fe = F * 0.35 + ang0[i] - 0.5 * cv * (0.3 + 0.25 * i);
        var d = [Math.cos(Fe), Math.sin(Fe), -0.12 * i];
        Tp.push([Wp[0] + d[0] * lens[i], Wp[1] + d[1] * lens[i], Wp[2] + d[2] * lens[i]]);
      }
      var H_ = [0.2, -0.5, -0.05];
      var n = wingFill(bufM.v, S_, Wp, Tp, H_, 0.13 + 0.1 * (1 - u), mirror);
      R.refresh(bufM.h, n);
      R.draw(bufM.h, base, { mat: 4, tint: esOscuro() ? [0.4, 0.26, 0.6] : [0.27, 0.16, 0.42], twoSided: true, spec: 0.25, shin: 18, rim: [1, 0.55, 0.25], rimK: 0.5, wrap: 0.45 });
      var sx = mirror ? -1 : 1, bone = { tint: esOscuro() ? [0.3, 0.2, 0.46] : [0.14, 0.09, 0.24], spec: 0.35, shin: 22, rim: [0.8, 0.5, 0.9], rimK: 0.4 };
      function P(p) { return [p[0] * sx, p[1], p[2]]; }
      R.draw(G.cyl, chain(base, seg(P(S_), P(Wp), 0.07)), bone);
      for (var k = 0; k < 3; k++) R.draw(G.cyl, chain(base, seg(P(Wp), P(Tp[k]), 0.04 - 0.005 * k)), bone);
    }
    function draw(R, lay) {
      if (!bat.flying) return;
      if (bat.x < -200 || bat.x > lay.width + 200) return;
      var ppu = 23 * bat.s * bat.base * bat.depth, half = 3.2, size = ppu * half * 2;
      R.begin(bat.x, bat.y, size, half, [0, 0.1, 0]);
      var base = chain(RZ(bat.roll * RAD), RY(bat.yaw * RAD), RX(0.3 + 0.1 * Math.cos(bat.flap)), T(0, 0.14 * Math.sin(bat.flap) - 0.1, 0));
      var dk = esOscuro(), fur = dk ? [0.78, 0.62, 1] : [0.56, 0.4, 0.8];
      R.draw(G.batBody, base, { tint: fur, spec: 0.45, shin: 30, rim: [1, 0.55, 0.25], rimK: 0.55, fuzz: 0.35, wrap: 0.3 });
      R.draw(G.batEyes, base, { spec: 0.9, shin: 60, emis: [0.9, 0.35, 0.05], rimK: 0 });
      wing(R, base, false, wingBuf[0], bat.flap);
      wing(R, base, true, wingBuf[1], bat.flap);
    }
    return { update: update, draw: draw };
  }

  // ======================================================================
  //  Montaje / desmontaje
  // ======================================================================
  var qual = 1, lento = 0, lentoT = 0, layerEl = null, resizeT = 0, lastBig = null, spiderHost = null, webSize = 240, glCanvas = null;
  function navAlto() { var nav = document.querySelector(".topnav"); return nav ? nav.offsetHeight : 0; }
  function alturaCapa() { return Math.max(240, window.innerHeight - navAlto()); }
  function tamCanvas() {
    if (!GLR || !layerEl) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.75) * qual;
    GLR.resize(layerEl.clientWidth || window.innerWidth, layerEl.clientHeight || alturaCapa(), dpr);
  }
  function dibujar() {
    if (!GLR || !layerEl) return;
    GLR.dark = esOscuro() ? 1 : 0; GLR.time = performance.now() / 1000;
    var r = layerEl.getBoundingClientRect(), lay = { left: r.left, top: r.top, width: r.width, height: r.height };
    GLR.clear();
    for (var i = 0; i < objs.length; i++) if (objs[i].draw) objs[i].draw(GLR, lay);
  }
  function montarCapa() {
    var anim = animar(), big = window.innerWidth > 900, size = big ? 240 : 150;
    lastBig = big; webSize = size;
    var layer = D("hw-layer"); layer.setAttribute("aria-hidden", "true");
    var nh = navAlto(), h = alturaCapa(), lw = window.innerWidth;
    layer.style.top = nh + "px";
    layer.appendChild(buildWeb(size, false));
    layer.appendChild(buildWeb(size, true));
    document.body.appendChild(layer);
    layerEl = layer;
    // WebGL2: si no existe, queda solo la decoración plana (telarañas), sin errores
    glCanvas = document.createElement("canvas"); glCanvas.className = "hw-gl";
    GLR = makeRenderer(glCanvas); dbg.gl = !!GLR;
    if (GLR) {
      crearMallas(GLR);
      var sp = buildSpider(layer, size, big ? 30 : 21, Math.min(Math.round(h * 0.42), big ? 230 : 160), anim);
      spiderHost = layer.querySelector(".hw-spider");
      var corner = buildPumpkin(1, "corner", big ? 84 : 62, 9);
      layer.appendChild(corner.el);
      objs.push(sp);
      if (anim) {
        objs.push(corner);
        var nb = big ? 3 : 2;
        for (var i = 0; i < nb; i++) objs.push(buildBat(layer, i, lw, h));
        objs.push(buildWanderGhost(layer, lw, h));
      } else { corner.still(); objs.push(corner); }
      layer.appendChild(glCanvas); tamCanvas();
    }
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
    dbg.bats = []; dbg.pumpkins = []; dbg.ghosts = [];
    montarCapa();
    if (GLR) {
      document.querySelectorAll(".scene").forEach(function (sc) {
        if (sc.querySelector(".hw-deco")) return;
        var deco = D("hw-deco"); deco.setAttribute("aria-hidden", "true");
        var big = buildPumpkin(1, "big", 112, 3), small = buildPumpkin(2, "small", 66, 5), gh = buildGhost("", 80);
        deco.appendChild(big.el); deco.appendChild(small.el); deco.appendChild(gh.el);
        sc.appendChild(deco);
        objs.push(big, small, gh);
        if (!anim) { big.still(); small.still(); gh.still(); }
      });
      tamCanvas();
      if (anim) startLoop(); else dibujar();
    }
    actualizarBoton();
  }
  function desmontar() {
    stopLoop(); dbg.bats = []; dbg.spider = null; dbg.pumpkins = []; dbg.ghosts = []; spiderHost = null;
    root.removeAttribute("data-halloween");
    if (GLR) { var ext = GLR.gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext(); }
    GLR = null; glCanvas = null; G = {};
    document.querySelectorAll(".hw-layer, .hw-deco, .hw-defs-wrap").forEach(function (n) { n.remove(); });
    layerEl = null;
    actualizarBoton();
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    var t = ts / 1000, real = t - lastT || 0.016, dt = Math.min(0.05, real) * (dbg.timeScale || 1);
    lastT = t;
    // calidad adaptable: si el equipo va lento, baja la resolución del canvas 3D (nunca se detiene la animación)
    lento += (real - lento) * 0.08;
    if (t - lentoT > 2 && lento > 0.045 && qual > 0.5) { qual = Math.max(0.5, qual * 0.75); lentoT = t; tamCanvas(); dbg.calidad = qual; }
    for (var i = 0; i < objs.length; i++) if (objs[i].update) objs[i].update(t, dt);
    dibujar();
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
  window.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      if (!layerEl) return;
      var big = window.innerWidth > 900;
      layerEl.style.top = navAlto() + "px";
      if (big !== lastBig) { var anim = animar(); desmontar(); montar(); } else { tamCanvas(); if (!raf) dibujar(); }
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

  // utilidad de prueba: dibuja un cuadro y cuenta píxeles con color (comprueba que el 3D realmente se pinta)
  function contarPixeles() {
    if (!GLR) return 0;
    dibujar();
    var gl = GLR.gl, w = GLR.canvas.width, h = GLR.canvas.height, buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    var n = 0; for (var i = 3; i < buf.length; i += 4) if (buf[i] > 10) n++;
    return n;
  }

  function medir() {
    if (!GLR) return null;
    var t0 = performance.now(), i; for (i = 0; i < 5; i++) for (var k = 0; k < objs.length; k++) if (objs[k].update) objs[k].update(performance.now() / 1000, 0.016);
    var t1 = performance.now(); for (i = 0; i < 5; i++) dibujar(); var t2 = performance.now(); GLR.gl.finish(); var t3 = performance.now();
    return { update: (t1 - t0) / 5, draw: (t2 - t1) / 5, gpu: (t3 - t2) / 5, px: GLR.canvas.width + "x" + GLR.canvas.height };
  }
  function init() { crearBoton(); if (activo()) montar(); else actualizarBoton(); }
  window.PangoaHalloween = { montar: montar, desmontar: desmontar, debug: dbg, contarPixeles: contarPixeles, medir: medir };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
