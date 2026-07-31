pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";

const ROLES_CON_ACCESO_QA = ["qa", "admin"];
const CAMPOS_ESPECIALES = ["desde", "hasta", "comentario_qa"];

const usuario = exigirUsuarioSesion();

const elBarraNombre = document.getElementById("barraNombre");
const elBarraRol = document.getElementById("barraRol");
const elBtnCambiar = document.getElementById("btnCambiar");
const elAvisoRol = document.getElementById("avisoRol");
const elWorkspace = document.getElementById("workspace");
const elBarSub = document.getElementById("barSub");
const elSelectorSondaje = document.getElementById("selectorSondaje");

const elPgPrev = document.getElementById("pgPrev");
const elPgNext = document.getElementById("pgNext");
const elPgLabel = document.getElementById("pgLabel");
const elCalibStatus = document.getElementById("calibStatus");
const elBtnCalib = document.getElementById("btnCalib");
const elCalibHint = document.getElementById("calibHint");
const elCanvasWrap = document.getElementById("canvasWrap");
const elZoomOut = document.getElementById("zoomOut");
const elZoomIn = document.getElementById("zoomIn");
const elZoomLabel = document.getElementById("zoomLabel");

const elProgressWrap = document.getElementById("progressWrap");
const elProgressTxt = document.getElementById("progressTxt");
const elProgressFill = document.getElementById("progressFill");

const elTableScroll = document.getElementById("tableScroll");
const elPanelDetalle = document.getElementById("panelDetalle");
const elGuardadoEstado = document.getElementById("guardadoEstado");

const state = {
  sondaje: null,
  columnas: [], // orden completo: desde, hasta, ...datos, comentario_qa
  columnasCompactas: [], // subset de columnas que se muestra en la tabla
  columnasDetalle: [], // subset (ej. Confianza) que se muestra en el panel aparte
  anchoColumnas: {}, // { [columna]: ancho en px }, "__estado" para la primera columna
  rows: [],
  selectedRow: -1,
  activeFilter: "todas",

  pdfDoc: null,
  currentPage: 1,
  numPages: 0,
  pageCalibration: {},
  calibMode: false,
  calibClickCount: 0,
  calibPending: {},
  renderScale: 1.4,
  zoom: 1,
};

const ANCHO_BASE_PDF = 620; // px, ancho de referencia al 100% de zoom
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_PASO = 0.25;

