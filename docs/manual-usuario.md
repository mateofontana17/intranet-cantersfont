# Fontana - Manual de Usuario

Guia completa para usar el sistema de control de stock de Fontana. Aca vas a encontrar como registrar compras, cargar pedidos, consultar stock y recibir alertas.

---

## 1. Bot de Telegram

El bot de Telegram es la forma mas rapida de interactuar con el sistema. Abrilo en Telegram, manda cualquier mensaje y vas a ver el menu principal:

```
MENU PRINCIPAL
  Registrar compra de insumos
  Registrar pedido nuevo
  Editar ultimo movimiento
  Ver stock actual
  Ver alertas de stock bajo
  Reporte completo
  Ayuda
```

### 1.1 Registrar compra

Usa esta opcion cada vez que llega mercaderia al deposito. El sistema suma las unidades al stock y registra el movimiento.

**Paso a paso:**

1. Selecciona **"Registrar compra de insumos"** en el menu.
2. El bot te pregunta: *"Que insumo compraste?"*
   - Podes buscar por nombre (ej: `melamina blanco`), por SKU (ej: `MDF-001`) o por categoria (ej: `filo`).
3. Si hay varias coincidencias, el bot te muestra una lista. Selecciona el correcto.
4. El bot pregunta: *"Cuantas unidades?"*
   - Ingresa la cantidad (ej: `10`).
5. El bot pregunta: *"Precio de compra por unidad?"*
   - Ingresa el precio (ej: `45648,50` o `45648.50`). Acepta formato argentino.
6. El bot pregunta: *"Proveedor?"*
   - Te sugiere el proveedor habitual. Podes confirmarlo o escribir otro.
7. El bot muestra un resumen para confirmar:
   ```
   Vas a registrar: COMPRA de 10 unidades de Melamina MDF Blanco (MDF-001)
   a $45.648,50/u de Masisa.
   Confirmar?
   ```
8. Toca **Confirmar** para registrar, o **Cancelar** para volver al menu.
9. Si confirmas, el bot responde con el stock actualizado:
   ```
   Listo! Registre la compra.
   Stock actual de Melamina MDF Blanco: 35 unidades.
   ```

**Ejemplo completo:**
```
Vos: Registrar compra
Bot: Que insumo compraste? Busca por nombre, SKU o categoria.
Vos: mdf blanco
Bot: Encontre 1 coincidencia:
     MDF-001 | Melamina MDF Blanco 18mm | Stock actual: 25
     Es este?
Vos: Si
Bot: Cuantas unidades compraste?
Vos: 10
Bot: Precio por unidad? (ultimo precio: $45.648,50)
Vos: 45648,50
Bot: Proveedor? (habitual: Masisa)
Vos: Masisa
Bot: Vas a registrar: COMPRA de 10u de Melamina MDF Blanco (MDF-001)
     a $45.648,50/u de Masisa. Confirmar?
Vos: Confirmar
Bot: Listo! Registre la compra. Stock actual: 35 unidades.
```

---

### 1.2 Registrar pedido

Usa esta opcion cuando un cliente encarga un mueble. El sistema calcula automaticamente que materiales se necesitan (usando las formulas BOM) y descuenta del stock.

**Paso a paso:**

1. Selecciona **"Registrar pedido nuevo"** en el menu.
2. El bot pregunta: *"Que tipo de mueble?"*
   - Aparecen botones: Mesa, Rack, Estante, Placard, Escritorio, Otro.
3. El bot pregunta: *"Medidas?"*
   - Ingresa largo x ancho x alto en metros (ej: `1.20 x 0.60 x 0.75`).
4. El bot pregunta: *"Color/material?"*
   - Te muestra los colores que tienen stock, con la cantidad disponible.
5. El bot pregunta: *"Cantidad de muebles iguales?"*
   - Ingresa la cantidad (ej: `2`).
