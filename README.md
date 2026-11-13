# Calculadora P2P USD/VES

Herramienta local y offline-first para simular y llevar un registro de operaciones P2P entre Bs.S y USD/USDT. No tiene backend ni autenticación: los datos se guardan en IndexedDB (con respaldo temporal en localStorage) y solo se necesita conexión para solicitar actualizaciones opcionales de tasas. También se puede instalar como PWA en Android e iOS.

## Inicio rápido

Requiere Node.js 18 o superior y npm.

```bash
npm install
npm run dev
```

Para compilar, previsualizar o ejecutar las pruebas:

```bash
npm run build
npm run preview
npm run test
npm run test:watch
```

`npm run build` ejecuta primero `tsc --noEmit` y luego genera la aplicación estática con Vite, el manifest y el service worker de la PWA.

### Instalación como PWA

La app es instalable desde el navegador:

- **Android/Chrome:** aparece la opción de instalar; también se puede usar el menú del navegador.
- **iOS/Safari:** Compartir → Agregar a inicio.
- Una vez instalada, el shell carga sin conexión. Las APIs de tasas se consultan en modo red; el histórico usa la caché local de 90 días.
- Las actualizaciones se avisan dentro de la app y no recargan la página automáticamente.

Para probar el service worker en local, usá `npm run build && npm run preview`. El service worker requiere HTTPS o `localhost`; una IP de LAN por HTTP no alcanza.

### Inicio en Windows con un clic

Doble clic en `iniciar.bat` (en la raíz del proyecto). El archivo verifica Node.js/npm, instala las dependencias si todavía no existe `node_modules`, levanta Vite y abre el navegador automáticamente. Para detener la app, cierra la ventana de la consola o presiona `Ctrl+C`.

Para una prueba sin abrir el navegador:

```bat
iniciar.bat --no-open
```

## Tecnologías y arquitectura

- React 18, Vite y TypeScript en modo estricto.
- Zustand con `persist`: persiste en IndexedDB bajo la clave `calculadora-p2p`, con espejo temporal en `localStorage` durante la transición. Guarda `schemaVersion: 1` y migra el estado mediante `migrate`. La hidratación es asíncrona y ocurre antes de renderizar la app.
- Zod valida datos de entrada, estado persistido e importaciones.
- Vitest prueba el motor, el dominio, el store y el intercambio de datos.
- CSS Modules para los componentes; `src/styles/global.css` contiene los tokens de tema claro y oscuro.
- El motor puro está en `src/domain/calculations.ts`; no depende de React.

## Tasas y uso sin conexión

La tasa oficial del BCV y la tasa paralela se consultan en DolarApi. La tasa de Binance P2P se toma del lado de venta (`SELL`), que es el precio al que se pueden vender los USD/USDT. En desarrollo se consulta a través del proxy `/binance-api`, que apunta a `https://p2p.binance.com`; en producción se usa la función serverless `/api/binance-rate` (misma función del proxy, sin CORS). Si esa consulta falla, se intenta CriptoYa (Binance P2P), luego DolarApi paralelo y por último Yadio.

Las tasas también se pueden editar manualmente. Si una consulta falla por red, CORS o disponibilidad del proveedor, se conserva el valor actual. La aplicación puede usarse sin conexión con los datos locales; las actualizaciones automáticas de tasas requieren internet.

La brecha cambiaria se calcula contra la tasa BCV efectiva, que suma la comisión fija de intervención del 0,50%: `BCV_efectiva = BCV + BCV × 0,005` y `brecha % = (Binance − BCV_efectiva) / BCV_efectiva × 100`. La brecha mínima requerida que muestra la calculadora sigue derivándose de la tasa de equilibrio del motor, que ya incorpora todos los costos.

## Histórico de tasas y brecha

La pestaña Tasas incluye un gráfico histórico de Binance P2P y BCV con selector de rango:

- **24 h:** último valor de cada hora; las horas sin captura se unen con línea punteada.
- **7 d:** apertura y cierre de cada día, con banda de mínimo y máximo.
- **30 d / 90 d:** promedio diario.
- Selector **Precio** (Bs.S) o **Brecha %**.
- En **Precio**, serie diaria de **Tasa mínima** calculada con la BCV de cada día y la estructura de costos de la última compra no cancelada.
- En **Brecha %**, se muestran las tasas BCV/P2P, apertura/cierre, banda mín/máx y la brecha en un eje derecho; la tasa mínima se oculta en ese modo.
- Marcadores de compras y ventas.