function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
function escapeAttr(v) {
  return String(v ?? "").replace(/"/g, "&quot;");
}
function etiquetaColumna(col) {
  if (col === "desde") return "Desde";
  if (col === "hasta") return "Hasta";
  if (col === "comentario_qa") return "Comentario QA";
  return col.replace(/_/g, " ");
}
function esColumnaDetalle(col) {
  const norm = col.toLowerCase();
  return norm.includes("confianza") || norm.includes("ambiguedad") || norm.includes("ambigüedad");
}

let guardadoTimeout = null;
function mostrarGuardado() {
  elGuardadoEstado.textContent = "Guardado ✓";
  elGuardadoEstado.classList.remove("error");
  elGuardadoEstado.classList.add("visible");
  clearTimeout(guardadoTimeout);
  guardadoTimeout = setTimeout(() => elGuardadoEstado.classList.remove("visible"), 1500);
}
function mostrarErrorGuardado() {
  elGuardadoEstado.textContent = "Error al guardar";
  elGuardadoEstado.classList.add("visible", "error");
  clearTimeout(guardadoTimeout);
  guardadoTimeout = setTimeout(() => elGuardadoEstado.classList.remove("visible"), 3000);
}

/* ============================================================
   SELECTOR DE SONDAJE
============================================================ */
async function cargarListaSondajes(sondajeIdActual) {
  const { data, error } = await supabaseClient
    .from("sondajes")
    .select("id, codigo, empresas(nombre)")
    .eq("estado", "en_qa")
    .order("creado_en");

  if (error) {
    console.error(error);
    return;
  }

  elSelectorSondaje.innerHTML = '<option value="" disabled selected>Elige un sondaje…</option>';
  for (const sondaje of data || []) {
    const opcion = document.createElement("option");
    opcion.value = sondaje.id;
    opcion.textContent = `${sondaje.empresas?.nombre || "?"} — ${sondaje.codigo}`;
    if (sondaje.id === sondajeIdActual) opcion.selected = true;
    elSelectorSondaje.appendChild(opcion);
  }
  elSelectorSondaje.style.display = "inline-block";
}

elSelectorSondaje.addEventListener("change", () => {
  if (elSelectorSondaje.value) {
    history.pushState(null, "", `?sondaje=${elSelectorSondaje.value}`);
    cargarSondaje(elSelectorSondaje.value);
  }
});

/* ============================================================
   CARGA DEL SONDAJE Y SUS FILAS
============================================================ */
async function cargarSondaje(sondajeId) {
  const { data: sondaje, error: errorSondaje } = await supabaseClient
    .from("sondajes")
    .select("id, codigo, estado, pdf_path, calibracion_pdf, columnas, empresas(nombre)")
    .eq("id", sondajeId)
    .single();

  if (errorSondaje || !sondaje) {
    const detalle = errorSondaje ? errorSondaje.message : "No se encontró ese sondaje.";
    elTableScroll.innerHTML = `<div class="drop-hint">No se pudo cargar el sondaje: ${escapeHtml(detalle)}</div>`;
    elBarSub.textContent = "Error al cargar el sondaje — revisa la consola (F12) o avisa a Marcelo.";
    console.error(errorSondaje);
    return;
  }

  state.sondaje = sondaje;
  state.pageCalibration = sondaje.calibracion_pdf || {};
  elBarSub.textContent = `${sondaje.empresas?.nombre || "?"} — ${sondaje.codigo}`;

  const { data: filas, error: errorFilas } = await supabaseClient
    .from("filas_transcripcion")
    .select("*")
    .eq("sondaje_id", sondajeId)
    .order("desde");

  if (errorFilas) {
    elTableScroll.innerHTML = `<div class="drop-hint">No se pudieron cargar las filas: ${escapeHtml(errorFilas.message)}</div>`;
    console.error(errorFilas);
    return;
  }

  // El orden real de las columnas viene de sondajes.columnas (se guarda al
  // subir el Excel). No se puede confiar en Object.keys(fila.datos): jsonb
  // no garantiza el orden de las claves de un objeto.
  let columnasDatos = Array.isArray(sondaje.columnas) ? sondaje.columnas : [];
  if (columnasDatos.length === 0) {
    // Sondajes cargados antes de que existiera sondajes.columnas: mejor
    // esfuerzo con las claves tal como las devuelve Postgres (puede no
    // coincidir con el Excel original).
    for (const fila of filas) {
      for (const clave of Object.keys(fila.datos || {})) {
        if (!columnasDatos.includes(clave)) columnasDatos.push(clave);
      }
    }
  }
  state.columnas = ["desde", "hasta", ...columnasDatos, "comentario_qa"];
  state.columnasDetalle = columnasDatos.filter(esColumnaDetalle);
  state.columnasCompactas = state.columnas.filter((c) => !state.columnasDetalle.includes(c));
  state.anchoColumnas = {};

  state.rows = filas.map((f) => ({
    id: f.id,
    desde: Number(f.desde),
    hasta: Number(f.hasta),
    datos: f.datos || {},
    estado_qa: f.estado_qa,
    comentario_qa: f.comentario_qa || "",
    revisado_por: f.revisado_por,
    revisado_en: f.revisado_en,
  }));

  state.selectedRow = -1;
  autoajustarTodasLasColumnas();
  renderTable();
  renderPanelDetalle();
  updateProgress();
  cargarPdf();
}

/* ============================================================
   TABLA
============================================================ */
function valorCelda(row, col) {
  if (col === "desde") return row.desde;
  if (col === "hasta") return row.hasta;
  if (col === "comentario_qa") return row.comentario_qa;
  return row.datos[col] ?? "";
}

function anchoColumna(col) {
  if (state.anchoColumnas[col] != null) return state.anchoColumnas[col];
  if (col === "__estado") return 92;
  if (col === "desde" || col === "hasta") return 70;
  if (col === "comentario_qa") return 200;
  return 140;
}

function renderTable() {
  if (!state.rows.length) {
    elTableScroll.innerHTML = '<div class="drop-hint">Este sondaje no tiene filas.</div>';
    return;
  }

  let html = "<table><colgroup>";
  html += `<col data-col="__estado" style="width:${anchoColumna("__estado")}px">`;
  state.columnasCompactas.forEach((col) => (html += `<col data-col="${escapeAttr(col)}" style="width:${anchoColumna(col)}px">`));
  html += "</colgroup><thead><tr>";
  html += `<th data-col="__estado">Estado<span class="col-resize" data-col="__estado"></span></th>`;
  state.columnasCompactas.forEach(
    (col) => (html += `<th data-col="${escapeAttr(col)}">${escapeHtml(etiquetaColumna(col))}<span class="col-resize" data-col="${escapeAttr(col)}"></span></th>`)
  );
  html += "</tr></thead><tbody>";

  state.rows.forEach((row, ri) => {
    const status = row.estado_qa || "pendiente";
    if (state.activeFilter !== "todas" && status !== state.activeFilter) return;
    html += `<tr data-ri="${ri}" class="${ri === state.selectedRow ? "selected " : ""}status-${status}">`;
    html += `<td><div class="status-cell">`;
    ["aprobado", "corregido", "rechazado"].forEach((s) => {
      html += `<button class="status-btn ${status === s ? "on" : ""}" data-s="${s}" data-ri="${ri}" title="${s}">${s[0].toUpperCase()}</button>`;
    });
    html += `</div></td>`;
    state.columnasCompactas.forEach((col) => {
      const valor = valorCelda(row, col);
      if (col === "desde" || col === "hasta") {
        html += `<td class="depth-cell" data-ri="${ri}">${escapeHtml(valor)}</td>`;
      } else {
        html += `<td><input value="${escapeAttr(valor)}" data-ri="${ri}" data-col="${col}"></td>`;
      }
    });
    html += "</tr>";
  });
  html += "</tbody></table>";
  elTableScroll.innerHTML = html;

  elTableScroll.querySelectorAll(".depth-cell").forEach((td) => {
    td.addEventListener("click", () => selectRow(parseInt(td.dataset.ri)));
  });
  elTableScroll.querySelectorAll(".status-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      setStatus(parseInt(btn.dataset.ri), btn.dataset.s);
    });
  });
  elTableScroll.querySelectorAll("tbody input").forEach((inp) => {
    inp.addEventListener("input", () => {
      const ri = parseInt(inp.dataset.ri);
      const col = inp.dataset.col;
      if (col === "comentario_qa") state.rows[ri].comentario_qa = inp.value;
      else state.rows[ri].datos[col] = inp.value;
    });
    inp.addEventListener("blur", () => guardarFila(parseInt(inp.dataset.ri)));
    inp.addEventListener("focus", () => selectRow(parseInt(inp.dataset.ri), false));
  });
  elTableScroll.querySelectorAll(".col-resize").forEach((manija) => {
    manija.addEventListener("mousedown", (e) => iniciarResizeColumna(e, manija.dataset.col));
    manija.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      autoajustarColumna(manija.dataset.col);
    });
  });
}

