# Calculadora P2P USD/VES

Herramienta local y offline-first para simular y llevar un registro de operaciones P2P entre Bs.S y USD/USDT. No tiene backend ni autenticación: los datos se guardan en el navegador, y solo se necesita conexión para solicitar actualizaciones opcionales de tasas.

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

`npm run build` ejecuta primero `tsc --noEmit` y luego genera la aplicación estática con Vite.

### Inicio en Windows con un clic

Doble clic en `iniciar.bat` (en la raíz del proyecto). El archivo verifica Node.js/npm, instala las dependencias si todavía no existe `node_modules`, levanta Vite y abre el navegador automáticamente. Para detener la app, cierra la ventana de la consola o presiona `Ctrl+C`.

Para una prueba sin abrir el navegador:

```bat
iniciar.bat --no-open
```

## Tecnologías y arquitectura

- React 18, Vite y TypeScript en modo estricto.
- Zustand con `persist`: persiste en `localStorage` bajo la clave `calculadora-p2p`, guarda `schemaVersion: 1` y migra el estado mediante `migrate`.
- Zod valida datos de entrada, estado persistido e importaciones.
- Vitest prueba el motor, el dominio, el store y el intercambio de datos.
- CSS Modules para los componentes; `src/styles/global.css` contiene los tokens de tema claro y oscuro.
- El motor puro está en `src/domain/calculations.ts`; no depende de React.

## Tasas y uso sin conexión

La tasa oficial del BCV y la tasa paralela se consultan en DolarApi. En desarrollo, Binance P2P se consulta a través del proxy `/binance-api`, que apunta a `https://p2p.binance.com`; si falla, se intenta DolarApi paralelo. En producción se usa DolarApi paralelo como alternativa para Binance.

Las tasas también se pueden editar manualmente. Si una consulta falla por red, CORS o disponibilidad del proveedor, se conserva el valor actual. La aplicación puede usarse sin conexión con los datos locales; las actualizaciones automáticas de tasas requieren internet.

La brecha cambiaria se calcula contra la tasa BCV efectiva, que suma la comisión fija de intervención del 0,50%: `BCV_efectiva = BCV + BCV × 0,005` y `brecha % = (Binance − BCV_efectiva) / BCV_efectiva × 100`. La brecha mínima requerida que muestra la calculadora sigue derivándose de la tasa de equilibrio del motor, que ya incorpora todos los costos.

## Modelo de cálculo

El cálculo aplica una comisión fija de intervención de 0,50% y admite dos entradas: monto de Bs.S a invertir o monto de USD a solicitar. Cada etapa monetaria se redondea a dos decimales con `round2`; las tasas conservan su precisión de entrada.

| Concepto | Regla aplicada |
| --- | --- |
| Comisión de tarjeta | Porcentaje descontado de los USD o cobrado extra en Bs.S, según la base del perfil. |
| Depósito Binance | Porcentaje más un monto fijo en USD. |
| Interbancario | Opcional; se calcula sobre la inversión inicial o sobre los Bs.S netos post-intervención. |
| IGTF | Opcional; se calcula sobre el cargo de la tarjeta o sobre la inversión total en Bs.S. |
| Slippage | Opcional; ajusta la tasa Binance usada en la estimación. |

El motor calcula la tasa de equilibrio y la brecha mínima requerida. La señal de rentabilidad es verde para ROI mayor que 3%, amarilla para ROI mayor que 0% y roja para ROI menor o igual que 0%.

## Registros y auditoría

El flujo de una compra es `Pendiente → Divisas acreditadas → Depositado a Binance → Vendido/Completado`; se puede cancelar desde cualquier estado no terminal. Cada cambio de estado conserva fecha, estado anterior, estado nuevo y nota. El cierre solicita la tasa real de venta Binance y guarda Bs.S ejecutados, ganancia y ROI ejecutados; el detalle conserva el snapshot de tasas, comisiones y bases usado al registrar la operación.

Los indicadores contables se calculan sobre todos los registros, no sobre la lista filtrada:

- **Capital en tránsito:** costo total de operaciones pendientes, con divisas acreditadas o depositadas en Binance.
- **Ganancia líquida acumulada:** utilidad ejecutada de operaciones completadas.
- **ROI global ponderado:** suma de utilidades completadas dividida entre la suma de sus costos, multiplicada por 100.
- **Canceladas:** conteo informativo; no se incluyen en las sumas.

La pantalla exporta los resultados filtrados en JSON o CSV. Los archivos incluyen `schemaVersion`; para importar CSV se acepta el formato exportado por esta aplicación. La configuración completa también se puede intercambiar como JSON.

## Datos de demostración

`Cargar datos demo` abre una confirmación, fija las tasas manuales en 40 Bs.S/USD para BCV y 46 Bs.S/USD para Binance, agrega el perfil `Banco Demo` si aún no existe y crea una compra completada de demostración solo si todavía no hay una. Después abre la pestaña Registros.

## Estructura principal

```text
src/
├── components/ui/        # Componentes compartidos y accesibles
├── domain/               # Cálculos, tipos, estados, KPIs y validación
├── features/
│   ├── audit/            # Historial de estados
│   ├── bankProfiles/     # Perfiles bancarios
│   ├── calculator/       # Simulación y desglose
│   ├── purchases/        # Registros, detalle, filtros y exportación
│   ├── rates/            # Tasas manuales y actualización automática
│   └── settings/         # Aviso y configuración
├── storage/              # Exportación e importación JSON/CSV
├── store/                # Estado global y persistencia
├── styles/               # Tokens y estilos globales
└── utils/                # Formato e identificadores
```

La navegación del shell incluye las cuatro pestañas operativas: Tasas, Perfiles, Calculadora y Registros.

## Pruebas

Las 50 pruebas de Vitest cubren redondeo y etapas del motor, modos de entrada y bases de comisiones, validación Zod, transiciones y ejecución de compras, KPIs, estado del store y migración de persistencia, exportación e importación JSON/CSV, y un smoke test de render cliente del shell con datos demo.

## Aviso

Es una herramienta de simulación, no una plataforma de operación ni asesoría financiera. Verifica la normativa vigente, las tasas y las condiciones bancarias antes de tomar decisiones; los resultados no garantizan ganancias.