6. El **motor de calculo** procesa el pedido y te devuelve la lista de materiales:
   ```
   Materiales necesarios para 2x Mesa 1.20x0.60x0.75 en Blanco:

   MDF-001  Melamina Blanco 18mm   Necesario: 3   Stock: 35   OK
   FND-001  Fondo Blanco 3mm       Necesario: 2   Stock: 12   OK
   FIL-001  Filo Blanco 22mm       Necesario: 1   Stock: 8    OK
   HER-003  Tornillos 40mm         Necesario: 48  Stock: 200  OK

   Stock suficiente para el pedido. Confirmar descuento?
   ```
7. Si **alcanza todo**: confirma y el stock se descuenta automaticamente.
8. Si **no alcanza** algo: el bot genera un reporte de faltantes:
   ```
   ATENCION: no hay stock suficiente para este pedido.

   Faltantes:
   - MDF-001 Melamina Blanco: necesitas 3, tenes 1, faltan 2
     Proveedor: Masisa | Costo estimado: $91.297

   Costo total de reposicion estimado: $91.297

   Podes confirmar el descuento parcial (solo lo que hay)
   o cancelar y esperar a tener todo.
   ```
   Este reporte tambien se envia por email a la direccion configurada.

---

### 1.3 Editar movimiento

Si te equivocaste en una carga, podes corregirla.

**Paso a paso:**

1. Selecciona **"Editar ultimo movimiento"** en el menu.
2. El bot muestra los ultimos 5 movimientos registrados:
   ```
   Ultimos movimientos:
   1. COMPRA | MDF-001 Melamina Blanco | +10u | hace 5 min
   2. CONSUMO | FND-001 Fondo Blanco | -2u | hace 1 hora
   3. COMPRA | FIL-001 Filo Blanco | +5u | hace 3 horas
   ...
   ```
3. Selecciona cual querés editar (por numero).
4. El bot te deja modificar: cantidad, insumo o tipo de movimiento.
5. Confirma los cambios. El movimiento original queda marcado como "editado" en el log con la fecha de edicion.

---

### 1.4 Consultar stock

Consulta rapida del stock actual.

**Paso a paso:**

1. Selecciona **"Ver stock actual"** en el menu.
2. Elegí como buscar:
   - **Por categoria**: MDF 18mm, Fondos 3mm, Filos/Canto, Herrajes, etc.
   - **Por SKU o nombre**: escribi directamente lo que buscas.
3. El bot devuelve una tabla:
   ```
   STOCK - MDF 18mm:

   SKU       Producto              Stock  Minimo  Estado
   MDF-001   Melamina Blanco       35     10      OK
   MDF-002   Melamina Roble        8      10      BAJO
   MDF-003   Melamina Negro        0      5       SIN STOCK
   ```

---

### 1.5 Ver alertas

Muestra todos los insumos que estan por debajo del stock minimo.

1. Selecciona **"Ver alertas de stock bajo"** en el menu.
2. El bot responde con la lista de alertas activas:
   ```
   ALERTAS DE STOCK:

   SIN STOCK:
   - MDF-003 Melamina Negro | Stock: 0 | Minimo: 5
     Proveedor: Egger | Costo reposicion: $228.240

   STOCK BAJO:
   - MDF-002 Melamina Roble | Stock: 8 | Minimo: 10 | Faltan: 2
     Proveedor: Masisa | Costo reposicion: $91.297

   Costo total estimado de reposicion: $319.537
   ```
3. Si no hay alertas, el bot responde: *"Todo bien! No hay insumos con stock bajo."*

---

### 1.6 Reporte completo

Genera un resumen general del estado del stock.

1. Selecciona **"Reporte completo"** en el menu.
2. El bot genera y envia un resumen con:
   - Total de insumos en stock
   - Valor total del inventario
   - Insumos con stock bajo o agotado
   - Ultimos movimientos
   - Pedidos pendientes de material

---

## 2. Formulario Web

El formulario web ofrece las mismas funciones principales que el bot, desde cualquier navegador (computadora o celular).