function medirAnchoTexto(texto, fontCss) {
  const medidor = document.createElement("span");
  medidor.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;left:-9999px;top:0;";
  medidor.style.font = fontCss;
  medidor.textContent = String(texto ?? "");
  document.body.appendChild(medidor);
  const ancho = medidor.getBoundingClientRect().width;
  medidor.remove();
  return ancho;
}

function calcularAnchoAjustado(col) {
  if (col === "__estado") return 92;
  const fontEncabezado = "700 11px 'Hanken Grotesk', sans-serif";
  const fontCelda = "12px 'Hanken Grotesk', sans-serif";
  let maximo = medirAnchoTexto(etiquetaColumna(col), fontEncabezado);
  for (const row of state.rows) {
    const ancho = medirAnchoTexto(valorCelda(row, col), fontCelda);
    if (ancho > maximo) maximo = ancho;
  }
  return Math.max(45, Math.ceil(maximo) + 26);
}

function autoajustarColumna(col) {
  state.anchoColumnas[col] = calcularAnchoAjustado(col);
  renderTable();
}

function autoajustarTodasLasColumnas() {
  state.anchoColumnas["__estado"] = calcularAnchoAjustado("__estado");
  for (const col of state.columnasCompactas) {
    state.anchoColumnas[col] = calcularAnchoAjustado(col);
  }
  ajustarAnchosParaCaberEnContenedor();
}

