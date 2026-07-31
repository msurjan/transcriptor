const elForm = document.getElementById("form-login");
const elSelect = document.getElementById("select-usuario");
const elBoton = document.getElementById("btn-entrar");
const elMensaje = document.getElementById("mensaje");
const elVistaLogin = document.getElementById("vista-login");
const elVistaSesion = document.getElementById("vista-sesion");
const elSesionNombre = document.getElementById("sesion-nombre");
const elSesionRol = document.getElementById("sesion-rol");
const elBtnCambiar = document.getElementById("btn-cambiar");
const elLinkTranscriptor = document.getElementById("link-transcriptor");

const ROLES_CON_TRANSCRIPTOR = ["transcriptor", "admin"];

function mostrarMensaje(texto, esError) {
  elMensaje.textContent = texto;
  elMensaje.classList.toggle("error", Boolean(esError));
}

function mostrarSesionActiva(usuario) {
  elVistaLogin.hidden = true;
  elVistaSesion.hidden = false;
  elSesionNombre.textContent = usuario.nombre;
  elSesionRol.textContent = usuario.rol;
  elLinkTranscriptor.hidden = !ROLES_CON_TRANSCRIPTOR.includes(usuario.rol);
}

function mostrarFormularioLogin() {
  elVistaLogin.hidden = false;
  elVistaSesion.hidden = true;
}

async function cargarUsuarios() {
  const { data, error } = await supabaseClient
    .from("usuarios")
    .select("id, nombre, rol")
    .eq("activo", true)
    .order("nombre");

  if (error) {
    mostrarMensaje("No se pudo cargar la lista de usuarios. Revisa la conexión con Supabase.", true);
    console.error(error);
    return;
  }

  if (!data || data.length === 0) {
    mostrarMensaje("No hay usuarios activos cargados todavía.", true);
    return;
  }

  elSelect.innerHTML = '<option value="" disabled selected>Elige tu nombre</option>';
  for (const usuario of data) {
    const opcion = document.createElement("option");
    opcion.value = usuario.id;
    opcion.textContent = usuario.nombre;
    opcion.dataset.rol = usuario.rol;
    opcion.dataset.nombre = usuario.nombre;
    elSelect.appendChild(opcion);
  }

  elSelect.disabled = false;
  elBoton.disabled = false;
}

elForm.addEventListener("submit", (evento) => {
  evento.preventDefault();
  const opcionElegida = elSelect.selectedOptions[0];
  if (!opcionElegida || !opcionElegida.value) {
    mostrarMensaje("Elige un nombre de la lista.", true);
    return;
  }

  const usuario = {
    id: opcionElegida.value,
    nombre: opcionElegida.dataset.nombre,
    rol: opcionElegida.dataset.rol,
  };

  guardarUsuarioSesion(usuario);
  mostrarMensaje("", false);
  mostrarSesionActiva(usuario);
});

elBtnCambiar.addEventListener("click", () => {
  borrarUsuarioSesion();
  elSelect.value = "";
  mostrarFormularioLogin();
});

(function inicializar() {
  const usuarioActivo = obtenerUsuarioSesion();
  if (usuarioActivo) {
    mostrarSesionActiva(usuarioActivo);
  }
  cargarUsuarios();
})();
