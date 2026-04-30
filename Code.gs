// ============================================================
//  GYM CHECK-IN SYSTEM — Apps Script
//  Autor: generado con Claude
//  Repositorio: https://github.com/TU_USUARIO/gym-checkin
// ============================================================

// ─────────────────────────────────────────────
//  CONFIGURACIÓN GLOBAL — edita aquí y solo aquí
// ─────────────────────────────────────────────
const CONFIG = {
  // Nombres exactos de las hojas
  SHEET_EMPLEADOS:  "Empleados",
  SHEET_REGISTROS:  "Registros",
  SHEET_DASHBOARD:  "Dashboard",

  // Columnas en hoja Empleados (base 1)
  COL_EMP_PIN:      1,   // A — PIN calculado (="00"&ID)
  COL_EMP_ID:       2,   // B — ID empleado (fórmula externa)
  COL_EMP_NOMBRE:   3,   // C — Nombre (fórmula externa)
  COL_EMP_GYM_LAT:  4,   // D — Latitud centro del gym
  COL_EMP_GYM_LNG:  5,   // E — Longitud centro del gym
  COL_EMP_RADIO_M:  6,   // F — Radio válido en metros (default 1000)

  // Columnas en hoja Registros (base 1)
  COL_REG_TIMESTAMP:  1,  // A
  COL_REG_PIN:        2,  // B
  COL_REG_NOMBRE:     3,  // C
  COL_REG_LAT:        4,  // D
  COL_REG_LNG:        5,  // E
  COL_REG_DIST_M:     6,  // F
  COL_REG_VALIDO:     7,  // G
  COL_REG_MES_KEY:    8,  // H — clave "YYYY-MM" para cruzar con Dashboard

  // Meses del dashboard (etiquetas de columna B en adelante)
  MESES: ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"],

  // Fila de encabezado en Dashboard
  DASHBOARD_HEADER_ROW: 1,
  DASHBOARD_DATA_START:  2,  // primera fila de datos

  // Columna A del Dashboard = Nombre empleado; B=Ene … M=Dic
  DASHBOARD_COL_NOMBRE: 1,
  DASHBOARD_COL_MESES_START: 2,  // columna B = mes[0] = Ene
};

