const usuario = exigirUsuarioSesion();

const elBarraNombre = document.getElementById("barra-nombre");
const elBarraRol = document.getElementById("barra-rol");
const elBtnCambiar = document.getElementById("btn-cambiar");
const elAvisoRol = document.getElementById("aviso-rol");
const elForm = document.getElementById("form-transcriptor");
const elSelectEmpresa = document.getElementById("select-empresa");
const elInputCodigo = document.getElementById("input-codigo");
const elInputPdf = document.getElementById("input-pdf");
const elInputExcel = document.getElementById("input-excel");
const elBtnCargar = document.getElementById("btn-cargar");
const elMensaje = document.getElementById("mensaje");

const ROLES_CON_ACCESO = ["transcriptor", "admin"];

function mostrarMensaje(texto, esError) {
  elMensaje.textContent = texto;
  elMensaje.classList.toggle("error", Boolean(esError));
}

async function cargarEmpresas() {
  const { data, error } = await supabaseClient
    .from("empresas")
    .select("id, nombre")
    .order("nombre");

  if (error) {
    mostrarMensaje("No se pudo cargar la lista de empresas. Revisa la conexión con Supabase.", true);
    console.error(error);
    return;
  }

  if (!data || data.length === 0) {
    mostrarMensaje("No hay empresas cargadas todavía.", true);
    return;
  }

  elSelectEmpresa.innerHTML = '<option value="" disabled selected>Elige una empresa</option>';
  for (const empresa of data) {
    const opcion = document.createElement("option");
    opcion.value = empresa.id;
    opcion.textContent = empresa.nombre;
    elSelectEmpresa.appendChild(opcion);
  }

  elSelectEmpresa.disabled = false;
  elBtnCargar.disabled = false;
}

function leerExcelComoFilas(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error("No se pudo leer el archivo Excel."));
    lector.onload = () => {
      try {
        const datos = new Uint8Array(lector.result);
        const libro = XLSX.read(datos, { type: "array" });
        const hoja = libro.Sheets[libro.SheetNames[0]];
        const filas = XLSX.utils.sheet_to_json(hoja, { defval: null, raw: true });
        resolve(filas);
      } catch (err) {
        reject(err);
      }
    };
    lector.readAsArrayBuffer(archivo);
  });
}

function armarFilasTranscripcion(filasExcel) {
  if (filasExcel.length === 0) {
    return { error: "El Excel no tiene filas de datos." };
  }

  const columnas = Object.keys(filasExcel[0]);
  const columnaDesde = columnas.find((c) => c.trim().toLowerCase() === "desde");
  const columnaHasta = columnas.find((c) => c.trim().toLowerCase() === "hasta");

  if (!columnaDesde || !columnaHasta) {
    return { error: "El Excel debe tener columnas 'Desde' y 'Hasta'." };
  }

  const filasValidas = [];
  const errores = [];

  filasExcel.forEach((fila, indice) => {
    const desdeCrudo = fila[columnaDesde];
    const hastaCrudo = fila[columnaHasta];

    if (desdeCrudo === null && hastaCrudo === null) {
      return; // fila en blanco al final del Excel
    }

    const desde = Number(desdeCrudo);
    const hasta = Number(hastaCrudo);

    if (!Number.isFinite(desde) || !Number.isFinite(hasta)) {
      errores.push(`Fila ${indice + 2}: Desde/Hasta no son números válidos.`);
      return;
    }

    const valores = {};
    for (const columna of columnas) {
      if (columna !== columnaDesde && columna !== columnaHasta) {
        valores[columna] = fila[columna];
      }
    }

    filasValidas.push({ desde, hasta, datos: valores });
  });

  if (errores.length > 0) {
    return { error: errores.join("\n") };
  }

  if (filasValidas.length === 0) {
    return { error: "No se encontraron filas válidas en el Excel." };
  }

  return { filas: filasValidas };
}

async function eliminarSondaje(sondajeId) {
  await supabaseClient.from("sondajes").delete().eq("id", sondajeId);
}

async function eliminarPdfSubido(rutaPdf) {
  await supabaseClient.storage.from("sondajes-pdfs").remove([rutaPdf]);
}