Los datos históricos de Binance P2P se consultan desde `dolar-vzla.rafnixg.dev` y los de BCV desde DolarApi; ambas APIs tienen CORS habilitado. Las fuentes son agregadores independientes y pueden diferir del libro de anuncios en vivo; el gráfico no necesita backend propio. La serie BCV es diaria y se mantiene como referencia hasta 72 horas para calcular la brecha de cada muestra P2P.

## Modelo de cálculo

El cálculo fija la intervención en 0,50% sobre la base en Bs.S del USD solicitado (`Base_Bs = USD_1 × BCV`), no sobre el total ingresado. El modo "Invertir Bs.S" resuelve `USD_1` inversamente a partir del costo total, para que ambos modos sean simétricos. Cada etapa monetaria se redondea a dos decimales con `round2`; las tasas conservan su precisión de entrada.

| Concepto | Regla aplicada |
| --- | --- |
| Comisión de tarjeta | Base USD: el monto a Binance se calcula como `USD acreditados / (1 + comisión/100)` y la diferencia es la comisión retenida. Base Bs.S: se cobra extra y no reduce los USD. |
| Depósito Binance | Porcentaje sobre `USD_2` que llega a la pasarela. El cargo fijo P2P es de al menos 0,06 USDT por venta y se descuenta al vender, valorado a la tasa efectiva de venta (nunca a BCV). |
| Interbancario | Opcional; se calcula secuencialmente sobre `Base_Bs + intervención (0,50%)`, no sobre la base inicial. |
| IGTF | Opcional; en USD cuando el cargo de tarjeta es en USD; en Bs.S cuando la tarjeta o la inversión es en Bs.S. |
| Slippage | Opcional; ajusta la tasa Binance usada en la estimación. |

Los costos de IGTF y slippage solo se muestran en la calculadora y en la tarjeta del perfil cuando están activos en la configuración del banco. El formulario de perfil siempre permite configurarlos.

El motor calcula la tasa de equilibrio y la brecha mínima requerida. La tasa de equilibrio depende solo del costo total y de los USDT netos después del cargo fijo P2P: `Costo_Total_Bs / (USD_3 − fijo)`, dividiendo además por `(1 − slippage/100)` cuando el slippage está activo; no depende de la tasa Binance de mercado. La señal de rentabilidad es verde para ROI mayor que 3%, amarilla para ROI mayor que 0% y roja para ROI menor o igual que 0%.

## Registros, inventario FIFO y auditoría

El ciclo de una compra es `En espera → Aprobado → Acreditado → En Binance → Parcial → Completo`; se puede cancelar desde `En espera`, `Aprobado` o `Acreditado`. La acreditación bancaria registra el estado `Aprobado`; el paso a `Acreditado` representa el capital ya disponible en banca y el paso a `En Binance` crea el lote con su costo unitario y saldo inicial en USDT. El registro desde la calculadora pide confirmación con perfil, monto, inversión, retorno, USD adjudicados y utilidad estimada antes de guardar. La sección **Registros** separa **Compras** y **Ventas** en dos vistas con paginación independiente y una barra de filtros compacta de una sola fila con etiquetas embebidas, fechas agrupadas y limpiar como acción secundaria. En **Compras**, la columna **Inversión** muestra el costo real total en Bs.S con los USD comprados al banco debajo; **Resultado** muestra primero los Bs.S obtenidos de la venta y debajo el equivalente en USD; **Ganancia** muestra el valor en USD con el ROI debajo y permanece vacía hasta que la compra esté `Completo`; la columna **Estado** muestra el USDT remanente en cuenta para compras `En Binance` o `Parcial`, con el costo restante en Bs.S en el tooltip. El resultado de la venta y el detalle de inventario quedan en el detalle de la compra. Los encabezados de las tablas no incluyen símbolos monetarios; las unidades se muestran en cada valor.

