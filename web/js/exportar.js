const usuario = exigirUsuarioSesion();

const ROLES_CON_ACCESO = ["lider", "admin"];

const elAvisoRol = document.getElementById("aviso-rol");
const elPanel = document.getElementById("panel-exportar");
const elTablaWrap = document.getElementById("tabla-wrap");
const elChkTodos = document.getElementById("chk-todos");
const elContadorSeleccion = document.getElementById("contador-seleccion");
const elBtnExportarXlsx = document.getElementById("btn-exportar-xlsx");
const elBtnExportarCsv = document.getElementById("btn-exportar-csv");

const seleccionados = new Set();
let sondajesConDatos = []; // [{ sondaje, filas, progreso, efectividad }]

function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function formatoFecha(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ============================================================
   CARGA DE SONDAJES + FILAS + CALCULO DE METRICAS
============================================================ */
async function cargarTodo() {
  const { data: sondajes, error: errorSondajes } = await supabaseClient
    .from("sondajes")
    .select("id, codigo, estado, columnas, exportado_en, exportado_por, creado_en, empresas(nombre), usuarios_exportador:exportado_por(nombre)")
    .order("creado_en", { ascending: false });

  if (errorSondajes) {
    elTablaWrap.innerHTML = `<p class="mensaje error">No se pudo cargar la lista de sondajes: ${escapeHtml(errorSondajes.message)}</p>`;
    console.error(errorSondajes);
    return;
  }

  if (!sondajes || sondajes.length === 0) {
    elTablaWrap.innerHTML = '<p class="mensaje">Todavía no hay sondajes cargados.</p>';
    return;
  }

  const { data: filas, error: errorFilas } = await supabaseClient
    .from("filas_transcripcion")
    .select("id, sondaje_id, desde, hasta, datos, datos_original, estado_qa, comentario_qa");

  if (errorFilas) {
    elTablaWrap.innerHTML = `<p class="mensaje error">No se pudieron cargar las filas: ${escapeHtml(errorFilas.message)}</p>`;
    console.error(errorFilas);
    return;
  }

  const filasPorSondaje = {};
  for (const fila of filas || []) {
    (filasPorSondaje[fila.sondaje_id] ||= []).push(fila);
  }

  sondajesConDatos = sondajes.map((sondaje) => {
    const filasSondaje = (filasPorSondaje[sondaje.id] || []).sort((a, b) => a.desde - b.desde);
    return {
      sondaje,
      filas: filasSondaje,
      progreso: calcularProgreso(filasSondaje),
      efectividad: calcularEfectividad(filasSondaje, sondaje.columnas || []),
    };
  });

  renderTabla();
  renderResumenEfectividad();
}

function calcularProgreso(filas) {
  if (filas.length === 0) return { revisadas: 0, total: 0, pct: null };
  const revisadas = filas.filter((f) => f.estado_qa !== "pendiente").length;
  return { revisadas, total: filas.length, pct: Math.round((revisadas / filas.length) * 100) };
}

// % de campos exactos: compara, campo por campo, el valor final (post-QA)
// contra el valor tal como lo entregó el transcriptor (datos_original).
// Sondajes cargados antes de que existiera datos_original no tienen con qué
// comparar — quedan como "N/D" en vez de mostrar un 0% engañoso.
function calcularEfectividad(filas, columnas) {
  let comparados = 0;
  let coincidentes = 0;
  for (const fila of filas) {
    if (!fila.datos_original) continue;
    for (const col of columnas) {
      const actual = String(fila.datos?.[col] ?? "").trim();
      const original = String(fila.datos_original?.[col] ?? "").trim();
      comparados += 1;
      if (actual === original) coincidentes += 1;
    }
  }
  if (comparados === 0) return { comparados: 0, coincidentes: 0, pct: null };
  return { comparados, coincidentes, pct: Math.round((coincidentes / comparados) * 100) };
}

function claseEfectividad(pct) {
  if (pct === null) return "efectividad-nd";
  if (pct >= 90) return "efectividad-alta";
  if (pct >= 75) return "efectividad-media";
  return "efectividad-baja";
}

function renderResumenEfectividad() {
  const totalComparados = sondajesConDatos.reduce((s, x) => s + x.efectividad.comparados, 0);
  const totalCoincidentes = sondajesConDatos.reduce((s, x) => s + x.efectividad.coincidentes, 0);
  const pct = totalComparados > 0 ? Math.round((totalCoincidentes / totalComparados) * 100) : null;

  let resumen = document.getElementById("resumen-efectividad");
  if (!resumen) {
    resumen = document.createElement("p");
    resumen.id = "resumen-efectividad";
    resumen.className = "mensaje";
    elTablaWrap.parentElement.insertBefore(resumen, elTablaWrap);
  }
  resumen.innerHTML =
    pct === null
      ? "Efectividad del modelo: N/D (todavía no hay sondajes con datos suficientes para comparar)."
      : `Efectividad del modelo (post-QA, todos los sondajes): <strong class="${claseEfectividad(pct)}">${pct}%</strong> (${totalCoincidentes} / ${totalComparados} campos sin corregir)`;
}

/* ============================================================
   TABLA
============================================================ */
function renderTabla() {
  let html = '<table class="tabla-exportar"><thead><tr>';
  html += "<th></th><th>Empresa</th><th>Código</th><th>Estado</th><th>Progreso QA</th><th>Efectividad modelo</th><th>Exportado</th>";
  html += "</tr></thead><tbody>";

  sondajesConDatos.forEach(({ sondaje, progreso, efectividad }) => {
    const marcado = seleccionados.has(sondaje.id) ? "checked" : "";
    html += `<tr data-id="${sondaje.id}">`;
    html += `<td><input type="checkbox" class="chk-sondaje" data-id="${sondaje.id}" ${marcado} /></td>`;
    html += `<td>${escapeHtml(sondaje.empresas?.nombre || "?")}</td>`;
    html += `<td>${escapeHtml(sondaje.codigo)}</td>`;
    html += `<td><span class="badge">${escapeHtml(sondaje.estado)}</span></td>`;

    if (progreso.total === 0) {
      html += "<td>—</td>";
    } else {
      html += `<td><div class="barra-progreso-mini"><div class="pista"><div class="relleno" style="width:${progreso.pct}%"></div></div><span>${progreso.revisadas}/${progreso.total}</span></div></td>`;
    }

    html +=
      efectividad.pct === null
        ? '<td><span class="efectividad-valor efectividad-nd">N/D</span></td>'
        : `<td><span class="efectividad-valor ${claseEfectividad(efectividad.pct)}">${efectividad.pct}%</span></td>`;

    if (sondaje.exportado_en) {
      html += `<td class="exportado-info">${escapeHtml(sondaje.usuarios_exportador?.nombre || "?")}<small>${formatoFecha(sondaje.exportado_en)}</small></td>`;
    } else {
      html += '<td class="exportado-nunca">Nunca</td>';
    }

    html += "</tr>";
  });

  html += "</tbody></table>";
  elTablaWrap.innerHTML = html;

  elTablaWrap.querySelectorAll(".chk-sondaje").forEach((chk) => {
    chk.addEventListener("change", () => {
      if (chk.checked) seleccionados.add(chk.dataset.id);
      else seleccionados.delete(chk.dataset.id);
      actualizarBarraAcciones();
    });
  });

  actualizarBarraAcciones();
}

function actualizarBarraAcciones() {
  elContadorSeleccion.textContent = `${seleccionados.size} seleccionados`;
  elBtnExportarXlsx.disabled = seleccionados.size === 0;
  elBtnExportarCsv.disabled = seleccionados.size === 0;
  elChkTodos.checked = seleccionados.size > 0 && seleccionados.size === sondajesConDatos.length;
}

elChkTodos.addEventListener("change", () => {
  seleccionados.clear();
  if (elChkTodos.checked) {
    sondajesConDatos.forEach((x) => seleccionados.add(x.sondaje.id));
  }
  renderTabla();
});

/* ============================================================
   EXPORTAR (un archivo por sondaje)
============================================================ */
function columnasArchivo(sondaje) {
  return ["Desde", "Hasta", ...(sondaje.columnas || [])];
}

function filaAArray(fila, columnas) {
  const arr = [fila.desde, fila.hasta];
  for (const col of columnas.slice(2)) arr.push(fila.datos?.[col] ?? "");
  return arr;
}

function construirLibroXlsx(item) {
  const columnas = columnasArchivo(item.sondaje);
  const aoa = [columnas, ...item.filas.map((f) => filaAArray(f, columnas))];
  const hoja = XLSX.utils.aoa_to_sheet(aoa);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, item.sondaje.codigo.slice(0, 31) || "Sondaje");
  return libro;
}

