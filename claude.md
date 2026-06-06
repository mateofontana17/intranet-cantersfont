Spec — Formulario de Nuevo Proyecto

Documento de trabajo — define
todos los campos que el formulario de Nuevo Proyecto va a capturar a lo largo
del ciclo de vida del proyecto, desde el primer contacto con el cliente hasta
el cierre post-colocación.

Decisión de base: el alta del
proyecto es liviana (Etapa 1). El resto de la información se carga
progresivamente en la página del proyecto (/proyectos/[id]), por sección, a
medida que avanza el estado del proyecto.

Estados del proyecto: en_ventas
→ diseño → producción → colocación → finalizado (o cancelado).

**Etapas del documento:**

•       Etapa
1 — Alta del proyecto

•       Etapa
2 — Visita / Relevamiento técnico

•       Etapa
3 — Diseño (3A general + 3B por mueble)

•       Etapa
4 — Cierre comercial (4A plata + 4B fechas + 4C documentación)

•       Etapa
5 — Producción y colocación (5A producción + 5B colocación + 5C
post-colocación)

# Etapa 1 — Alta del proyecto

Se carga en /proyectos/nuevo. Es
el primer contacto con el cliente: pocos campos, sin fricción. El objetivo es
crear el registro lo antes posible para empezar a contar tiempo en cada etapa.

| **#**  | **Campo**                   | **Tipo** | **Obligatorio** | **Detalle**                                           |
| ------------ | --------------------------------- | -------------- | --------------------- | ----------------------------------------------------------- |
| 1            | Nombre                            | text           | Sí                   | —                                                          |
| 2            | Apellidos                         | text           | Sí                   | —                                                          |
| 3            | Teléfono                         | tel            | Sí                   | Formato libre, sugerido +54 11 XXXX-XXXX                    |
| 4            | Email                             | email          | No                    | —                                                          |
| 5            | Dirección de colocación         | text           | Sí                   | Calle, número, piso/depto, localidad                       |
| 6            | Clasificación del cliente        | select         | No                    | potencial / indeciso / frío / cerrado                      |
| 7            | Cómo nos conoció                | select         | No                    | Instagram / Recomendación / Web / Showroom / Pasaba por el |
| local / Otro |                                   |                |                       |                                                             |
| 8            | Espacios a hacer                  | multiselect    | Sí                   | Cocina / Vestidor / Dormitorio / Living / Baño / Otro      |
| 9            | Qué te dijo (descripción breve) | textarea       | No                    | Lo que el cliente pidió, en caliente, sin filtrar          |
| 10           | Fecha tentativa que la quiere     | date           | No                    | Para empezar a detectar atrasos desde el día 1             |
| 11           | Notas del cliente / proyecto      | textarea       | No                    | Campo libre — ver ejemplos en la página siguiente         |
| 12           | Vendedor responsable              | auto           | Sí                   | Lo asigna el sistema al usuario logueado                    |

### Qué tipo de información va en "Notas del cliente / proyecto"

Campo libre, visible en la ficha
del proyecto. Sirve para todo lo que conviene recordar pero no entra en un
campo estructurado:

•       Preferencias
estéticas: colores, estilo (moderno/clásico/minimalista), materiales que pidió
(melamina/laqueado/madera).

•       Contexto
del hogar: mascotas, niños chicos, si vive solo, etc. (afecta diseño).

•       Disponibilidad
/ horarios: mejor horario para llamarlo, cuándo está la casa libre para medir.

•       Urgencia
o motivo de compra: se muda, está reformando, regalo, etc.

•       Plata:
presupuesto aproximado que mencionó, si dijo que ya cotizó con otros.

•       Competencia:
si está cotizando con otra carpintería, cuál.

•       Quién
decide: si es él/ella o también el cónyuge / padres / arquitecto.

•       Alertas:
"regateador", "indeciso crónico", "viene recomendado
por X", etc.

# Etapa 2 — Visita / Relevamiento técnico