// Si la suma de anchos "ideales" no entra en el ancho visible de la tabla,
// se achican todas las columnas en la misma proporción para que la tabla
// completa quepa sin scroll horizontal.
function ajustarAnchosParaCaberEnContenedor() {
  const disponible = elTableScroll.clientWidth;
  if (!disponible) return;
  const columnasVisibles = ["__estado", ...state.columnasCompactas];
  const total = columnasVisibles.reduce((suma, col) => suma + (state.anchoColumnas[col] || 0), 0);
  if (total <= disponible || total === 0) return;
  const ANCHO_MINIMO = 45;
  const factor = disponible / total;
  for (const col of columnasVisibles) {
    state.anchoColumnas[col] = Math.max(ANCHO_MINIMO, Math.floor(state.anchoColumnas[col] * factor));
  }
}

function iniciarResizeColumna(evento, col) {
  evento.preventDefault();
  const elCol = elTableScroll.querySelector(`col[data-col="${CSS.escape(col)}"]`);
  if (!elCol) return;
  const anchoInicial = elCol.getBoundingClientRect().width;
  const xInicial = evento.clientX;

  function mover(e) {
    const nuevoAncho = Math.max(45, Math.round(anchoInicial + (e.clientX - xInicial)));
    state.anchoColumnas[col] = nuevoAncho;
    elCol.style.width = `${nuevoAncho}px`;
  }
  function soltar() {
    document.removeEventListener("mousemove", mover);
    document.removeEventListener("mouseup", soltar);
  }
  document.addEventListener("mousemove", mover);
  document.addEventListener("mouseup", soltar);
}

async function guardarFila(ri) {
  const fila = state.rows[ri];
  const { error } = await supabaseClient
    .from("filas_transcripcion")
    .update({ datos: fila.datos, comentario_qa: fila.comentario_qa })
    .eq("id", fila.id);
  if (error) {
    console.error(error);
    mostrarErrorGuardado();
    alert("No se pudo guardar el cambio en esa fila. Revisa tu conexión e inténtalo de nuevo.");
    return;
  }
  mostrarGuardado();
}

async function setStatus(ri, status) {
  const fila = state.rows[ri];
  const nuevoEstado = fila.estado_qa === status ? "pendiente" : status;
  await aplicarEstado(ri, nuevoEstado);
}

async function aplicarEstado(ri, nuevoEstado) {
  const fila = state.rows[ri];
  const cambios = { estado_qa: nuevoEstado };
  cambios.revisado_por = nuevoEstado === "pendiente" ? null : usuario.id;
  cambios.revisado_en = nuevoEstado === "pendiente" ? null : new Date().toISOString();

  fila.estado_qa = cambios.estado_qa;
  fila.revisado_por = cambios.revisado_por;
  fila.revisado_en = cambios.revisado_en;
  renderTable();
  updateProgress();

  const { error } = await supabaseClient.from("filas_transcripcion").update(cambios).eq("id", fila.id);
  if (error) {
    console.error(error);
    mostrarErrorGuardado();
    alert("No se pudo guardar el estado de esa fila. Revisa tu conexión e inténtalo de nuevo.");
    return;
  }
  mostrarGuardado();
  await revisarTransicionAEnValidacion();
}

async function revisarTransicionAEnValidacion() {
  if (state.sondaje.estado !== "en_qa") return;
  const todasRevisadas = state.rows.every((r) => r.estado_qa !== "pendiente");
  if (!todasRevisadas) return;

  const { error } = await supabaseClient
    .from("sondajes")
    .update({ estado: "en_validacion" })
    .eq("id", state.sondaje.id);
  if (!error) {
    state.sondaje.estado = "en_validacion";
    elBarSub.textContent = `${state.sondaje.empresas?.nombre || "?"} — ${state.sondaje.codigo} · ¡Todas las filas revisadas! Pasó a en_validación.`;
  }
}

function updateProgress() {
  const total = state.rows.length;
  const done = state.rows.filter((r) => r.estado_qa && r.estado_qa !== "pendiente").length;
  elProgressWrap.style.display = total ? "flex" : "none";
  elProgressTxt.textContent = `${done} / ${total} revisadas`;
  elProgressFill.style.width = total ? `${((done / total) * 100).toFixed(0)}%` : "0%";
}