Las ventas P2P son registros independientes que consumen lotes en orden FIFO: primero por fecha de fondeo a Binance, luego por fecha de creación y finalmente por identificador. Cada venta prorratea la comisión fija de 0,06 USDT entre los lotes consumidos, asigna el costo con la regla anti-centavos y entrega el remanente exacto de ingresos al último lote. Una venta puede dejar un lote `Parcial` o cerrarlo como `Completo`; el detalle de la compra muestra sus asignaciones y el detalle de la venta muestra los lotes de origen. Al eliminar una venta, el inventario se reconstruye desde las compras originales y el diario de ventas restante.

Los indicadores contables se calculan sobre todos los registros, no sobre la lista filtrada y muestran el valor principal en USD/USDT con el equivalente en Bs.S debajo:

- **Capital en tránsito:** USD solicitados en `En espera` más USD aprobados en `Aprobado`.
- **Capital en banca:** USD acreditados de operaciones `Acreditado` aún no fondeadas a Binance.
- **Capital en Binance:** USDT remanentes de lotes `En Binance` y `Parcial`.
- **Ganancia realizada:** utilidad de las asignaciones FIFO expresada en USDT, incluyendo ventas parciales.
- **ROI realizado:** ganancia realizada dividida entre el costo asignado a ventas.

Una compra consumida por ventas no se puede eliminar ni volver a completar manualmente; primero hay que eliminar las ventas asociadas. La pantalla exporta los resultados filtrados de compras en JSON o CSV. La configuración completa, que incluye compras, ventas y perfiles, también se puede intercambiar como JSON.

## Estructura principal

```text
src/
├── components/ui/        # Componentes compartidos y accesibles
├── domain/               # Cálculos, FIFO, tipos, estados, KPIs y validación
├── features/
│   ├── audit/            # Historial de estados
│   ├── bankProfiles/     # Perfiles bancarios
│   ├── calculator/       # Simulación y desglose
│   ├── purchases/        # Registros, detalle, filtros y exportación
│   ├── sales/            # Registro y detalle de ventas P2P
│   ├── rates/            # Tasas manuales y actualización automática
│   └── settings/         # Configuración y almacenamiento
├── storage/              # IndexedDB, migración y exportación/importación JSON/CSV
├── store/                # Estado global y persistencia
├── styles/               # Tokens y estilos globales
└── utils/                # Formato e identificadores
```

La navegación del shell está directamente en el encabezado con **Calculadora, Perfiles, Tasas y Registros** como accesos visibles; no requiere abrir un menú. La sección activa se conserva al recargar; sin una sección guardada, la app abre en Calculadora. En pantallas angostas las pestañas se desplazan horizontalmente.

## Pruebas

Las 179 pruebas de Vitest cubren redondeo y etapas del motor, el mínimo obligatorio de 0,06 USDT, el interbancario secuencial sobre el monto con intervención, modos de entrada y bases de comisiones, la tarjeta inversa, la independencia del break-even, validación Zod, transiciones, acreditaciones, el motor FIFO con el ejemplo de tres lotes, la captura de ventas con vista previa, KPIs, estado del store, migración e hidratación desde IndexedDB con fallback a localStorage, exportación e importación JSON/CSV, la consulta Binance P2P del lado de venta, la fecha histórica de compra con tasas del día, la tabla financiera y las acciones de Registros, la barra compacta de filtros, la separación y paginación de compras/ventas, el histórico P2P/BCV con agregación 24h/7d/30d/90d, el modo cajero de los campos numéricos, la confirmación de registro de compra, el orden del resumen móvil, la prioridad del perfil en la calculadora, el reordenamiento drag & drop de perfiles bancarios, la memoria del último modo de entrada, la memoria del último perfil bancario y la copia del monto de inversión, y un smoke test de render cliente del shell con estado vacío.

## Aviso

Es una herramienta de simulación, no una plataforma de operación ni asesoría financiera. Verifica la normativa vigente, las tasas y las condiciones bancarias antes de tomar decisiones; los resultados no garantizan ganancias.

El aviso se muestra automáticamente una sola vez, en la primera visita. No tiene configuración visible en la pantalla de ajustes; después de mostrarse queda registrado en el estado local para no volver a aparecer.