### 2.1 Acceso con PIN

Cuando abrís el formulario, lo primero que ves es la pantalla de acceso:

1. Ingresa el **PIN de acceso** que te dieron.
2. Tocá **"Ingresar"**.
3. Si el PIN es correcto, accedés al menu principal.
4. Si es incorrecto, el sistema te avisa y podes intentar de nuevo.

El PIN lo administra quien configuro el sistema. Si no lo tenes, pediselo al administrador.

### 2.2 Menu principal

Una vez adentro, ves cuatro opciones:

- **Registrar Compra** -- para cargar mercaderia recibida
- **Registrar Pedido** -- para cargar un nuevo pedido de un cliente
- **Consultar Stock** -- para ver las existencias actuales
- **Ver Alertas** -- para ver insumos con stock bajo

### 2.3 Registrar Compra

1. Tocá **"Registrar Compra"** en el menu.
2. Completá los campos:
   - **SKU**: el codigo del insumo (ej: `MDF-001`).
   - **Cantidad**: cuantas unidades compraste.
   - **Precio por unidad**: el precio de compra. Acepta formato argentino con coma decimal (ej: `45.648,50`).
   - **Proveedor**: nombre del proveedor.
3. Tocá **"Confirmar Compra"**.
4. Aparece un resumen para que revises los datos. Si esta todo bien, tocá **"Enviar"**. Si no, tocá **"Cancelar"** y corregí.
5. El sistema confirma la operacion y actualiza el stock.

### 2.4 Registrar Pedido

1. Tocá **"Registrar Pedido"** en el menu.
2. Completá los campos:
   - **Tipo de mueble**: elegí de la lista (Mesa, Rack, Estante, Placard, Escritorio, Otro).
   - **Medidas**: largo, ancho y alto en metros.
   - **Color**: el color o material del mueble.
   - **Cantidad**: cuantos muebles iguales.
3. Tocá **"Registrar Pedido"**.
4. El sistema calcula los materiales necesarios y muestra el resultado:
   - Si alcanza todo, confirmas y se descuenta.
   - Si falta algo, te muestra que falta y cuanto costaria reponerlo.

### 2.5 Consultar Stock

1. Tocá **"Consultar Stock"** en el menu.
2. El sistema carga automaticamente la tabla completa de stock con:
   - SKU, nombre del producto, stock actual, stock minimo y estado.
3. Los insumos con stock bajo o agotado se destacan visualmente.

### 2.6 Ver Alertas

1. Tocá **"Ver Alertas"** en el menu.
2. Ves la lista de insumos que necesitan reposicion, con proveedor sugerido y costo estimado.
3. Si no hay alertas, el sistema te avisa que esta todo en orden.

---

## 3. Google Sheet

La Google Sheet es la base de datos central del sistema. Podes abrirla directamente para ver toda la informacion o hacer ajustes manuales.

### Pestanas y que contiene cada una

| Pestana | Contenido |
|---|---|
| **Stock** | Lista maestra de todos los insumos: categoria, nombre, SKU, stock actual, stock minimo, precios, proveedor. Esta es la tabla principal. |
| **Movimientos** | Log de todas las operaciones realizadas: compras, consumos por pedido, ajustes manuales. Cada fila tiene timestamp, tipo, cantidad, stock anterior y nuevo. Nunca se borran filas de aca. |
| **Pedidos** | Registro de todos los pedidos de clientes: tipo de mueble, medidas, color, estado, materiales calculados. |
| **Usuarios_Autorizados** | Lista de personas que pueden usar el bot de Telegram. Tiene Telegram ID, nombre, rol y si esta activo. |
| **Formulas_BOM** | Formulas de fabricacion: para cada tipo de mueble, que componentes lleva y como calcular la cantidad en base a las medidas. |
| **Proveedores** | Directorio de proveedores con contacto y categorias que manejan. |
| **Config** | Parametros del sistema: email para alertas, frecuencia de reportes, dia y hora de envio. |
| **Dashboard** | Panel visual con graficos y resumen del estado general del stock. |