document.querySelectorAll(".filter-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    state.activeFilter = chip.dataset.f;
    renderTable();
  });
});

/* ============================================================
   PDF
============================================================ */
async function cargarPdf() {
  if (!state.sondaje.pdf_path) {
    elCanvasWrap.innerHTML = '<div class="empty-hint">Este sondaje no tiene PDF cargado.</div>';
    return;
  }
  const { data } = supabaseClient.storage.from("sondajes-pdfs").getPublicUrl(state.sondaje.pdf_path);
  try {
    state.pdfDoc = await pdfjsLib.getDocument(data.publicUrl).promise;
    state.numPages = state.pdfDoc.numPages;
    state.currentPage = 1;
    renderPdfPage(1);
  } catch (err) {
    console.error(err);
    elCanvasWrap.innerHTML = '<div class="empty-hint">No se pudo cargar el PDF de este sondaje.</div>';
  }
}

elPgPrev.addEventListener("click", () => {
  if (state.currentPage > 1) renderPdfPage(state.currentPage - 1);
});
elPgNext.addEventListener("click", () => {
  if (state.currentPage < state.numPages) renderPdfPage(state.currentPage + 1);
});

async function renderPdfPage(num) {
  if (!state.pdfDoc) return;
  cancelCalibration();
  state.currentPage = num;
  const page = await state.pdfDoc.getPage(num);
  const viewport = page.getViewport({ scale: state.renderScale });

  elCanvasWrap.innerHTML = '<div class="canvas-stack" id="canvasStack"></div>';
  const stack = document.getElementById("canvasStack");

  const pdfCanvas = document.createElement("canvas");
  pdfCanvas.width = viewport.width;
  pdfCanvas.height = viewport.height;
  stack.appendChild(pdfCanvas);

  const overlay = document.createElement("canvas");
  overlay.id = "overlayCanvas";
  overlay.width = viewport.width;
  overlay.height = viewport.height;
  stack.appendChild(overlay);

  aplicarTamanoDisplay();

  await page.render({ canvasContext: pdfCanvas.getContext("2d"), viewport }).promise;
  overlay.addEventListener("click", onOverlayClick);

  elPgLabel.textContent = `Pág. ${num} / ${state.numPages}`;
  updateCalibStatusUI();

  if (state.selectedRow >= 0) drawHighlightForSelected();
}

/* ============================================================
   ZOOM (solo cambia el tamaño en pantalla, no la resolución interna
   del canvas — así la calibración por píxel no se ve afectada)
============================================================ */
function aplicarTamanoDisplay() {
  const pdfCanvas = document.querySelector("#canvasStack canvas:not(#overlayCanvas)");
  const overlay = document.getElementById("overlayCanvas");
  if (!pdfCanvas || !overlay) return;
  const anchoDisplay = ANCHO_BASE_PDF * state.zoom;
  const altoDisplay = (anchoDisplay * pdfCanvas.height) / pdfCanvas.width;
  pdfCanvas.style.width = `${anchoDisplay}px`;
  pdfCanvas.style.height = `${altoDisplay}px`;
  overlay.style.width = pdfCanvas.style.width;
  overlay.style.height = pdfCanvas.style.height;
}

function cambiarZoom(delta) {
  state.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(state.zoom + delta).toFixed(2)));
  elZoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
  aplicarTamanoDisplay();
}

elZoomOut.addEventListener("click", () => cambiarZoom(-ZOOM_PASO));
elZoomIn.addEventListener("click", () => cambiarZoom(ZOOM_PASO));

/* ============================================================
   CALIBRACION (2 clics por página = escala lineal profundidad<->pixel)
============================================================ */
elBtnCalib.addEventListener("click", () => {
  if (state.calibMode) {
    cancelCalibration();
    return;
  }
  state.calibMode = true;
  state.calibClickCount = 0;
  state.calibPending = {};
  elBtnCalib.classList.add("active");
  elCalibHint.textContent = "Clic en un punto de profundidad CONOCIDA (ej. borde superior de la fila 0-1)…";
});

function cancelCalibration() {
  state.calibMode = false;
  elBtnCalib.classList.remove("active");
  elCalibHint.textContent = "";
}

