# 📋 RESUMEN - PROCEDIMIENTOS ALMACENADOS Y UPDATES
## Módulo de Archivo - Sistema de Gestión de Traslados

---

## 🔧 PROCEDIMIENTOS ALMACENADOS (SP)

### 1️⃣ **SP_UbicaTransd()**
**Ubicación:** `obtener_centros_costo()` línea 21 y `obtener_detalle_traslado()` línea 528

**Propósito:** Obtener lista de centros de costo disponibles para traslados

**Parámetros:** Ninguno

**Tabla Temporal Generada:** `UBICA1`
- Campos: `CCOCOD` (código), `CCONOM` (nombre del centro)

**Uso:**
```python
conn.execute(text("EXECUTE PROCEDURE SP_UbicaTransd()"))
result = conn.execute(text("SELECT CCOCOD, CCONOM FROM UBICA1 ORDER BY CCONOM"))
```

**Retorna:** Lista de centros de costo ordenados alfabéticamente

---

### 2️⃣ **SP_TR_CondetHis(historia, ingreso)**
**Ubicación:** `buscar_historia()` línea 60

**Propósito:** Buscar una historia clínica y obtener datos del paciente

**Parámetros:**
- `historia` (INT): Número de historia clínica
- `ingreso` (INT): Número de ingreso (default 1)

**Tabla Temporal Generada:** `CONSUL1`
- Retorna: PACTID, PACIDE, NOMBRE, EPIINAFEN, EPIINAFAL, y posibles errores

**Uso:**
```python
conn.execute(
    text("EXECUTE PROCEDURE SP_TR_CondetHis(:historia, :ingreso)"),
    {'historia': 80321, 'ingreso': 1}
)
result = conn.execute(text("SELECT * FROM CONSUL1"))
```

**Validaciones:**
- Si la historia ya fue trasladada, retorna columna 'ERR' con mensaje de error
- Si no existe, no retorna filas

---

### 3️⃣ **SP_TR_insencd(origen, destino, usuario)**
**Ubicación:** `guardar_traslado()` línea 127

**Propósito:** Crear un encabezado de traslado (TRAENC) y generar consecutivo

**Parámetros:**
- `origen` (VARCHAR): Código del centro de origen
- `destino` (VARCHAR): Código del centro de destino
- `usuario` (VARCHAR): Usuario que crea el traslado (default 'SISTEMA')

**Tabla Temporal Generada:** `CONSEC1`
- Campo: `SECUENCIA` - El consecutivo autogenerado

**Tabla Afectada:** `TRAENC` (encabezado de traslados)
- Inserta: origen, destino, usuario, fecha actual, estado='N'

**Uso:**
```python
conn.execute(
    text("EXECUTE PROCEDURE SP_TR_insencd(:origen, :destino, :usuario)"),
    {'origen': 'CTR001', 'destino': 'CTR002', 'usuario': 'SISTEMA'}
)
result_consec = conn.execute(text("SELECT SECUENCIA FROM CONSEC1"))
consecutivo = result_consec.fetchone()[0]
```

---

### 4️⃣ **SP_TR_insdetd(linea, historia, ingreso, tipoid, id, nombre, fec_ing, fec_egr)**
**Ubicación:** `guardar_traslado()` línea 149

**Propósito:** Insertar líneas de detalle en un traslado

**Parámetros:**
- `linea` (INT): Número de línea secuencial
- `historia` (INT): Número de historia clínica
- `ingreso` (INT): Número de ingreso
- `tipoid` (VARCHAR): Tipo de identificación del paciente
- `id` (VARCHAR): Número de identificación del paciente
- `nombre` (VARCHAR): Nombre completo del paciente
- `fec_ing` (DATE): Fecha de ingreso (puede ser NULL)
- `fec_egr` (DATE): Fecha de egreso (puede ser NULL)

**Tabla Afectada:** `TRADET` (detalle de traslados)
- Inserta con estado='N' (pendiente)

**Uso:**
```python
for historia in historias:
    conn.execute(
        text("""EXECUTE PROCEDURE SP_TR_insdetd(
            :linea, :historia, :ingreso, :tipoid, :id, :nombre, 
            :fec_ing, :fec_egr
        )"""),
        {
            'linea': 1,
            'historia': 80321,
            'ingreso': 1,
            'tipoid': 'CC',
            'id': '1234567890',
            'nombre': 'JUAN PÉREZ GARCÍA',
            'fec_ing': '2025-01-10',
            'fec_egr': None
        }
    )
    linea += 1
```

---

### 5️⃣ **SP_TR_rechaza_det(consecutivo, historia, ingreso)**
**Ubicación:** 
- `rechazar_historia()` línea 298
- `guardar_recepcion()` línea 376