function escaparCampoCsv(valor) {
  const texto = String(valor ?? "");
  if (/[",\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

function construirCsv(item) {
  const columnas = columnasArchivo(item.sondaje);
  const filas = [columnas, ...item.filas.map((f) => filaAArray(f, columnas))];
  return filas.map((fila) => fila.map(escaparCampoCsv).join(",")).join("\r\n");
}

function descargarBlob(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function marcarExportado(sondajeId) {
  const ahora = new Date().toISOString();
  const { error } = await supabaseClient
    .from("sondajes")
    .update({ exportado_por: usuario.id, exportado_en: ahora })
    .eq("id", sondajeId);
  if (error) {
    console.error(error);
    return;
  }
  const item = sondajesConDatos.find((x) => x.sondaje.id === sondajeId);
  if (item) {
    item.sondaje.exportado_por = usuario.id;
    item.sondaje.exportado_en = ahora;
    item.sondaje.usuarios_exportador = { nombre: usuario.nombre };
  }
}

async function exportarSeleccionados(formato) {
  elBtnExportarXlsx.disabled = true;
  elBtnExportarCsv.disabled = true;

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const items = sondajesConDatos.filter((x) => seleccionados.has(x.sondaje.id));

  for (const item of items) {
    if (formato === "xlsx") {
      const libro = construirLibroXlsx(item);
      const buffer = XLSX.write(libro, { type: "array", bookType: "xlsx" });
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      descargarBlob(blob, `${item.sondaje.codigo}_${stamp}.xlsx`);
      supabaseClient.storage
        .from("sondajes-exportados")
        .upload(`${item.sondaje.id}/${item.sondaje.codigo}_${stamp}.xlsx`, blob, {
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })
        .then(({ error }) => error && console.error(error));
    } else {
      const csv = construirCsv(item);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      descargarBlob(blob, `${item.sondaje.codigo}_${stamp}.csv`);
      supabaseClient.storage
        .from("sondajes-exportados")
        .upload(`${item.sondaje.id}/${item.sondaje.codigo}_${stamp}.csv`, blob, { contentType: "text/csv" })
        .then(({ error }) => error && console.error(error));
    }
    await marcarExportado(item.sondaje.id);
    // pausa breve entre descargas: los navegadores bloquean/preguntan si se
    // disparan muchas descargas de golpe en el mismo tick.
    await new Promise((r) => setTimeout(r, 250));
  }

  renderTabla();
}

elBtnExportarXlsx.addEventListener("click", () => exportarSeleccionados("xlsx"));
elBtnExportarCsv.addEventListener("click", () => exportarSeleccionados("csv"));

/* ============================================================
   INICIALIZACION
============================================================ */
(function inicializar() {
  if (!usuario) return; // exigirUsuarioSesion ya redirigió a index.html

  renderTopNav("exportar");

  if (!ROLES_CON_ACCESO.includes(usuario.rol)) {
    elAvisoRol.hidden = false;
    return;
  }

  elPanel.hidden = false;
  cargarTodo();
})();