function onOverlayClick(e) {
  const overlay = document.getElementById("overlayCanvas");
  const rect = overlay.getBoundingClientRect();
  const scaleX = overlay.width / rect.width;
  const scaleY = overlay.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  if (!state.calibMode) return;

  const depthStr = prompt(
    state.calibClickCount === 0
      ? "¿Qué profundidad (m) representa este punto?"
      : "¿Y este segundo punto — qué profundidad (m) representa?"
  );
  const depth = parseFloat(depthStr);
  if (depthStr === null || isNaN(depth)) return;

  drawCalibMarker(x, y, state.calibClickCount === 0 ? "1" : "2");

  if (state.calibClickCount === 0) {
    state.calibPending = { yA: y, depthA: depth };
    state.calibClickCount = 1;
    elCalibHint.textContent = "Ahora clic en un SEGUNDO punto de profundidad conocida, bien separado del primero…";
  } else {
    const { yA, depthA } = state.calibPending;
    if (Math.abs(depth - depthA) < 0.01 || Math.abs(y - yA) < 5) {
      alert("Los dos puntos están demasiado cerca — elige puntos bien separados (ej. inicio y fin de la página) para que la calibración sea precisa.");
      cancelCalibration();
      return;
    }
    const yTop = Math.min(yA, y),
      yBottom = Math.max(yA, y);
    const depthTop = yA < y ? depthA : depth;
    const depthBottom = yA < y ? depth : depthA;
    state.pageCalibration[state.currentPage] = { yTop, yBottom, depthTop, depthBottom };
    cancelCalibration();
    updateCalibStatusUI();
    guardarCalibracion();
    if (state.selectedRow >= 0) drawHighlightForSelected();
  }
}

async function guardarCalibracion() {
  const { error } = await supabaseClient
    .from("sondajes")
    .update({ calibracion_pdf: state.pageCalibration })
    .eq("id", state.sondaje.id);
  if (error) {
    console.error(error);
    mostrarErrorGuardado();
    alert("No se pudo guardar la calibración de esta página. Revisa tu conexión e inténtalo de nuevo.");
    return;
  }
  mostrarGuardado();
}

function drawCalibMarker(x, y, label) {
  const overlay = document.getElementById("overlayCanvas");
  const ctx = overlay.getContext("2d");
  ctx.save();
  ctx.fillStyle = "#4BE07D";
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#06170C";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y);
  ctx.restore();
}

function updateCalibStatusUI() {
  const cal = state.pageCalibration[state.currentPage];
  if (cal) {
    elCalibStatus.textContent = `Calibrada (${cal.depthTop.toFixed(1)}–${cal.depthBottom.toFixed(1)} m)`;
    elCalibStatus.className = "calib-status yes";
  } else {
    elCalibStatus.textContent = "Página sin calibrar";
    elCalibStatus.className = "calib-status no";
  }
}

/* ============================================================
   PANEL DE DETALLE (columnas tipo Confianza / Nota de confianza)
============================================================ */
function renderPanelDetalle() {
  if (!state.columnasDetalle.length) {
    elPanelDetalle.hidden = true;
    elPanelDetalle.innerHTML = "";
    return;
  }
  elPanelDetalle.hidden = false;

  if (state.selectedRow < 0) {
    const nombres = state.columnasDetalle.map(etiquetaColumna).join(" / ");
    elPanelDetalle.innerHTML = `<div class="panel-detalle-vacio">Elige una fila para ver ${escapeHtml(nombres)}.</div>`;
    return;
  }

  const riSeleccionada = state.selectedRow;
  const row = state.rows[riSeleccionada];
  let html = "";
  state.columnasDetalle.forEach((col) => {
    html += `<div class="panel-detalle-campo">
      <label>${escapeHtml(etiquetaColumna(col))}</label>
      <textarea data-col="${escapeAttr(col)}">${escapeHtml(row.datos[col] ?? "")}</textarea>
    </div>`;
  });
  elPanelDetalle.innerHTML = html;

  elPanelDetalle.querySelectorAll("textarea").forEach((ta) => {
    ta.addEventListener("input", () => {
      row.datos[ta.dataset.col] = ta.value;
    });
    ta.addEventListener("blur", () => guardarFila(riSeleccionada));
  });
}