### Como leer el Dashboard

El Dashboard se actualiza automaticamente con los datos del sistema:

- **Graficos de barras**: stock actual agrupado por categoria (MDF, Fondos, Filos, etc.).
- **Grafico de torta**: valor en pesos del stock, repartido por categoria.
- **Semaforo visual**: tabla con todos los insumos coloreados segun su estado:
  - **Verde**: stock holgado (mayor a 1.5 veces el minimo).
  - **Amarillo**: stock cerca del minimo (entre el minimo y 1.5 veces el minimo).
  - **Rojo**: stock critico (por debajo del minimo).
- **Grafico de lineas**: evolucion del consumo de los ultimos 30 dias para los 5 insumos mas usados.
- **KPIs**: stock total en unidades, valor total en pesos, cantidad de insumos en rojo, pedidos pendientes de material.
- **Ultimos movimientos**: las ultimas 20 operaciones registradas.

---

## 4. Alertas automaticas

El sistema envia alertas por email de forma automatica. No tenes que hacer nada para activarlas, funcionan solas.

### Alerta de stock bajo

**Cuando se dispara:**
- Cada vez que se registra un consumo por pedido (inmediatamente despues de descontar stock).
- En cada ejecucion del reporte periodico programado.

**Condicion:** el stock de un insumo queda por debajo de su stock minimo definido. Solo aplica a insumos que tengan un stock minimo cargado. Si un insumo no tiene minimo definido, no genera alerta.

**Clasificacion:**
- **SIN STOCK**: el insumo llego a 0 unidades.
- **STOCK BAJO**: el insumo tiene stock, pero menos que el minimo.

**Que contiene el email:**
- Lista de insumos sin stock con proveedor sugerido y costo estimado de reposicion.
- Lista de insumos con stock bajo, indicando cuanto hay, cuanto deberia haber y cuanto falta.
- Costo total estimado de reposicion para todos los insumos en alerta.

### Alerta por pedido con faltantes

**Cuando se dispara:** inmediatamente al registrar un pedido que requiere mas material del disponible.

**Que contiene el email:**
- Detalle del pedido (tipo de mueble, medidas, color, cantidad).
- Tabla de materiales faltantes con cantidad necesaria, disponible, faltante, proveedor y costo estimado.
- Costo total estimado de la compra necesaria.
- Proveedor principal sugerido (el que cubre mas insumos faltantes).

### Reporte periodico

**Cuando se dispara:** segun la frecuencia configurada en la hoja "Config" (diario, semanal o quincenal), en el dia y hora definidos.

**Que contiene el email:**
- Resumen de movimientos del periodo (compras, consumos, ajustes).
- Top 10 insumos mas consumidos.
- Insumos con stock bajo o agotado.
- Valor total del stock actual.
- Pedidos en estado pendiente de material.

### Donde se configura

El email destino y la frecuencia de reportes se configuran en la hoja **"Config"** de la Google Sheet:

| Parametro | Que hace |
|---|---|
| `ALERTA_EMAIL` | Direccion de email que recibe las alertas y reportes |
| `REPORTE_FRECUENCIA` | Con que frecuencia se envia el reporte: DIARIO, SEMANAL o QUINCENAL |
| `REPORTE_DIA` | Dia de la semana para el reporte semanal (ej: LUNES) |
| `REPORTE_HORA` | Hora de envio (ej: 08:00) |

---

## 5. Preguntas frecuentes

### No encuentro un insumo cuando busco. Que hago?

Proba buscando de distintas formas: por nombre parcial, por SKU o por categoria. El sistema busca coincidencias parciales, asi que no necesitas escribir el nombre completo. Si el insumo realmente no esta cargado, hay que agregarlo a la hoja "Stock" de la Google Sheet (ver pregunta "Como agrego un nuevo insumo?").

