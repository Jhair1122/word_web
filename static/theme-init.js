// Aplica el tema guardado antes de pintar la página (evita el "parpadeo" claro/oscuro).
(function () {
  try {
    var t = localStorage.getItem("pangoa_theme") === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