/* ============================================================
   SELECCION DE FILA -> BUSCAR PAGINA + DIBUJAR BANDA
============================================================ */
function selectRow(ri, scrollTable = true) {
  state.selectedRow = ri;
  document.querySelectorAll("#tableScroll tbody tr").forEach((tr) => {
    tr.classList.toggle("selected", parseInt(tr.dataset.ri) === ri);
  });
  if (scrollTable) {
    const tr = document.querySelector(`#tableScroll tbody tr[data-ri="${ri}"]`);
    if (tr) tr.scrollIntoView({ block: "nearest" });
  }
  renderPanelDetalle();

  const row = state.rows[ri];
  const from = row.desde;
  const to = row.hasta;
  if (isNaN(from) || isNaN(to) || !state.pdfDoc) return;

  let targetPage = null;
  for (const [pg, cal] of Object.entries(state.pageCalibration)) {
    if (from >= cal.depthTop - 0.5 && to <= cal.depthBottom + 0.5) {
      targetPage = parseInt(pg);
      break;
    }
  }

  if (targetPage === null) {
    elCalibHint.textContent = `Fila ${from}-${to}m: ninguna página calibrada cubre este tramo todavía. Navega a la página correcta y calíbrala.`;
    return;
  }

  if (targetPage !== state.currentPage) {
    renderPdfPage(targetPage).then(() => drawHighlightForSelected());
  } else {
    drawHighlightForSelected();
  }
}

function drawHighlightForSelected() {
  const overlay = document.getElementById("overlayCanvas");
  if (!overlay || state.selectedRow < 0) return;
  const cal = state.pageCalibration[state.currentPage];
  if (!cal) return;

  const row = state.rows[state.selectedRow];
  const from = row.desde;
  const to = row.hasta;
  if (isNaN(from) || isNaN(to)) return;

  const tol = 0.5;
  if (from < cal.depthTop - tol || to > cal.depthBottom + tol) {
    overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);
    return;
  }

  const depthToY = (d) => cal.yTop + ((d - cal.depthTop) / (cal.depthBottom - cal.depthTop)) * (cal.yBottom - cal.yTop);
  const y1 = depthToY(from),
    y2 = depthToY(to);

  const ctx = overlay.getContext("2d");
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  ctx.fillStyle = "rgba(75, 224, 125, 0.28)";
  ctx.fillRect(0, Math.min(y1, y2), overlay.width, Math.max(2, Math.abs(y2 - y1)));
  ctx.strokeStyle = "#4BE07D";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, Math.min(y1, y2), overlay.width, Math.max(2, Math.abs(y2 - y1)));
}

/* ============================================================
   TECLADO: ↑↓ navega, 1/2/3 marca estado, 0 vuelve a pendiente
============================================================ */
document.addEventListener("keydown", (e) => {
  const tag = document.activeElement.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  if (!state.rows.length) return;

  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    let next = state.selectedRow;
    const dir = e.key === "ArrowDown" ? 1 : -1;
    do {
      next += dir;
    } while (
      next >= 0 &&
      next < state.rows.length &&
      state.activeFilter !== "todas" &&
      state.rows[next].estado_qa !== state.activeFilter
    );
    if (next >= 0 && next < state.rows.length) selectRow(next);
  } else if (["1", "2", "3"].includes(e.key)) {
    if (state.selectedRow >= 0) {
      setStatus(state.selectedRow, { 1: "aprobado", 2: "corregido", 3: "rechazado" }[e.key]);
    }
  } else if (e.key === "0") {
    if (state.selectedRow >= 0) aplicarEstado(state.selectedRow, "pendiente");
  }
});

/* ============================================================
   INICIALIZACION
============================================================ */
(function inicializar() {
  if (!usuario) return; // exigirUsuarioSesion ya redirigió a index.html

  elBarraNombre.textContent = usuario.nombre;
  elBarraRol.textContent = usuario.rol;

  elBtnCambiar.addEventListener("click", () => {
    borrarUsuarioSesion();
    window.location.href = "index.html";
  });

  if (!ROLES_CON_ACCESO_QA.includes(usuario.rol)) {
    elAvisoRol.hidden = false;
    return;
  }

  elWorkspace.hidden = false;

  const parametros = new URLSearchParams(window.location.search);
  const sondajeId = parametros.get("sondaje");

  cargarListaSondajes(sondajeId);
  if (sondajeId) cargarSondaje(sondajeId);
})();