### Que pasa si el stock queda en 0?

El sistema nunca permite que el stock quede en negativo. Si una operacion lo dejaria en 0, se permite (el insumo queda agotado). Si lo dejaria por debajo de 0, la operacion se rechaza con un aviso.

Cuando un insumo llega a 0, se genera automaticamente una alerta por email indicando que esta agotado, con el proveedor sugerido y el costo estimado de reposicion.

### Puedo editar la planilla directamente?

Si, podes. La Google Sheet es tuya y podes editarla cuando quieras. Pero tené en cuenta:

- **Hoja "Stock"**: podes agregar filas nuevas (nuevos insumos), editar precios, stock minimo, proveedores y notas. Si modificas la columna STOCK manualmente, el cambio no queda registrado en Movimientos (no hay log). Si necesitas corregir stock, es mejor hacerlo desde el bot con "Editar movimiento" o registrar un ajuste manual.
- **Hoja "Movimientos"**: no conviene editarla manualmente. Es el log historico del sistema.
- **Hoja "Config"**: podes cambiar los parametros libremente (email, frecuencia de reportes, etc.).
- **Hoja "Usuarios_Autorizados"**: podes agregar o quitar usuarios editando directamente aca.
- **Hoja "Formulas_BOM"**: podes agregar o modificar las formulas de fabricacion para cada tipo de mueble.

### Como agrego un nuevo insumo?

1. Abrí la Google Sheet.
2. Andá a la hoja **"Stock"**.
3. Agrega una fila nueva al final con todos los datos:
   - **CATEGORIA**: la categoria del insumo (ej: MDF 18mm, Fondo 3mm, Filo/Canto).
   - **PRODUCTO/COLOR**: nombre descriptivo (ej: Melamina Roble Natural).
   - **MEDIDA/VARIANTE**: si aplica (ej: 2600x1830, 22mm).
   - **SKU**: un codigo unico que no se repita (ej: MDF-004). Este codigo es el que se usa para buscar.
   - **STOCK**: la cantidad inicial.
   - **STOCK_MINIMO**: el punto en el que queres recibir alerta (ej: 5). Dejalo vacio si no queres alerta para este insumo.
   - **PRECIO_COSTO**: precio de compra por unidad.
   - **PROVEEDOR**: proveedor habitual.
   - Los demas campos son opcionales.
4. Listo. El sistema lo detecta automaticamente en la proxima consulta.

### Como cambio el stock minimo de un insumo?

1. Abrí la Google Sheet.
2. Andá a la hoja **"Stock"**.
3. Busca el insumo por SKU o nombre.
4. Edita la columna **STOCK_MINIMO** con el nuevo valor.
5. El cambio toma efecto inmediatamente. La proxima vez que el stock de ese insumo se revise, se usara el nuevo minimo.

### Como agrego un nuevo usuario al bot de Telegram?

1. Pedile a la persona que quiere usar el bot que averigue su **Telegram ID**. Puede hacerlo enviando cualquier mensaje al bot [@userinfobot](https://t.me/userinfobot) en Telegram.
2. Abrí la Google Sheet.
3. Andá a la hoja **"Usuarios_Autorizados"**.
4. Agrega una fila nueva:
   | TELEGRAM_ID | NOMBRE | ROL | ACTIVO |
   |---|---|---|---|
   | (el ID numerico) | Nombre de la persona | ADMIN | TRUE |
5. Listo. Esa persona ya puede mandar mensajes al bot y va a tener acceso.

Para **quitar** un usuario, no hace falta borrar la fila. Simplemente cambia la columna **ACTIVO** de `TRUE` a `FALSE`. Si en algun momento queres devolverle el acceso, cambias a `TRUE` de nuevo.

---

## Contacto y soporte

Si algo no funciona como esperabas o tenes dudas que no se resuelven con este manual, contacta al administrador del sistema que realizo la configuracion inicial.