// ─────────────────────────────────────────────
//  PUNTO DE ENTRADA — API REST + fallback HTML
//  ?action=login&pin=XXX
//  ?action=registrar&pin=XXX&lat=YY&lng=ZZ
// ─────────────────────────────────────────────
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  // Sin action: sirve el HTML embebido (acceso directo a la URL de Apps Script)
  if (!action) {
    return HtmlService
      .createHtmlOutput(getHtml())
      .setTitle("Gym Check-in")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // API REST — llamado desde GitHub Pages
  let result;
  try {
    if (action === "login") {
      result = login(e.parameter.pin);
    } else if (action === "registrar") {
      result = registrarUbicacion(
        e.parameter.pin,
        parseFloat(e.parameter.lat),
        parseFloat(e.parameter.lng)
      );
    } else {
      result = { ok: false, msg: "Accion desconocida: " + action };
    }
  } catch (err) {
    result = { ok: false, msg: "Error interno: " + err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────
//  LOGIN — valida PIN y devuelve datos del empleado
// ─────────────────────────────────────────────
function login(pinIngresado) {
  try {
    const hoja    = _getSheet(CONFIG.SHEET_EMPLEADOS);
    const datos   = hoja.getDataRange().getValues();

    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];
      const pin  = String(fila[CONFIG.COL_EMP_PIN - 1]).trim();

      // Comparar normalizando: quitar ceros iniciales para que "001" === "1" no falle
      // pero también aceptar match exacto (por si el usuario escribe "001")
      if (pin === String(pinIngresado).trim() ||
          parseInt(pin, 10) === parseInt(pinIngresado, 10)) {
        return {
          ok:     true,
          pin:    pin,
          nombre: fila[CONFIG.COL_EMP_NOMBRE - 1],
          lat:    fila[CONFIG.COL_EMP_GYM_LAT - 1],
          lng:    fila[CONFIG.COL_EMP_GYM_LNG - 1],
          radio:  fila[CONFIG.COL_EMP_RADIO_M - 1] || 1000,
        };
      }
    }
    return { ok: false, msg: "PIN incorrecto o empleado no encontrado." };
  } catch (err) {
    return { ok: false, msg: "Error interno: " + err.message };
  }
}

// ─────────────────────────────────────────────
//  REGISTRAR UBICACIÓN
// ─────────────────────────────────────────────
function registrarUbicacion(pin, latEmpleado, lngEmpleado) {
  try {
    // 1. Buscar al empleado
    const emp = login(pin);
    if (!emp.ok) return { ok: false, msg: emp.msg };

    // 2. Calcular distancia (Haversine)
    const distancia = _haversine(latEmpleado, lngEmpleado, emp.lat, emp.lng);
    const esValido  = distancia <= emp.radio;

    // 3. Guardar en hoja Registros
    const now      = new Date();
    const mesKey   = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM");
    const mesLabel = Utilities.formatDate(now, Session.getScriptTimeZone(), "MMM").toLowerCase();

    const hojaReg = _getSheet(CONFIG.SHEET_REGISTROS);
    hojaReg.appendRow([
      Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"),
      pin,
      emp.nombre,
      latEmpleado,
      lngEmpleado,
      Math.round(distancia),
      esValido ? "✅ Válido" : "❌ Fuera de rango",
      mesKey,
    ]);

    // 4. Actualizar Dashboard
    _actualizarDashboard(emp.nombre, mesKey);

    return {
      ok:       true,
      valido:   esValido,
      distancia: Math.round(distancia),
      radio:    emp.radio,
      nombre:   emp.nombre,
      msg: esValido
        ? `✅ Registro exitoso. Estás a ${Math.round(distancia)} m del gym.`
        : `⚠️ Registro guardado, pero estás a ${Math.round(distancia)} m (fuera del radio de ${emp.radio} m).`,
    };
  } catch (err) {
    return { ok: false, msg: "Error al registrar: " + err.message };
  }
}

// ─────────────────────────────────────────────
//  DASHBOARD — actualiza conteo por empleado/mes
// ─────────────────────────────────────────────
function _actualizarDashboard(nombreEmpleado, mesKey) {
  const hoja       = _getSheet(CONFIG.SHEET_DASHBOARD);
  const mesIndex   = parseInt(mesKey.split("-")[1], 10) - 1; // 0-based
  const colMes     = CONFIG.DASHBOARD_COL_MESES_START + mesIndex; // columna en sheet

  // Asegurarnos que existen encabezados
  _inicializarDashboard(hoja);

  // Buscar fila del empleado
  const datos = hoja.getDataRange().getValues();
  let filaEmpleado = -1;

  for (let i = CONFIG.DASHBOARD_DATA_START - 1; i < datos.length; i++) {
    if (String(datos[i][0]).trim() === nombreEmpleado.trim()) {
      filaEmpleado = i + 1; // base 1
      break;
    }
  }

  // Si no existe, crear fila nueva
  if (filaEmpleado === -1) {
    const ultimaFila = Math.max(hoja.getLastRow() + 1, CONFIG.DASHBOARD_DATA_START);
    hoja.getRange(ultimaFila, CONFIG.DASHBOARD_COL_NOMBRE).setValue(nombreEmpleado);
    filaEmpleado = ultimaFila;
  }

  // Incrementar conteo del mes
  const celda     = hoja.getRange(filaEmpleado, colMes);
  const valorActual = celda.getValue() || 0;
  celda.setValue(valorActual + 1);

  // Colorear si >= 15 checadas
  if (valorActual + 1 >= 15) {
    celda.setBackground("#b7e1cd"); // verde suave
  } else {
    celda.setBackground("#fff2cc"); // amarillo suave
  }
}

function _inicializarDashboard(hoja) {
  if (hoja.getRange(CONFIG.DASHBOARD_HEADER_ROW, 1).getValue() !== "Empleado") {
    hoja.getRange(CONFIG.DASHBOARD_HEADER_ROW, CONFIG.DASHBOARD_COL_NOMBRE).setValue("Empleado");
    CONFIG.MESES.forEach((mes, i) => {
      hoja.getRange(CONFIG.DASHBOARD_HEADER_ROW, CONFIG.DASHBOARD_COL_MESES_START + i).setValue(mes);
    });
    // Formato encabezado
    hoja.getRange(CONFIG.DASHBOARD_HEADER_ROW, 1, 1, CONFIG.MESES.length + 1)
      .setFontWeight("bold")
      .setBackground("#4a86e8")
      .setFontColor("#ffffff");
  }
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function _getSheet(nombre) {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(nombre);
  if (!hoja) throw new Error(`Hoja "${nombre}" no encontrada. Verifica CONFIG.`);
  return hoja;
}

// Fórmula de Haversine → distancia en metros entre dos coordenadas
function _haversine(lat1, lon1, lat2, lon2) {
  const R    = 6371000; // radio de la Tierra en metros
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLon  = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─────────────────────────────────────────────
//  SETUP INICIAL — corre UNA sola vez manualmente
//  Crea las hojas si no existen y pone encabezados
// ─────────────────────────────────────────────
function setupInicial() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- Hoja Empleados ---
  let hEmp = ss.getSheetByName(CONFIG.SHEET_EMPLEADOS);
  if (!hEmp) {
    hEmp = ss.insertSheet(CONFIG.SHEET_EMPLEADOS);
  }
  if (!hEmp.getRange(1,1).getValue()) {
    hEmp.getRange(1, 1, 1, 6).setValues([[
      "PIN", "ID_Empleado", "Nombre", "Gym_Lat", "Gym_Lng", "Radio_m"
    ]]);
    hEmp.getRange(1, 1, 1, 6).setFontWeight("bold").setBackground("#4a86e8").setFontColor("#fff");
    // Ejemplo de fórmula PIN en A2 (ajusta el rango de tu hoja fuente)
    hEmp.getRange("A2").setFormula('="00"&B2');
    hEmp.getRange("F2").setValue(1000); // radio default
  }

  // --- Hoja Registros ---
  let hReg = ss.getSheetByName(CONFIG.SHEET_REGISTROS);
  if (!hReg) {
    hReg = ss.insertSheet(CONFIG.SHEET_REGISTROS);
  }
  if (!hReg.getRange(1,1).getValue()) {
    hReg.getRange(1, 1, 1, 8).setValues([[
      "Timestamp", "PIN", "Nombre", "Latitud", "Longitud", "Distancia_m", "Estado", "Mes_Key"
    ]]);
    hReg.getRange(1, 1, 1, 8).setFontWeight("bold").setBackground("#4a86e8").setFontColor("#fff");
  }

  // --- Hoja Dashboard ---
  let hDash = ss.getSheetByName(CONFIG.SHEET_DASHBOARD);
  if (!hDash) {
    hDash = ss.insertSheet(CONFIG.SHEET_DASHBOARD);
  }
  _inicializarDashboard(hDash);

  SpreadsheetApp.getUi().alert("✅ Setup completado. Hojas creadas correctamente.");
}

// ─────────────────────────────────────────────
//  MENÚ PERSONALIZADO en el Sheet
// ─────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🏋️ Gym Check-in")
    .addItem("Setup inicial (correr 1 vez)", "setupInicial")
    .addItem("Obtener URL de la Web App", "mostrarUrl")
    .addToUi();
}

function mostrarUrl() {
  const url = ScriptApp.getService().getUrl();
  SpreadsheetApp.getUi().alert("URL de la Web App:\n\n" + url);
}

// ─────────────────────────────────────────────
//  HTML EMBEBIDO — interfaz de la Web App
// ─────────────────────────────────────────────
function getHtml() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<title>Gym Check-in</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0f172a;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .card {
    background: #1e293b;
    border-radius: 20px;
    padding: 36px 28px;
    width: 100%;
    max-width: 380px;
    box-shadow: 0 25px 60px rgba(0,0,0,0.5);
    border: 1px solid #334155;
  }

  .logo {
    text-align: center;
    font-size: 48px;
    margin-bottom: 8px;
  }

  h1 {
    text-align: center;
    color: #f8fafc;
    font-size: 22px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .subtitle {
    text-align: center;
    color: #94a3b8;
    font-size: 13px;
    margin-bottom: 28px;
  }

  label {
    display: block;
    color: #94a3b8;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 8px;
  }

  input[type="text"], input[type="password"] {
    width: 100%;
    padding: 14px 16px;
    background: #0f172a;
    border: 1.5px solid #334155;
    border-radius: 12px;
    color: #f8fafc;
    font-size: 22px;
    letter-spacing: 6px;
    text-align: center;
    outline: none;
    transition: border-color 0.2s;
    margin-bottom: 20px;
  }

  input:focus { border-color: #3b82f6; }

  .btn {
    width: 100%;
    padding: 15px;
    border: none;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary {
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    color: white;
  }

  .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
  .btn-primary:active { transform: translateY(0); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  .btn-success {
    background: linear-gradient(135deg, #22c55e, #16a34a);
    color: white;
    margin-top: 16px;
  }

  .btn-logout {
    background: transparent;
    border: 1.5px solid #475569;
    color: #94a3b8;
    margin-top: 10px;
    font-size: 14px;
    padding: 11px;
  }

  .welcome {
    text-align: center;
    color: #f8fafc;
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 6px;
  }

  .welcome span {
    color: #3b82f6;
  }

  .result-box {
    border-radius: 14px;
    padding: 18px;
    margin-top: 20px;
    text-align: center;
    font-size: 15px;
    font-weight: 600;
    display: none;
  }

  .result-ok    { background: #14532d; color: #86efac; border: 1px solid #22c55e; }
  .result-warn  { background: #431407; color: #fdba74; border: 1px solid #f97316; }
  .result-error { background: #450a0a; color: #fca5a5; border: 1px solid #ef4444; }

  .spinner {
    display: inline-block;
    width: 20px; height: 20px;
    border: 3px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    vertical-align: middle;
    margin-right: 8px;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  #screen-login, #screen-home { display: none; }
  #screen-login.active, #screen-home.active { display: block; }

  .gps-hint {
    color: #64748b;
    font-size: 12px;
    text-align: center;
    margin-top: 12px;
  }
</style>
</head>
<body>
<div class="card">
  <div class="logo">🏋️</div>
  <h1>Gym Check-in</h1>
  <p class="subtitle">Registro de asistencia al gimnasio</p>

  <!-- PANTALLA LOGIN -->
  <div id="screen-login" class="active">
    <label for="pin">Tu PIN de empleado</label>
    <input type="tel" id="pin" maxlength="10" placeholder="Ej: 001 ó 0025" autocomplete="off"
           inputmode="numeric"
           onkeydown="if(event.key==='Enter') hacerLogin()">
    <p class="gps-hint" style="margin-bottom:16px">Tu PIN = <strong style="color:#94a3b8">00</strong> + tu número de empleado</p>
    <button class="btn btn-primary" onclick="hacerLogin()" id="btn-login">Ingresar</button>
    <div id="login-error" class="result-box result-error"></div>
  </div>

  <!-- PANTALLA HOME -->
  <div id="screen-home">
    <p class="welcome">Hola, <span id="nombre-empleado"></span> 👋</p>
    <p class="gps-hint">Presiona el botón para registrar tu ubicación actual</p>
    <button class="btn btn-success" onclick="registrarUbicacion()" id="btn-registrar">
      📍 Registrar ubicación
    </button>
    <button class="btn btn-logout" onclick="logout()">Cerrar sesión</button>
    <div id="resultado" class="result-box"></div>
  </div>
</div>

<script>
  let empleadoActual = null;

  function hacerLogin() {
    const pin = document.getElementById("pin").value.trim();
    const btnLogin = document.getElementById("btn-login");
    const errDiv = document.getElementById("login-error");

    if (!pin) { mostrarResultado(errDiv, "Ingresa tu PIN", "error"); return; }

    btnLogin.disabled = true;
    btnLogin.innerHTML = '<span class="spinner"></span>Verificando...';
    errDiv.style.display = "none";

    google.script.run
      .withSuccessHandler(function(res) {
        btnLogin.disabled = false;
        btnLogin.textContent = "Ingresar";
        if (res.ok) {
          empleadoActual = res;
          document.getElementById("nombre-empleado").textContent = res.nombre;
          document.getElementById("screen-login").classList.remove("active");
          document.getElementById("screen-home").classList.add("active");
          document.getElementById("resultado").style.display = "none";
        } else {
          mostrarResultado(errDiv, res.msg, "error");
        }
      })
      .withFailureHandler(function(err) {
        btnLogin.disabled = false;
        btnLogin.textContent = "Ingresar";
        mostrarResultado(errDiv, "Error de conexión: " + err.message, "error");
      })
      .login(pin);
  }

  function registrarUbicacion() {
    const btn = document.getElementById("btn-registrar");
    const res = document.getElementById("resultado");

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Obteniendo GPS...';
    res.style.display = "none";

    if (!navigator.geolocation) {
      btn.disabled = false;
      btn.textContent = "📍 Registrar ubicación";
      mostrarResultado(res, "Este dispositivo no soporta GPS.", "error");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      function(pos) {
        btn.innerHTML = '<span class="spinner"></span>Guardando...';
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        google.script.run
          .withSuccessHandler(function(r) {
            btn.disabled = false;
            btn.textContent = "📍 Registrar ubicación";
            if (r.ok) {
              mostrarResultado(res, r.msg, r.valido ? "ok" : "warn");
            } else {
              mostrarResultado(res, r.msg, "error");
            }
          })
          .withFailureHandler(function(err) {
            btn.disabled = false;
            btn.textContent = "📍 Registrar ubicación";
            mostrarResultado(res, "Error al guardar: " + err.message, "error");
          })
          .registrarUbicacion(empleadoActual.pin, lat, lng);
      },
      function(err) {
        btn.disabled = false;
        btn.textContent = "📍 Registrar ubicación";
        const msgs = {
          1: "Permiso de ubicación denegado. Actívalo en tu navegador.",
          2: "No se pudo obtener la ubicación. Intenta al aire libre.",
          3: "Tiempo de espera agotado. Intenta de nuevo.",
        };
        mostrarResultado(res, msgs[err.code] || "Error GPS: " + err.message, "error");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function logout() {
    empleadoActual = null;
    document.getElementById("pin").value = "";
    document.getElementById("screen-home").classList.remove("active");
    document.getElementById("screen-login").classList.add("active");
    document.getElementById("login-error").style.display = "none";
  }

  function mostrarResultado(el, msg, tipo) {
    el.className = "result-box";
    if (tipo === "ok")    el.classList.add("result-ok");
    if (tipo === "warn")  el.classList.add("result-warn");
    if (tipo === "error") el.classList.add("result-error");
    el.textContent = msg;
    el.style.display = "block";
  }
</script>
</body>
</html>`;
}