async function manejarEnvio(evento) {
  evento.preventDefault();

  const empresaId = elSelectEmpresa.value;
  const codigo = elInputCodigo.value.trim();
  const archivoPdf = elInputPdf.files[0];
  const archivoExcel = elInputExcel.files[0];

  if (!empresaId || !codigo || !archivoPdf || !archivoExcel) {
    mostrarMensaje("Completa empresa, código, PDF y Excel antes de cargar.", true);
    return;
  }

  elBtnCargar.disabled = true;
  mostrarMensaje("Procesando...", false);

  let filasExcel;
  try {
    filasExcel = await leerExcelComoFilas(archivoExcel);
  } catch (err) {
    mostrarMensaje("No se pudo leer el Excel: " + err.message, true);
    elBtnCargar.disabled = false;
    return;
  }

  const resultado = armarFilasTranscripcion(filasExcel);
  if (resultado.error) {
    mostrarMensaje(resultado.error, true);
    elBtnCargar.disabled = false;
    return;
  }
  const filasValidas = resultado.filas;

  const { data: sondaje, error: errorSondaje } = await supabaseClient
    .from("sondajes")
    .insert({ empresa_id: empresaId, codigo: codigo, creado_por: usuario.id })
    .select()
    .single();

  if (errorSondaje) {
    const mensaje =
      errorSondaje.code === "23505"
        ? "Ya existe un sondaje con ese código para esta empresa."
        : "No se pudo crear el sondaje: " + errorSondaje.message;
    mostrarMensaje(mensaje, true);
    elBtnCargar.disabled = false;
    return;
  }

  const rutaPdf = `${sondaje.id}/original.pdf`;
  const { error: errorSubidaPdf } = await supabaseClient.storage
    .from("sondajes-pdfs")
    .upload(rutaPdf, archivoPdf, { contentType: "application/pdf" });

  if (errorSubidaPdf) {
    await eliminarSondaje(sondaje.id);
    mostrarMensaje("No se pudo subir el PDF: " + errorSubidaPdf.message, true);
    elBtnCargar.disabled = false;
    return;
  }

  const filasParaInsertar = filasValidas.map((fila) => ({
    sondaje_id: sondaje.id,
    desde: fila.desde,
    hasta: fila.hasta,
    datos: fila.datos,
  }));

  const { error: errorFilas } = await supabaseClient
    .from("filas_transcripcion")
    .insert(filasParaInsertar);

  if (errorFilas) {
    await eliminarPdfSubido(rutaPdf);
    await eliminarSondaje(sondaje.id);
    const mensaje =
      errorFilas.code === "23505"
        ? "El Excel tiene filas con el mismo Desde/Hasta repetido."
        : "No se pudieron guardar las filas: " + errorFilas.message;
    mostrarMensaje(mensaje, true);
    elBtnCargar.disabled = false;
    return;
  }

  const { error: errorEstado } = await supabaseClient
    .from("sondajes")
    .update({ pdf_path: rutaPdf, estado: "en_qa" })
    .eq("id", sondaje.id);

  if (errorEstado) {
    mostrarMensaje(
      `Sondaje ${codigo} cargado con ${filasValidas.length} filas, pero no se pudo actualizar su estado final. Avisa a Marcelo.`,
      true
    );
    elBtnCargar.disabled = false;
    return;
  }

  mostrarMensaje(`Sondaje ${codigo} cargado: ${filasValidas.length} filas. Pasó a estado "en_qa".`, false);
  elInputCodigo.value = "";
  elInputPdf.value = "";
  elInputExcel.value = "";
  elBtnCargar.disabled = false;
}

(function inicializar() {
  if (!usuario) {
    return; // exigirUsuarioSesion ya redirigió a index.html
  }

  elBarraNombre.textContent = usuario.nombre;
  elBarraRol.textContent = usuario.rol;

  elBtnCambiar.addEventListener("click", () => {
    borrarUsuarioSesion();
    window.location.href = "index.html";
  });

  if (!ROLES_CON_ACCESO.includes(usuario.rol)) {
    elAvisoRol.hidden = false;
    elForm.hidden = true;
    return;
  }

  elForm.addEventListener("submit", manejarEnvio);
  cargarEmpresas();
})();