Se carga en /proyectos/[id]
cuando alguien (el vendedor o el medidor) va al lugar a relevar. El proyecto no
puede pasar a Diseño sin esta etapa completa.

| **#**                     | **Campo**             | **Tipo**    | **Obligatorio** | **Detalle**                                         |
| ------------------------------- | --------------------------- | ----------------- | --------------------- | --------------------------------------------------------- |
| 1                               | Fecha de visita             | date              | Sí                   | Cuándo se fue a medir                                    |
| 2                               | Quién fue a medir          | select (usuarios) | Sí                   | —                                                        |
| 3                               | Medidas del espacio         | textarea          | Sí                   | Ancho × alto × profundidad, paredes relevantes          |
| 4                               | ¿Tiene ascensor?           | radio (sí/no)    | Sí                   | Crítico para logística de entrega                       |
| 5                               | Medidas de acceso           | text              | Sí                   | Puerta principal, pasillos, escaleras — si no entra una  |
| placa hay que saberlo antes     |                             |                   |                       |                                                           |
| 6                               | ¿Hay mochetas?             | radio (sí/no)    | Sí                   | —                                                        |
| 7                               | ¿Falsas escuadras?         | radio (sí/no)    | Sí                   | Paredes no a 90° — afecta cortes                        |
| 8                               | Tipo de piso                | select            | No                    | Cerámico / Madera / Flotante / Cemento alisado / Otro    |
| (afecta zócalos y nivelación) |                             |                   |                       |                                                           |
| 9                               | Instalaciones existentes    | multiselect       | Sí                   | Gas / 220V / 380V / Agua / Desagüe / Campana extracción |
| 10                              | Estado general del lugar    | select            | Sí                   | Listo para colocar / En obra / Por terminar               |
| 11                              | Fotos del lugar             | upload múltiple  | Sí                   | Mínimo 3 fotos (frente, lateral, accesos)                |
| 12                              | Plano del lugar (si existe) | upload            | No                    | PDF o imagen del plano del arquitecto                     |
| 13                              | Notas del relevamiento      | textarea          | No                    | Humedad, columnas, ausencias del cliente, etc.            |

# Etapa 3 — Diseño

Esta etapa tiene dos niveles: el
conjunto del proyecto (3A) y cada mueble individual (3B). El proyecto pasa a
Producción cuando 3A está completa y se aprobó el diseño.

## 3A. Diseño a nivel proyecto (general)