**Propósito:** Marcar un detalle de traslado como rechazado

**Parámetros:**
- `consecutivo` (INT): Consecutivo del traslado
- `historia` (INT): Número de historia
- `ingreso` (INT): Número de ingreso

**Tabla Afectada:** `TRADET`
- Actualiza: TRADESEST = 'R' (rechazado)

**Uso:**
```python
conn.execute(
    text("EXECUTE PROCEDURE SP_TR_rechaza_det(:consecutivo, :historia, :ingreso)"),
    {'consecutivo': 1001, 'historia': 80321, 'ingreso': 1}
)
```

---

### 6️⃣ **SP_TR_BuscaExpHiIng(historia, ingreso)**
**Ubicación:** `buscar_expediente()` línea 593

**Propósito:** Buscar expedientes por historia + ingreso específico

**Parámetros:**
- `historia` (INT): Número de historia clínica
- `ingreso` (INT): Número de ingreso

**Tabla Temporal Generada:** `BUSEXP1`
- Combina datos de TRADET (sistema actual) + TRAHISD (sistema anterior)
- 12 columnas: TRADETCOD, TRADETHIS, TRADETNUM, TRADETTIP, TRADETIDE, TRADETNOM, TRADETFIN, TRADETFEG, TRADETFTR, TRADESEST, TRAENCORI, TRAENCDES

**Uso:**
```python
conn.execute(
    text("EXECUTE PROCEDURE SP_TR_BuscaExpHiIng(:historia, :ingreso)"),
    {'historia': 80321, 'ingreso': 1}
)
result = conn.execute(text("SELECT * FROM BUSEXP1"))
```

---

### 7️⃣ **SP_TR_BuscaExpHi(historia)**
**Ubicación:** `buscar_expediente()` línea 599

**Propósito:** Buscar expedientes por historia (todos los ingresos)

**Parámetros:**
- `historia` (INT): Número de historia clínica

**Tabla Temporal Generada:** `BUSEXP1` (12 columnas, igual a SP_TR_BuscaExpHiIng)

**Uso:**
```python
conn.execute(
    text("EXECUTE PROCEDURE SP_TR_BuscaExpHi(:historia)"),
    {'historia': 80321}
)
result = conn.execute(text("SELECT * FROM BUSEXP1"))
```

---

### 8️⃣ **SP_TR_BuscaExpCed(cedula)**
**Ubicación:** `buscar_expediente()` línea 605

**Propósito:** Buscar expedientes por cédula/identificación del paciente

**Parámetros:**
- `cedula` (VARCHAR): Número de cédula o identificación

**Tabla Temporal Generada:** `BUSEXP1` (12 columnas, igual a anteriores)

**Uso:**
```python
conn.execute(
    text("EXECUTE PROCEDURE SP_TR_BuscaExpCed(:cedula)"),
    {'cedula': '1234567890'}
)
result = conn.execute(text("SELECT * FROM BUSEXP1"))
```

---

## 📝 SENTENCIAS UPDATE

### ✏️ **UPDATE 1: Observación General en TRAENC**
**Ubicación:** `guardar_recepcion()` línea 347

**Propósito:** Guardar observación general cuando se rechaza toda la recepción

**Condición:** `es_rechazo_general == True`

**SQL:**
```sql
UPDATE TRAENC 
SET TRAENCOBS = :observacion
WHERE TRAENCCOD = :consecutivo
```

**Parámetros:**
- `observacion`: Texto de observación (mínimo 10 caracteres)
- `consecutivo`: ID del traslado

---

### ✏️ **UPDATE 2: Observación Individual en TRADET**
**Ubicación:** `guardar_recepcion()` línea 389

**Propósito:** Guardar observación específica por historia rechazada

**Condición:** Historia rechazada (`estado == 'R'`) Y observación proporcionada

**SQL:**
```sql
UPDATE TRADET 
SET TRADETOBS = :observacion
WHERE TRADETCOD = :consecutivo 
  AND TRADETHIS = :historia 
  AND TRADETNUM = :ingreso
```

**Parámetros:**
- `observacion`: Texto de observación individual
- `consecutivo`: ID del traslado
- `historia`: Número de historia
- `ingreso`: Número de ingreso

---

### ✏️ **UPDATE 3: Estado Aceptada en TRADET**
**Ubicación:** `guardar_recepcion()` línea 408

**Propósito:** Marcar una historia como ACEPTADA en recepción

**Condición:** Historia con estado == 'A'

**SQL:**
```sql
UPDATE TRADET 
SET TRADESEST = 'A'
WHERE TRADETCOD = :consecutivo 
  AND TRADETHIS = :historia 
  AND TRADETNUM = :ingreso
```

