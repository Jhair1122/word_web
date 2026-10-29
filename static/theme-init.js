// Se ejecuta antes de pintar: aplica el tema guardado y decide si se usan animaciones.
(function () {
  var root = document.documentElement;
  try {
    root.setAttribute("data-theme", localStorage.getItem("pangoa_theme") === "dark" ? "dark" : "light");
  } catch (e) {
    root.setAttribute("data-theme", "light");
  }
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.setAttribute("data-fx", reduce ? "off" : "on");
})();