| **#**                                                        | **Campo**                  | **Tipo**        | **Obligatorio** | **Detalle**                                           |
| ------------------------------------------------------------------ | -------------------------------- | --------------------- | --------------------- | ----------------------------------------------------------- |
| 1                                                                  | Descripción del diseño         | textarea              | Sí                   | Estilo, colores generales, idea (ej: "Cocina en L           |
| blanca con isla, alacenas hasta el techo, mesada de cuarzo negro") |                                  |                       |                       |                                                             |
| 2                                                                  | Link al render                   | URL                   | Sí                   | Drive / Dropbox / lo que use el diseñador (V2 será upload |
| directo)                                                           |                                  |                       |                       |                                                             |
| 3                                                                  | Link a planos técnicos          | URL                   | No                    | Planos del arquitecto o del diseñador interno              |
| 4                                                                  | Boceto aprobado por el cliente   | upload (imagen / PDF) | Sí                   | El documento que el cliente firma — referencia anti        |
| "yo no pedí eso"                                                  |                                  |                       |                       |                                                             |
| 5                                                                  | Fecha de aprobación del diseño | date                  | Sí                   | Disparador para pasar a Producción                         |

## 3B. Diseño por cada mueble individual

Se repite N veces, una por
mueble. La tabla muebles ya soporta la mayoría de estos campos en el esquema
actual; los nuevos (módulos, puertas, zócalo, filo, LED detallado) se sumarían
en una migración futura.

| **#** | **Campo**                         | **Tipo**      | **Obligatorio** | **Detalle**                                            |
| ----------- | --------------------------------------- | ------------------- | --------------------- | ------------------------------------------------------------ |
| 1           | Espacio                                 | select              | Sí                   | Cocina / Dormitorio / Living / Vestidor / Baño / Otro       |
| 2           | Tipo de mueble                          | select              | Sí                   | Del catálogo tipos_mueble (ampliar con vestidor y baño)    |
| 3           | Cantidad de módulos                    | número entero      | Sí                   | Ej: una alacena de 3 m son ~4 módulos                       |
| 4           | Nombre custom                           | text                | No                    | Opcional (ej: "Bajo mesada izquierdo")                       |
| 5           | Medidas (alto / largo / profundo en cm) | 3 inputs numéricos | Sí                   | —                                                           |
| 6           | Color                                   | select (catálogo)  | Sí                   | Catálogo `colores` (admin lo amplía)                     |
| 7           | Nivel                                   | select 2 a 5        | Sí                   | Lo elige Ventas (afecta precio)                              |
| 8           | ¿Lleva puerta(s)?                      | radio (sí/no)      | Sí                   | —                                                           |
| 9           | ↳ Cantidad de puertas / hojas          | número             | Si lleva puerta       | —                                                           |
| 10          | ↳ Material de la puerta                | select              | Si lleva puerta       | Melamina / Vidrio / Laqueada / Madera maciza                 |
| 11          | ↳ Tipo de apertura                     | select              | Si lleva puerta       | Batiente / Corrediza / Rebatible / Plegable / Push-to-open   |
| 12          | Cantidad de cajones                     | número             | No                    | —                                                           |
| 13          | Tipo de zócalo                         | select              | Sí                   | Plástico / Aluminio / Melamina / Retranqueado / Sin zócalo |
| 14          | Tipo de filo (tapacanto)                | select              | Sí                   | 0,45 mm / 2 mm                                               |
| 15          | ¿Laqueado?                             | radio (sí/no)      | Sí                   | —                                                           |
| 16          | ↳ Detalle laqueado                     | text                | Si es sí             | Color, mate/brillante, partes laqueadas                      |
| 17          | ¿Lleva LED?                            | radio (sí/no)      | Sí                   | —                                                           |
| 18          | ↳ Tipo de LED                          | select              | Si lleva LED          | Tira / Spot / Barra rígida / Panel / Con sensor de          |
| movimiento  |                                         |                     |                       |                                                              |
| 19          | ↳ Descripción de cómo va el LED      | textarea            | Si lleva LED          | Dónde va, color (cálido/frío), si es regulable            |
| 20          | Tipo de herraje                         | select              | Sí                   | Cierre suave / Cierre común / Push / Bisagras ocultas       |
| 21          | Características adicionales            | textarea            | No                    | Divisiones internas, vidrios, especiales                     |
| 22          | Boceto del mueble                       | upload              | Sí                   | Imagen                                                       |
| 23          | Croquis técnico                        | upload              | Sí                   | Con medidas para producción                                 |

# Etapa 4 — Cierre comercial

Se carga cuando el cliente
acepta el presupuesto y deja la seña. Es el momento en que el proyecto deja de
ser una posibilidad y pasa a ser un compromiso real con fechas.

| **#**                                     | **Campo**                     | **Tipo**    | **Obligatorio** | **Detalle**                                          |
| ----------------------------------------------- | ----------------------------------- | ----------------- | --------------------- | ---------------------------------------------------------- |
| **4A. Plata**                             |                                     |                   |                       |                                                            |
| 1                                               | Moneda                              | radio             | Sí                   | ARS / USD                                                  |
| 2                                               | Monto total                         | número (decimal) | Sí                   | Precio final acordado                                      |
| 3                                               | Descuento aplicado                  | número           | No                    | Puede ser monto o %                                        |
| 4                                               | Forma de facturación               | select            | Sí                   | Factura A / Factura B / Factura C / Sin factura            |
| 5                                               | Seña / anticipo recibido           | número           | Sí                   | Monto recibido para cerrar                                 |
| 6                                               | Fecha de la seña                   | date              | Sí                   | Cuándo entró la plata                                    |
| 7                                               | Forma de pago de la seña           | select            | Sí                   | Efectivo / Transferencia / MercadoPago / Cheque / Tarjeta  |
| 8                                               | Saldo restante                      | calculado         | Auto                  | Monto total − seña (se muestra, no se carga)             |
| 9                                               | Forma de pago del saldo             | select            | Sí                   | Contraentrega / Antes del armado / En cuotas / Mitad y     |
| mitad / Otro                                    |                                     |                   |                       |                                                            |
| 10                                              | ↳ Detalle si es "En cuotas"        | textarea          | Si aplica             | Cantidad de cuotas, montos, fechas                         |
| 11                                              | ↳ Detalle si es "Otro"             | text              | Si aplica             | —                                                         |
| **4B. Fechas comprometidas**              |                                     |                   |                       |                                                            |
| 12                                              | Fecha de cierre de venta            | date              | Sí                   | El día que se firmó. Dispara automático                 |
| fecha_limite_cambios_gratis = cierre + 14 días |                                     |                   |                       |                                                            |
| 13                                              | Fecha de entrega prometida          | date              | Sí                   | La fecha clave para detectar atrasos. Es la que el cliente |
| espera.                                         |                                     |                   |                       |                                                            |
| 14                                              | Fecha de colocación tentativa      | date              | No                    | Estimada, ajustable. Para agenda de colocadores.           |
| **4C. Documentación y                          |                                     |                   |                       |                                                            |
| cláusulas**                                    |                                     |                   |                       |                                                            |
| 15                                              | Contrato / presupuesto firmado      | upload (PDF)      | Sí                   | El doc que el cliente firmó                               |
| 16                                              | Comprobante de seña                | upload            | Sí                   | Recibo, captura de transferencia, etc.                     |
| 17                                              | Cláusulas / condiciones especiales | textarea          | No                    | Ej: "cliente provee mesada", "incluye                      |
| colocación", "garantía 1 año en herrajes"    |                                     |                   |                       |                                                            |
| 18                                              | Notas del cierre                    | textarea          | No                    | Regateos, promesas, alertas, todo lo que conviene dejar    |
| por escrito                                     |                                     |                   |                       |                                                            |

# Etapa 5 — Producción y colocación

No es un formulario único: son
datos que se cargan en momentos distintos del proceso productivo. La división
en 5A / 5B / 5C marca esos momentos.

| **#**                    | **Campo**                            | **Tipo**                | **Obligatorio** | **Detalle**                                           |
| ------------------------------ | ------------------------------------------ | ----------------------------- | --------------------- | ----------------------------------------------------------- |
| **5A. Producción (por cada    |                                            |                               |                       |                                                             |
| mueble individual)**           |                                            |                               |                       |                                                             |
| 1                              | Estado del mueble                          | select                        | En cada cambio        | pendiente / en_producción / producido / en_colocación /   |
| colocado / trabado             |                                            |                               |                       |                                                             |
| 2                              | Fecha de inicio de producción             | auto (timestamp)              | Al pasar a            |                                                             |
| en_producción                 | —                                         |                               |                       |                                                             |
| 3                              | Fecha de fin de producción                | auto (timestamp)              | Al pasar a            |                                                             |
| producido                      | Sirve para medir tiempo de fabricación    |                               |                       |                                                             |
| 4                              | Operario asignado                          | select (usuarios producción) | Al iniciar            |                                                             |
| producción                    | Quién lo arma                             |                               |                       |                                                             |
| 5                              | Notas de producción                       | textarea                      | Libre                 | Cambios de color por stock, refuerzos, ajustes durante el   |
| armado                         |                                            |                               |                       |                                                             |
| 6                              | Fotos del mueble terminado                 | upload múltiple              | Al pasar a            |                                                             |
| producido                      | Para mostrar al cliente antes de colocar   |                               |                       |                                                             |
| 7                              | Si está trabado: motivo                   | textarea                      | Sí (si trabado)      | Qué falta para destrabarlo                                 |
| 8                              | Si está trabado: qué se necesita         | text                          | Sí (si trabado)      | Acción concreta para resolver                              |
| 9                              | Si está trabado: responsable de destrabar | select (usuario)              | Sí (si trabado)      | Quién tiene que hacer algo                                 |
| **5B. Colocación (a nivel     |                                            |                               |                       |                                                             |
| proyecto)**                    |                                            |                               |                       |                                                             |
| 10                             | Fecha de colocación agendada              | date                          | Sí                   | Cuándo se va a colocar                                     |
| 11                             | Horario                                    | time                          | No                    | Hora estimada de llegada                                    |
| 12                             | Colocador responsable                      | select (usuario)              | Sí                   | Quién va al cliente                                        |
| 13                             | Ayudantes                                  | multiselect (usuarios)        | No                    | Si va más de uno                                           |
| 14                             | Vehículo / transporte                     | select                        | Sí                   | Camioneta propia / Flete contratado / Cliente retira        |
| 15                             | ¿Entrega completa o por partes?           | radio                         | Sí                   | Si es por partes, cargar fecha de cada entrega              |
| 16                             | Notas para el colocador                    | textarea                      | No                    | Mochetas, ascensor chico, mascotas, accesos especiales      |
| **5C. Post-colocación (cierre |                                            |                               |                       |                                                             |
| del proyecto)**                |                                            |                               |                       |                                                             |
| 17                             | Fecha real de colocación                  | date                          | Sí                   | Cuándo se colocó de verdad. Comparada con la prometida → |
| atraso real                    |                                            |                               |                       |                                                             |
| 18                             | ¿Cliente conforme?                        | radio (sí / no / parcial)    | Sí                   | —                                                          |
| 19                             | Observaciones del cliente                  | textarea                      | Si no o parcial       | Qué reclamó, qué falta corregir                          |
| 20                             | Pendientes post-colocación                | textarea                      | No                    | Ej: tapa de cajón faltante, regular bisagras               |
| 21                             | Foto del mueble colocado en el lugar       | upload múltiple              | Sí                   | Portfolio + comprobante de entrega                          |
| 22                             | Conformidad firmada por cliente            | upload (PDF / imagen)         | Sí                   | Documento de cierre, sirve también para reclamos futuros   |
| 23                             | Saldo final cobrado                        | radio (sí / no)              | Sí                   | Si está en "sí", el proyecto puede pasar a                |
| finalizado                     |                                            |                               |                       |                                                             |
| 24                             | Fecha cobro saldo                          | date                          | Si saldo cobrado      | —                                                          |
| 25                             | Forma de cobro del saldo                   | select                        | Si saldo cobrado      | Efectivo / Transferencia / Cheque / etc.                    |

# Resumen — Qué se obtiene con todo esto

•       Visibilidad
de proyectos atrasados: comparando fecha_entrega_prometida (Etapa 4) vs. fecha
real de colocación (Etapa 5C) y vs. estado actual del proyecto.

•       Visibilidad
de qué se está produciendo ahora: muebles en estado en_producción, con operario
asignado y fecha de inicio (Etapa 5A).

•       Detección
temprana de trabas: muebles en estado trabado con motivo, qué se necesita y
responsable (Etapa 5A).

•       KPIs
futuras: clasificación de cliente, canal de origen (cómo nos conoció), tiempo
entre alta y cierre, tiempo entre cierre y entrega, atraso promedio por
vendedor, % de conformidad del cliente.

*Próximo paso sugerido: una vez aprobado este documento,
implementar la Etapa 1 (alta liviana) primero, ya que es lo que arranca el
flujo y permite empezar a medir desde el día siguiente.*
