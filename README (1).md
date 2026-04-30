# 🏋️ Gym Check-in — Google Apps Script

Sistema de registro de asistencia al gimnasio para empleados, con GPS, validación por radio y dashboard anual por empleado. Todo corre dentro de Google Sheets + Apps Script. Sin servidores externos.

---

## 📋 Estructura del Spreadsheet

### Hoja: `Empleados`
| Col | Campo | Descripción |
|-----|-------|-------------|
| A | PIN | Fórmula: `="00"&B2` |
| B | ID_Empleado | Tu fórmula existente (ej. de otra hoja) |
| C | Nombre | Tu fórmula existente |
| D | Gym_Lat | Latitud del centro del gym |
| E | Gym_Lng | Longitud del centro del gym |
| F | Radio_m | Radio válido en metros (default 1000) |

### Hoja: `Registros`
Log crudo de cada checada. Nunca se borra.
| Timestamp | PIN | Nombre | Latitud | Longitud | Distancia_m | Estado | Mes_Key |

### Hoja: `Dashboard`
Tabla visual año × empleado. Se actualiza automáticamente.
- Fila = empleado
- Columna = mes (Ene–Dic)
- Celda = número de checadas ese mes
- 🟡 Amarillo = menos de 15 checadas
- 🟢 Verde = 15 o más checadas

---

## 🚀 Instalación paso a paso

### 1. Crear el Spreadsheet
1. Abre [Google Sheets](https://sheets.google.com) y crea un nuevo archivo
2. Nómbralo: `Gym Check-in`
3. Crea tres hojas con exactamente estos nombres:
   - `Empleados`
   - `Registros`
   - `Dashboard`

### 2. Agregar el código
1. En el menú del Sheet: **Extensiones → Apps Script**
2. Borra todo el contenido de `Código.gs`
3. Copia y pega el contenido de `Code.gs` de este repositorio
4. Guarda con `Ctrl+S`

### 3. Setup inicial
1. Recarga el Spreadsheet (F5)
2. Aparecerá el menú **🏋️ Gym Check-in** en la barra superior
3. Haz clic en **Setup inicial (correr 1 vez)**
4. Acepta los permisos que solicita Google
5. Verás el mensaje: ✅ Setup completado

### 4. Llenar la hoja Empleados
1. En la hoja `Empleados`, en B2 pon tu fórmula para traer el ID del empleado
2. En C2 pon tu fórmula para traer el nombre
3. En A2 ya está: `="00"&B2` (genera el PIN automáticamente)
4. En D2 pon la latitud del gym de ese empleado
5. En E2 pon la longitud del gym
6. En F2 pon el radio en metros (1000 = 1 km)
7. Arrastra las fórmulas hacia abajo para todos tus empleados

> **Ejemplo de PIN:** Si el ID del empleado es `1234`, su PIN será `001234`

### 5. Para el test de coordenadas del gym
Antes de poner coordenadas fijas, puedes hacer que los empleados hagan el check-in y revisar la columna `Latitud` y `Longitud` en la hoja `Registros`. Ese valor es exactamente su ubicación real. Úsalos como centro del gym en la hoja `Empleados`.

### 6. Publicar la Web App
1. En Apps Script, clic en **Implementar → Nueva implementación**
2. Tipo: **Aplicación web**
3. Descripción: `v1`
4. Ejecutar como: **Yo (tu cuenta)**
5. Quién puede acceder: **Cualquier persona**
6. Clic en **Implementar**
7. Copia la URL que aparece

### 7. Obtener la URL después
Si necesitas la URL más tarde:
- En el Sheet → menú **🏋️ Gym Check-in** → **Obtener URL de la Web App**

---

## 📱 Cómo usan la app los empleados
1. Abren la URL en su celular (Chrome recomendado)
2. Ingresan su PIN (ej. `001234`)
3. Tocan **📍 Registrar ubicación**
4. Aceptan el permiso de ubicación cuando el navegador lo pide
5. Ven el resultado:
   - ✅ Verde = están dentro del radio del gym
   - ⚠️ Naranja = se registró pero están fuera del radio

> El registro se guarda **siempre**, independientemente de si es válido o no.

---

## 🔧 Configuración avanzada

Todos los parámetros están en el objeto `CONFIG` al inicio del archivo:

```javascript
const CONFIG = {
  SHEET_EMPLEADOS:  "Empleados",   // nombre de la hoja
  SHEET_REGISTROS:  "Registros",
  SHEET_DASHBOARD:  "Dashboard",
  // ...columnas y demás configuración
};
```

Si necesitas cambiar nombres de hojas o columnas, **solo edita CONFIG**, no toques el resto del código.

---

## 📊 Dashboard — cómo leerlo

El dashboard se actualiza en tiempo real cada vez que alguien registra su ubicación.

- Cada fila = un empleado
- Cada columna = un mes del año
- El número en la celda = total de checadas ese mes (válidas + inválidas, todas cuentan)
- **Amarillo** = menos de 15 checadas en el mes
- **Verde** = 15 o más checadas (bono cumplido)

Para ver el detalle de cada checada (distancia exacta, si fue válida, hora), revisar la hoja `Registros`.

---

## 🗂 Estructura del repositorio

```
gym-checkin/
├── Code.gs       ← Todo el código (GS + HTML embebido)
└── README.md     ← Este archivo
```

---

## ❓ FAQ

**¿Puedo tener empleados en diferentes gyms?**
Sí. Cada empleado tiene su propia latitud, longitud y radio en la hoja `Empleados`. Cada quien se valida contra su propio gym.

**¿Qué pasa si el GPS no es exacto?**
Todo se registra con la distancia real calculada. Puedes revisar en `Registros` y decidir si fue un error de GPS.

**¿Puedo cambiar el radio de 1 km?**
Sí. Cambia la columna F en la hoja `Empleados` por empleado, o cambia el valor default en `COL_EMP_RADIO_M`.

**¿El dashboard se resetea solo?**
No, acumula el año completo. Es intencional: sirve como histórico. Enero del año siguiente simplemente se va a la columna `Ene` del año nuevo (la clave es `YYYY-MM` en Registros).

**¿Puedo agregar más empleados después?**
Sí, solo agrega filas en la hoja `Empleados`. No hay límite.
