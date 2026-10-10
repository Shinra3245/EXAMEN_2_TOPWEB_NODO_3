# Conexión de los nodos con Supabase y Render

El Nodo 1 usa Laravel 13 y PostgreSQL en Supabase (organización EXAMEN, proyecto Banco Central, referencia `rtfdnrwcjwovpplmfthc`). Las tablas bancarias mantienen RLS y el ledger rechaza actualización, borrado y truncado.

Render es el destino acordado por el profesor. Vercel y Coolify son opcionales. El Banco Central está publicado y validado en https://banco-central-nodo1.onrender.com. Panel: https://banco-central-nodo1.onrender.com/admin/login.

## Nodo 1

Solo el backend central recibe la contraseña de PostgreSQL y las claves de Supabase. Conecta por el pooler de sesión del proyecto, puerto 5432, con SSL obligatorio. Los archivos privados `.env.supabase.local`, `.env.render.local` y `.env.admin.local` se excluyen de Git y del contenedor.

## Nodos 2 y 3

Configurar en su servidor, con una clave diferente para cada nodo:

```dotenv
BANCO_CENTRAL_URL=https://banco-central-nodo1.onrender.com/api
BANCO_CENTRAL_API_KEY=<CLAVE_PROPIA_GENERADA_EN_EL_PANEL>
```

La ruta base incluye `/api` si el cliente añade después `/accounts` o `/transactions`. Revisar el cliente para evitar duplicarla. No utilizar la URL `*.supabase.co` como API del banco.

Enviar `X-API-KEY`, `Accept: application/json` y `Content-Type: application/json`. Las claves no se incluyen en código del navegador ni en colecciones exportadas.

| Operación central | Ruta relativa a la base `/api` | Campos principales |
|---|---|---|
| Abrir cuenta, solo sucursal | `POST /accounts` | `numero_cuenta`, `nombre_titular`, `saldo_inicial`, `idempotency_key` |
| Consultar cuenta | `GET /accounts/{numero_cuenta}` | Respuesta: `numero_cuenta`, `nombre_titular`, `saldo_global`, `estado` |
| Operación monetaria | `POST /transactions` | `tipo`, `monto`, `idempotency_key`; `cuenta_origen` para retiro, `cuenta_destino` para depósito, ambas para transferencia |
| Identidad y efectivo | `GET /nodes/me` | Respuesta: `data` con ID, tipo, activo y efectivo actual |
| Recuperación ATM | `GET /transactions/by-idempotency-key/{clave}` | Comprobante o rechazo original; 404 estructurado `OPERATION_NOT_FOUND` |
| Historial | `GET /transactions?cuenta=...` | Respuesta paginada: movimientos del nodo autenticado en `data` |

El historial es local al nodo que procesa cada operación: la sucursal ve su depósito de apertura y el cajero sus retiros. Para conocer el saldo actual de la cuenta usar `GET /accounts/{numero_cuenta}`.

La apertura registra el saldo inicial positivo como `deposito`, conforme al esquema existente. Cada movimiento conserva `nodo_id`. El retiro devuelve 201 la primera vez y 200 si se reintenta con la misma clave y los mismos datos; reutilizar la clave con otros datos o desde otro nodo devuelve 409. Conservar la clave en todo reintento y crear otra para una operación nueva.

## Antes de la prueba conjunta

- El administrador crea sucursal y cajero, entrega sus claves y asigna efectivo.
- El Nodo 2 está publicado en https://sucursal-nodo2.onrender.com y ya adapta sus rutas locales `/api/cuentas` al contrato central `/api/accounts`. La conexión, apertura, historial, reportes y recuperación se verificaron contra Render.
- El Nodo 3 verifica su efectivo local antes de solicitar un retiro al Core y lo descuenta una sola vez tras la confirmación. Debe conservar el resultado y la clave de idempotencia para reintentos. Su implementación está en el repositorio del Nodo 3 y publicada en https://node3-atm.onrender.com.
- No ejecutar nuevamente `supabase/001_schema.sql` ni usar `migrate:fresh` en Supabase. Los cambios se realizan con migraciones incrementales coordinadas.

La colección conjunta está en `INTEGRACION/postman/` y su guía en `INTEGRACION/README.md`, desde la carpeta EXAMEN. El flujo es apertura de $1,000, retiro de $300, saldo $700, efectivo local correcto y un solo movimiento en el historial. Ese flujo ya se verificó mediante Nodo 2 y llamadas al Core con la clave del cajero. La aceptación desde la aplicación real del Nodo 3 ya está completada.

Las claves de los nodos de demostración están en el archivo privado `NODE1/.env.nodos.local` (desde EXAMEN). Cada agente usa exclusivamente la clave que corresponde a su nodo. No publicarlas ni compartir las credenciales privadas de Supabase.

## Ampliación del cajero validada

El Core incorpora `GET /nodes/me` para identificar el nodo y consultar su efectivo actual, y `GET /transactions/by-idempotency-key/{clave}` para recuperar el resultado original. Los retiros/depósitos del cajero actualizan saldo, efectivo, ledger y comprobante de forma atómica. La confirmación incluye `status`, `transaction`, `saldo_global` y `efectivo_disponible`; los rechazos definitivos se conservan fuera del ledger.

Usar el contrato publicado en [CONTRATO_NODO3.md](https://github.com/Shinra3245/EXAMEN_2_TOPWEB_NODO_1/blob/main/CONTRATO_NODO3.md). Los datos privados del cajero están en `NODE1/.env.nodo3.local` dentro de EXAMEN; `CAJERO_API_KEY` es la clave que se configura en el backend del Nodo 3 según los nombres de variables de su README.

Se aprobaron 43 pruebas PostgreSQL del Core, 36 de Nodo 2 y 54 solicitudes Postman con 107 aserciones. Se verificó recuperación después de reiniciar Render. El panel central cuenta con filtro por nodo, fechas completas, CSV y avisos Realtime privados. Para sincronizar o corregir efectivo, coordinar con el responsable del cajero y comprobar que no existen pendientes locales.

## Unión real de los tres servicios

Cajero publicado: https://node3-atm.onrender.com. Se verificó apertura $1,000 en la sucursal, retiro $300 desde el cajero y saldo $700 en los tres nodos, sin duplicación. Se aprobaron 46 solicitudes y 49 aserciones Postman, incluyendo persistencia de recibos, efectivo y sesión después de reiniciar el cajero. El inventario actual es $1,000.31; las sincronizaciones se coordinan sin pendientes. Las rutas públicas de NODE3 son `/api/atm`, `/api/accounts/{numero}/saldo`, `/api/retiros`, `/api/depositos` y `/api/operaciones/{id}`. Los movimientos reciben `Idempotency-Key` UUID y `monto` decimal como texto.
