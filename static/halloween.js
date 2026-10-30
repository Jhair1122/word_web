// Decoración de Halloween: telarañas con araña, murciélagos, calabazas y fantasma.
// Es solo visual (aria-hidden, sin clics) y se puede apagar con el botón "Halloween".
// Se activa sola del 24 de octubre al 2 de noviembre; la elección de la persona manda siempre.
(function () {
  var root = document.documentElement;
  var KEY = "pangoa_halloween";
  var NS = "http://www.w3.org/2000/svg";

  function guardado() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function guardar(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function enTemporada() {
    var d = new Date(), m = d.getMonth(), day = d.getDate();
    return (m === 9 && day >= 24) || (m === 10 && day <= 2);
  }
  function activo() { var g = guardado(); return g === null ? enTemporada() : g === "on"; }
  function animar() { return root.getAttribute("data-fx") === "on"; }

  // ---------- Piezas SVG ----------
  var DEFS = '<svg class="hw-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>' +
    '<radialGradient id="hwBody" cx=".35" cy=".28" r=".85"><stop offset="0" stop-color="#ffb84d"/><stop offset=".45" stop-color="#ff7a1a"/><stop offset="1" stop-color="#c2410c"/></radialGradient>' +
    '<radialGradient id="hwLobe" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#ff8f2e"/><stop offset="1" stop-color="#9c3009"/></radialGradient>' +
    '<linearGradient id="hwStem" x1="0" x2="1"><stop offset="0" stop-color="#8a6a36"/><stop offset="1" stop-color="#4a3416"/></linearGradient>' +
    '<radialGradient id="hwFlame" cx=".5" cy=".6" r=".7"><stop offset="0" stop-color="#fff6b0"/><stop offset=".55" stop-color="#ffc21a"/><stop offset="1" stop-color="#ff7a00"/></radialGradient>' +
    '<linearGradient id="hwGhost" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e4dcff"/></linearGradient>' +
    '<filter id="hwBlur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.2"/></filter>' +
    '</defs></svg>';

  function pumpkinSvg(kind) {
    var eyes, mouth;
    if (kind === 2) {
      eyes = '<circle cx="45" cy="56" r="6"/><circle cx="75" cy="56" r="6"/>';
      mouth = '<path d="M38 74 Q60 98 82 74 Q60 84 38 74Z"/>';
    } else {
      eyes = '<path d="M36 60 L52 60 L44 42Z"/><path d="M68 60 L84 60 L76 42Z"/>';
      mouth = '<path d="M60 66 L55 72 L65 72Z"/><path d="M32 76 L43 82 L50 75 L57 84 L63 84 L70 75 L77 82 L88 76 C86 92 73 99 60 99 C47 99 34 92 32 76Z"/>';
    }
    return '<svg viewBox="0 0 120 114" aria-hidden="true" focusable="false">' +
      '<ellipse cx="60" cy="107" rx="42" ry="6" fill="rgb(0 0 0 / .28)"/>' +
      '<ellipse cx="27" cy="68" rx="25" ry="38" fill="url(#hwLobe)"/><ellipse cx="93" cy="68" rx="25" ry="38" fill="url(#hwLobe)"/>' +
      '<ellipse cx="44" cy="68" rx="27" ry="41" fill="url(#hwLobe)"/><ellipse cx="76" cy="68" rx="27" ry="41" fill="url(#hwLobe)"/>' +
      '<ellipse cx="60" cy="68" rx="25" ry="43" fill="url(#hwBody)"/>' +
      '<g fill="none" stroke="rgb(110 35 5 / .38)" stroke-width="1.6" stroke-linecap="round"><path d="M44 30 C34 50 34 86 44 106"/><path d="M76 30 C86 50 86 86 76 106"/><path d="M60 26 C54 50 54 88 60 110"/><path d="M20 42 C12 58 12 80 22 96"/><path d="M100 42 C108 58 108 80 98 96"/></g>' +
      '<ellipse cx="46" cy="44" rx="9" ry="14" fill="#fff" opacity=".2" transform="rotate(-18 46 44)"/>' +
      '<path d="M54 32 C53 20 57 12 65 7 L72 13 C67 17 67 23 69 32Z" fill="url(#hwStem)"/>' +
      '<path d="M70 15 C84 6 94 17 85 23 C80 26 76 22 79 19" fill="none" stroke="#58b04a" stroke-width="2.4" stroke-linecap="round"/>' +
      '<path d="M83 13 C92 4 105 9 102 17 C94 20 86 19 83 13Z" fill="#58b04a"/>' +
      '<g class="hw-glow" fill="#ffb300" filter="url(#hwBlur)">' + eyes + mouth + '</g>' +
      '<g class="hw-flame" fill="url(#hwFlame)">' + eyes + mouth + '</g></svg>';
  }

  function ghostSvg() {
    return '<svg viewBox="0 0 60 78" aria-hidden="true" focusable="false">' +
      '<path d="M6 70 V28 C6 12 18 4 30 4 C42 4 54 12 54 28 V70 L46 62 L38 70 L30 62 L22 70 L14 62Z" fill="url(#hwGhost)" stroke="rgb(120 90 180 / .35)" stroke-width="1.2" stroke-linejoin="round"/>' +
      '<path d="M6 40 C-2 42 -1 52 5 52Z M54 40 C62 42 61 52 55 52Z" fill="url(#hwGhost)" stroke="rgb(120 90 180 / .3)" stroke-width="1"/>' +
      '<ellipse cx="23" cy="30" rx="3.4" ry="5.4" fill="#2a1840"/><ellipse cx="37" cy="30" rx="3.4" ry="5.4" fill="#2a1840"/>' +
      '<ellipse cx="30" cy="43" rx="4" ry="5.4" fill="#2a1840"/>' +
      '<circle cx="16" cy="39" r="3.4" fill="#ff9ec4" opacity=".55"/><circle cx="44" cy="39" r="3.4" fill="#ff9ec4" opacity=".55"/></svg>';
  }

  function batSvg() {
    var wing = '<path d="M35 20 C27 11 14 8 2 12 C8 15 8 21 12 25 C14 21 18 21 20 27 C22 23 26 23 28 29 C30 25 33 25 35 29Z"/>';
    return '<svg viewBox="0 0 80 40" aria-hidden="true" focusable="false">' +
      '<g class="wing">' + wing + '</g>' +
      '<g class="wing" transform="translate(80 0) scale(-1 1)">' + wing + '</g>' +
      '<ellipse cx="40" cy="23" rx="6" ry="9.5"/>' +
      '<circle cx="40" cy="12.5" r="5.6"/><path d="M35 9 L35.5 1.5 L39.2 7Z M45 9 L44.5 1.5 L40.8 7Z"/>' +
      '<circle class="eye" cx="38" cy="12" r="1.1"/><circle class="eye" cx="42" cy="12" r="1.1"/></svg>';
  }

  function spiderSvg() {
    var legs = '';
    [[-1, -14, -22], [-1, -20, -6], [-1, -20, 8], [-1, -14, 22]].forEach(function (l) {
      legs += '<path d="M24 22 C' + (24 + l[1] * .5) + ' ' + (22 + l[2] * .2) + ' ' + (24 + l[1]) + ' ' + (22 + l[2] * .6) + ' ' + (24 + l[1] * 1.3) + ' ' + (22 + l[2] + 6) + '"/>';
      legs += '<path d="M24 22 C' + (24 - l[1] * .5) + ' ' + (22 + l[2] * .2) + ' ' + (24 - l[1]) + ' ' + (22 + l[2] * .6) + ' ' + (24 - l[1] * 1.3) + ' ' + (22 + l[2] + 6) + '"/>';
    });
    return '<svg viewBox="0 0 48 52" aria-hidden="true" focusable="false">' +
      '<g class="legs" fill="none" stroke-linecap="round">' + legs + '</g>' +
      '<ellipse cx="24" cy="30" rx="9.5" ry="11.5" class="body"/><circle cx="24" cy="15" r="6.2" class="body"/>' +
      '<path d="M20 28 L24 36 L28 28 L24 23Z" fill="#ff7a1a" opacity=".85"/>' +
      '<circle cx="21.6" cy="13.8" r="1.5" fill="#ff4d2e"/><circle cx="26.4" cy="13.8" r="1.5" fill="#ff4d2e"/></svg>';
  }

  function webSvg() {
    var R = 215, n = 7, i, j, d = '', ang = [], rings = [38, 78, 118, 158, R - 8];
    for (i = 0; i < n; i++) ang.push((i * Math.PI / 2) / (n - 1));
    ang.forEach(function (a) { d += 'M0 0 L' + (Math.cos(a) * R).toFixed(1) + ' ' + (Math.sin(a) * R).toFixed(1) + ' '; });
    rings.forEach(function (r) {
      for (j = 0; j < n - 1; j++) {
        var a1 = ang[j], a2 = ang[j + 1], am = (a1 + a2) / 2, sag = r * 0.84;
        d += 'M' + (Math.cos(a1) * r).toFixed(1) + ' ' + (Math.sin(a1) * r).toFixed(1) +
          ' Q' + (Math.cos(am) * sag).toFixed(1) + ' ' + (Math.sin(am) * sag).toFixed(1) + ' ' +
          (Math.cos(a2) * r).toFixed(1) + ' ' + (Math.sin(a2) * r).toFixed(1) + ' ';
      }
    });
    return '<svg viewBox="0 0 ' + R + ' ' + R + '" aria-hidden="true" focusable="false"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>' +
      '<g fill="currentColor"><circle cx="40" cy="30" r="1.6"/><circle cx="96" cy="64" r="1.4"/><circle cx="62" cy="118" r="1.5"/></g></svg>';
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e;
  }

  // ---------- Montaje / desmontaje ----------
  function montar() {
    if (document.querySelector(".hw-layer")) return;
    root.setAttribute("data-halloween", "on");
    if (!document.querySelector(".hw-defs")) document.body.appendChild(el("div", "hw-defs-wrap", DEFS));

    var layer = el("div", "hw-layer");
    layer.setAttribute("aria-hidden", "true");
    layer.appendChild(el("div", "hw-web hw-web-l", webSvg()));
    layer.appendChild(el("div", "hw-web hw-web-r", webSvg()));
    if (animar()) {
      layer.appendChild(el("div", "hw-spider", '<i class="thread"></i>' + spiderSvg()));
      [["b1", 46], ["b2", 32], ["b3", 24]].forEach(function (b) {
        var bat = el("div", "hw-bat " + b[0]);
        bat.style.setProperty("--s", b[1] + "px");
        bat.appendChild(el("div", "hw-bat-in", batSvg()));
        layer.appendChild(bat);
      });
    }
    document.body.appendChild(layer);

    document.querySelectorAll(".scene").forEach(function (sc) {
      if (sc.querySelector(".hw-deco")) return;
      var deco = el("div", "hw-deco");
      deco.setAttribute("aria-hidden", "true");
      deco.appendChild(el("div", "hw-pumpkin big", pumpkinSvg(1)));
      deco.appendChild(el("div", "hw-pumpkin small", pumpkinSvg(2)));
      deco.appendChild(el("div", "hw-ghost", ghostSvg()));
      sc.appendChild(deco);
    });
    actualizarBoton();
  }

  function desmontar() {
    root.removeAttribute("data-halloween");
    document.querySelectorAll(".hw-layer, .hw-deco, .hw-defs-wrap").forEach(function (n) { n.remove(); });
    actualizarBoton();
  }

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
  window.PangoaHalloween = { montar: montar, desmontar: desmontar };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
