/* ============================================================
   Barra de navegación superior — compartida por todas las
   pantallas ya logueadas, para poder pasar de un módulo a otro
   sin cerrar sesión y sin volver a index.html.
============================================================ */
const MODULOS_APP = [
  { id: "transcriptor", href: "transcriptor.html", icono: "📥", texto: "Cargar sondaje", roles: ["transcriptor", "admin"] },
  { id: "qa", href: "qa.html", icono: "🔍", texto: "QA", roles: ["qa", "admin"] },
  { id: "exportar", href: "exportar.html", icono: "📤", texto: "Exportar", roles: ["lider", "admin"] },
];

function escapeHtmlNav(v) {
  return String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function renderTopNav(paginaActual) {
  const el = document.getElementById("topnav");
  if (!el) return;

  const usuarioActivo = obtenerUsuarioSesion();
  if (!usuarioActivo) {
    el.hidden = true;
    return;
  }
  el.hidden = false;

  const enlaces = MODULOS_APP.filter((m) => m.roles.includes(usuarioActivo.rol))
    .map((m) => `<a href="${m.href}" class="topnav-link${m.id === paginaActual ? " activo" : ""}">${m.icono} ${m.texto}</a>`)
    .join("");

  el.innerHTML = `
    <a href="index.html" class="topnav-marca">Graiph</a>
    <nav class="topnav-links">${enlaces}</nav>
    <span class="topnav-extra" id="topnav-extra"></span>
    <div class="topnav-usuario">
      <span><span class="topnav-usuario-nombre">${escapeHtmlNav(usuarioActivo.nombre)}</span> <span class="topnav-usuario-rol">${escapeHtmlNav(usuarioActivo.rol)}</span></span>
      <button type="button" id="topnav-btn-cambiar" class="topnav-btn-cambiar">Cambiar de usuario</button>
    </div>
  `;

  document.getElementById("topnav-btn-cambiar").addEventListener("click", () => {
    borrarUsuarioSesion();
    window.location.href = "index.html";
  });
}
