// Efectos visuales compartidos: entradas animadas, escena 3D que sigue el puntero,
// inclinación suave de tarjetas, contadores y confeti. No toca la lógica de la app.
(function () {
  var root = document.documentElement;
  var fxOn = root.getAttribute("data-fx") === "on";
  var finePointer = window.matchMedia && window.matchMedia("(pointer: fine)").matches;

  // ---- Entradas animadas al aparecer en pantalla ----
  function setupReveal() {
    var items = document.querySelectorAll("[data-reveal]");
    if (!fxOn || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.08 });
    items.forEach(function (el) {
      var order = parseInt(el.getAttribute("data-reveal"), 10);
      if (order) el.style.setProperty("--d", (order * 0.08) + "s");
      io.observe(el);
    });
  }

  // ---- La escena 3D gira un poco según la posición del puntero ----
  function setupScenes() {
    var rigs = document.querySelectorAll(".scene-rig");
    if (!fxOn || !finePointer || !rigs.length) return;
    var raf = 0, nx = 0, ny = 0;
    var scenes = document.querySelectorAll(".scene");
    window.addEventListener("pointermove", function (e) {
      nx = (e.clientX / window.innerWidth) * 2 - 1;
      ny = (e.clientY / window.innerHeight) * 2 - 1;
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        rigs.forEach(function (rig) {
          rig.style.setProperty("--rx", (56 - ny * 9) + "deg");
          rig.style.setProperty("--rz", (-34 + nx * 14) + "deg");
        });
        scenes.forEach(function (sc) {
          sc.style.setProperty("--px", nx.toFixed(3));
          sc.style.setProperty("--py", ny.toFixed(3));
        });
      });
    }, { passive: true });
  }

  // ---- Contadores animados ----
  function countTo(el, target) {
    if (!el) return;
    target = Math.max(0, Math.round(Number(target) || 0));
    var from = parseInt(el.textContent, 10) || 0;
    if (!fxOn || from === target) { el.textContent = String(target); return; }
    var start = null, dur = 800;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(from + (target - from) * eased));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ---- La pila de hojas refleja cuántas páginas hay (de 1 a 6 capas) ----
  var lastCount = null;
  function setSheets(count) {
    var rig = document.querySelector(".scene-rig");
    if (!rig) return;
    var under = Math.max(0, Math.min(5, count - 1));
    rig.style.setProperty("--under", under);
    rig.querySelectorAll(".sh:not(.top)").forEach(function (sh, i) {
      var visible = i < under;
      var wasOff = sh.classList.contains("off");
      sh.classList.toggle("off", !visible);
      if (visible && wasOff && lastCount !== null && fxOn) {
        sh.classList.remove("drop"); void sh.offsetWidth; sh.classList.add("drop");
      }
    });
    lastCount = count;
  }

  // ---- La hoja de arriba muestra la caja y la página que se está editando ----
  var lastIdx = null;
  function setLive(caja, index, total) {
    var c = document.getElementById("sceneCaja"), p = document.getElementById("scenePage");
    if (c) c.textContent = caja ? "Caja " + caja : "Caja —";
    document.querySelectorAll("[data-live-caja]").forEach(function (el) { el.textContent = caja ? "CAJA " + caja : "CAJA"; });
    if (p) p.textContent = "Página " + index + " de " + total;
    var top = document.querySelector(".sh.top");
    if (top && fxOn && lastIdx !== null && lastIdx !== index) {
      top.style.setProperty("--flip", index > lastIdx ? "-62deg" : "62deg");
      top.classList.remove("flip"); void top.offsetWidth; top.classList.add("flip");
    }
    lastIdx = index;
  }

  // ---- Sello "LISTO" sobre la hoja al terminar una descarga ----
  function stamp() {
    var el = document.querySelector(".sh.top .stamp");
    if (!el || !fxOn) return;
    el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
  }

  // ---- Confeti ----
  function celebrate() {
    if (!fxOn) return;
    stamp();
    var layer = document.createElement("div");
    layer.className = "confetti-layer";
    layer.setAttribute("aria-hidden", "true");
    var colors = ["#ffb81c", "#3fae5a", "#19b3c4", "#e0703a", "#0071e3"];
    for (var i = 0; i < 28; i++) {
      var p = document.createElement("i");
      p.style.setProperty("--c", colors[i % colors.length]);
      p.style.setProperty("--x", (35 + Math.random() * 30) + "%");
      p.style.setProperty("--y", "70%");
      p.style.setProperty("--dx", ((Math.random() - 0.5) * 520) + "px");
      p.style.setProperty("--dy", (-(160 + Math.random() * 320)) + "px");
      p.style.setProperty("--rot", ((Math.random() - 0.5) * 900) + "deg");
      layer.appendChild(p);
    }
    document.body.appendChild(layer);
    setTimeout(function () { layer.remove(); }, 1600);
  }

  // ---- Botones de portada que activan otros botones ----
  function setupProxies() {
    document.querySelectorAll("[data-proxy-click]").forEach(function (el) {
      el.addEventListener("click", function () {
        var target = document.getElementById(el.getAttribute("data-proxy-click"));
        if (target) target.click();
      });
    });
  }

  window.PangoaFX = { countTo: countTo, setSheets: setSheets, setLive: setLive, stamp: stamp, celebrate: celebrate };
  function init() { setupReveal(); setupScenes(); setupProxies(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