**Parámetros:**
- `consecutivo`: ID del traslado
- `historia`: Número de historia
- `ingreso`: Número de ingreso

---

### ✏️ **UPDATE 4: Estado del Encabezado (TRAENC)**
**Ubicación:** `guardar_recepcion()` línea 430

**Propósito:** Actualizar estado del encabezado basado en estados de detalles

**Lógica:**
- Si TODOS los detalles son rechazados → `TRAENCEST = 'R'`
- Si hay AL MENOS 1 aceptado → `TRAENCEST = 'A'`

**SQL:**
```sql
UPDATE TRAENC 
SET TRAENCEST = :estado
WHERE TRAENCCOD = :consecutivo
```

**Parámetros:**
- `estado`: 'A' o 'R'
- `consecutivo`: ID del traslado

---

## 📊 TABLAS TEMPORALES UTILIZADAS

| Tabla Temporal | SP Generador | Campos Principales | Uso |
|---|---|---|---|
| **UBICA1** | SP_UbicaTransd | CCOCOD, CCONOM | Centros de costo disponibles |
| **CONSUL1** | SP_TR_CondetHis | PACTID, PACIDE, NOMBRE, EPIINAFEN, EPIINAFAL | Datos de paciente y validación |
| **CONSEC1** | SP_TR_insencd | SECUENCIA | Consecutivo autogenerado |
| **BUSEXP1** | SP_TR_BuscaExpHiIng, SP_TR_BuscaExpHi, SP_TR_BuscaExpCed | 12 columnas de expediente | Búsqueda de expedientes |

---

## 📈 TABLAS PRINCIPALES AFECTADAS

### **TRAENC** (Encabezado de Traslados)
- Campos: TRAENCCOD, TRAENCORI, TRAENCDES, TRAENCFEC, TRAENCOBS, TRAENCEST
- Inserciones: SP_TR_insencd
- Actualizaciones: UPDATE estado, UPDATE observación

### **TRADET** (Detalle de Traslados)
- Campos: TRADETCOD, TRADETHIS, TRADETNUM, TRADETTIP, TRADETIDE, TRADETNOM, TRADETFIN, TRADETFEG, TRADETFTR, TRADESEST, TRADETOBS
- Inserciones: SP_TR_insdetd
- Actualizaciones: UPDATE estado (A/R), UPDATE observación, SP_TR_rechaza_det

### **TRAHISD** (Histórico - Sistema Anterior)
- Lectura solo: Consultas UNION con TRADET en SP_TR_BuscaExp*

---

## 🔐 ESTADOS DOCUMENTADOS

| Estado | Significado | Transiciones Posibles |
|---|---|---|
| **N** | Nuevo/Pendiente (Traslado creado) | → A, R |
| **A** | Aceptado (Recepción completada OK) | Final |
| **R** | Rechazado (Recepción rechazada) | Final |

---

## ⚙️ FLUJO DE PROCESOS

### 1. **Crear Traslado**
```
SP_UbicaTransd() → Cargar centros
SP_TR_CondetHis() → Validar historia
SP_TR_insencd() → Crear encabezado (Estado N)
SP_TR_insdetd() → Agregar detalles (Estado N)
```

### 2. **Buscar Expediente**
```
SP_TR_BuscaExpHiIng() o
SP_TR_BuscaExpHi() o
SP_TR_BuscaExpCed() → BUSEXP1 → Retornar a frontend
```

### 3. **Recibir/Procesar Traslado**
```
Revisar cada historia:
  - Si ACEPTADA → UPDATE TRADET SET TRADESEST='A'
  - Si RECHAZADA → SP_TR_rechaza_det() → UPDATE TRADET observación
UPDATE TRAENC → Calcular estado final (A o R)
```

---

## 🛡️ VALIDACIONES IMPLEMENTADAS

✅ Centro origen y destino requeridos  
✅ Al menos 1 historia en traslado  
✅ Historia no puede estar ya trasladada (SP_TR_CondetHis)  
✅ Observación mínimo 10 caracteres si hay rechazo  
✅ Detalles no rechazados definen estado final  
✅ Encoding UTF-8 para caracteres especiales (Ñ, á, etc)  
✅ Detección de registros históricos (TRAHISD vs TRADET)

---

## 📌 RESUMEN ESTADÍSTICO

- **Procedimientos Almacenados:** 8
- **UPDATE Directos:** 4
- **SELECT SELECT Complejos:** 3
- **Tablas Temporales:** 4
- **Tablas Principales:** 3 (TRAENC, TRADET, TRAHISD)
- **Estados Documentados:** 3 (N, A, R)

