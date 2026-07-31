const SESSION_KEY = "graiph_usuario";

function guardarUsuarioSesion(usuario) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(usuario));
}

function obtenerUsuarioSesion() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

function borrarUsuarioSesion() {
  sessionStorage.removeItem(SESSION_KEY);
}

function exigirUsuarioSesion() {
  const usuario = obtenerUsuarioSesion();
  if (!usuario) {
    window.location.href = "index.html";
    return null;
  }
  return usuario;
}
