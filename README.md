# Nodo 3 · Cajero automático (ATM)

Aplicación académica con **Express 5 y PostgreSQL**, independiente de NODE1 y NODE2. Incluye interfaz de clientes, administración del cajero, consulta de saldo, retiro, depósito y recuperación de operaciones interrumpidas.

Los clientes ingresan solo un número de cuenta: **es una simulación, no autenticación real del titular**. La API Key del cajero se usa exclusivamente en el backend. El Banco Central conserva la autoridad sobre cuentas, saldos e historial global.

## Estado de integración

- Adaptador actualizado al formato Laravel revisado: cuenta sin `data`, clave de idempotencia en JSON y transacciones en la raíz (201/200).
- Banco Central simulado disponible para desarrollar sin depender del trabajo de otros integrantes.
- La integración con NODE1 requiere URL, API Key propia y el contrato descrito en [docs/central-contract.md](docs/central-contract.md). Las rutas de identidad, recuperación, efectivo e idempotencia ya están implementadas y desplegadas en NODE1.
- Desplegado en [Render](https://node3-atm.onrender.com), con PostgreSQL 17 propio y configuración persistente.
- El trabajo y el repositorio abarcan únicamente NODE3. No se ejecutan migraciones sobre Supabase ni se modifican otros nodos.

## Arquitectura

```mermaid
flowchart LR
  C[Cliente: cuenta y operación] --> A[NODE3: Express + interfaz]
  T[Técnico: sesión protegida] --> A
  A --> P[(PostgreSQL de NODE3: configuración, efectivo, reservas y sesiones)]
  A -->|HTTPS + X-API-KEY + idempotency_key en JSON| B[NODE1: API Banco Central]
  B --> S[(Supabase: cuentas e historial global)]
  N[NODE2: Sucursal] --> B
```

El PostgreSQL de NODE3 conserva el inventario operativo del cajero; no duplica la base maestra de cuentas. Los depósitos aprobados incrementan el efectivo utilizable del mismo cajero. Se simula un inventario total en pesos; no se modelan denominaciones de billetes ni hardware de dispensación.

## Ejecutar localmente, paso a paso

Requisitos: **Node.js 24.19.0**, npm y Docker con Compose. `.node-version` fija la versión utilizada en la validación. Si utilizas un gestor de versiones, selecciona Node 24 antes de instalar.

1. Entra en el repositorio e instala las dependencias:

   ```bash
   npm ci
   ```

2. Genera configuración privada para desarrollo:

   ```bash
   npm run setup:local
   ```

   El comando crea `.env` y `.local-admin.txt` con permisos privados. No sobrescribe un `.env` existente. La contraseña del usuario `tecnico` se consulta en `.local-admin.txt`; ambos archivos están excluidos de Git.

3. Inicia el PostgreSQL propio del cajero:

   ```bash
   docker compose up -d postgres
   ```

   Espera a que el contenedor esté saludable. La base utiliza el puerto local **55434** y un volumen persistente.

4. En una terminal, inicia el Banco Central **simulado**:

   ```bash
   npm run mock:central
   ```

   Escucha en `http://127.0.0.1:4001/api`, tiene la cuenta `10001` con **$1,000.00** y asigna **$5,000.00** al cajero. Su API Key se genera en `.env`; no tiene credenciales reales de Supabase.

5. En otra terminal, inicia NODE3:

   ```bash
   npm start
   ```

   Al iniciar se aplica automáticamente `sql/001_atm.sql`, únicamente sobre `DATABASE_URL`. Si existe `BANCO_CENTRAL_API_KEY` y el cajero todavía no está configurado, se valida y configura una sola vez. En los siguientes arranques se conserva la configuración guardada. Si el simulador aún no está disponible, el panel permite completar la conexión después.

6. Abre [http://localhost:3003](http://localhost:3003) y el panel [http://localhost:3003/admin](http://localhost:3003/admin).

Para desarrollo con recarga automática: `npm run dev`. Para detener solo la base conservando el volumen: `docker compose stop postgres`.

**El simulador mantiene sus cuentas en memoria y las reinicia al cerrar el proceso.** Reiniciarlo no simula la durabilidad del Banco Central real. No lo reinicies con movimientos pendientes. Después de reiniciarlo, sincroniza el cajero desde el panel antes de repetir una demostración. No se ejecuta con `NODE_ENV=production` ni se usa como respaldo automático si el banco real falla.

## Integración real sin reutilizar la demostración

El contrato central disponible están en [docs/central-contract.md](docs/central-contract.md). NODE1 ya ofrece identidad, recuperación por clave y comprobantes persistentes. URL real: `https://banco-central-nodo1.onrender.com/api`. La aceptación de NODE3 se registra con sus pruebas y el flujo Postman conjunto.

Para ejecutar también la integración local, prepara una configuración independiente:

```bash
npm run setup:integration -- --central-url=https://banco-central-nodo1.onrender.com
```

Crea `.env.integration` y `.local-admin.integration.txt` privados e ignorados por Git, con secretos nuevos y sin API Key simulada. No modifica `.env` ni la base existente. Usa un PostgreSQL y volumen separados en **55435**, y NODE3 en **3004** para convivir con la demostración en 3003.

```bash
docker compose --env-file .env.integration up -d postgres-integration
npm run start:integration
```

Entra a `http://localhost:3004/admin` con las credenciales de `.local-admin.integration.txt` y registra la API Key real. No pegues esa clave en documentación, Git ni el navegador de clientes. Si falta `/api/nodes/me`, el panel informará que el contrato central sigue pendiente. No se sustituye el banco real por el simulador ante errores.

Para detener la base conservando el volumen: `docker compose --env-file .env.integration stop postgres-integration`. En Render se utiliza el servicio PostgreSQL propio definido en `render.yaml`, sin datos del simulador local.

## Configuración y seguridad

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Base PostgreSQL exclusiva de NODE3 |
| `BANCO_CENTRAL_URL` | Origen o URL base de NODE1; se normaliza a un solo `/api`; HTTPS en producción |
| `APP_URL` | Origen público propio opcional; en Render se usa automáticamente `RENDER_EXTERNAL_URL` para validar formularios detrás del proxy |
| `BANCO_CENTRAL_API_KEY` | Configuración inicial opcional; no sustituye la clave guardada en cada reinicio |
| `ADMIN_USERNAME` | Usuario técnico; por defecto `tecnico` |
| `ADMIN_PASSWORD_HASH` | Hash `scrypt` de la contraseña administrativa |
| `SESSION_SECRET` | Secreto de al menos 32 caracteres para firmar sesiones |
| `CONFIG_ENCRYPTION_KEY` | 32 bytes hexadecimales para cifrar la API Key con AES-256-GCM |
| `CENTRAL_TIMEOUT_MS` | Espera central; por defecto 10,000 ms |
| `PORT` | Puerto del servicio; por defecto 3003, asignado por Render en nube |
| `LOCAL_DATABASE_PASSWORD` | Contraseña del contenedor de desarrollo |
| `MOCK_CENTRAL_API_KEY` | Solo para el simulador local |

El panel valida la identidad, estado y efectivo del cajero mediante `/api/nodes/me`. Las garantías financieras del contrato se comprueban con las pruebas conjuntas; no se deducen de flags de capacidades. No permite sustituir la identidad del cajero después de configurarlo. La rotación debe conservar el mismo ID central. Se permite incluso con una operación pendiente para recuperar un débito con la nueva clave, sin sincronizar ni liberar el efectivo reservado.

Las sesiones administrativas se guardan en PostgreSQL y caducan a los 30 minutos. Las cookies son HttpOnly y SameSite=Strict, con Secure en producción. Los formularios administrativos validan CSRF. La aplicación aplica límites de solicitudes y cabeceras de seguridad; los mensajes no muestran respuestas centrales crudas ni secretos.

Mantén estable `CONFIG_ENCRYPTION_KEY`: cambiarla impide descifrar la API Key guardada. Una operación incierta no puede liberarse desde el panel para eludir la confirmación del Banco Central.

## Operaciones y recuperación

1. NODE3 valida cuenta, importe y UUID de idempotencia.
2. Bloquea la fila del cajero dentro de una transacción PostgreSQL y registra la operación. Un retiro sin efectivo se rechaza aquí, sin contactar al banco.
3. Permite un solo movimiento pendiente por cajero. El efectivo de un retiro pendiente queda reservado; no puede gastarse de nuevo.
4. Envía el movimiento al banco con la misma clave en el campo JSON `idempotency_key` (la cabecera `Idempotency-Key` se conserva únicamente en la API pública de NODE3).
5. Una aprobación verificada actualiza efectivo y comprobante local en una transacción. Un rechazo definitivo libera la reserva.
6. Timeout, respuesta incompatible o fallo local después de una aprobación mantienen el movimiento pendiente.
7. Al arrancar, consultar el resultado o usar el panel, NODE3 busca el movimiento por su clave original. Solo lo reenvía si el banco responde explícitamente `OPERATION_NOT_FOUND`.

**No se consulta saldo para luego descontarlo por separado.** NODE3 muestra el saldo al cliente, pero es NODE1 quien debe validar fondos, efectivo y cuenta activa dentro de la misma transacción que actualiza el saldo y crea el historial.

El navegador conserva la clave y los datos de la solicitud en el almacenamiento de esa pestaña mientras espera confirmación. Los importes se envían como texto decimal y se manejan internamente como centavos enteros. No cierres la pestaña para iniciar otra operación si el resultado sigue pendiente; el técnico puede recuperarlo desde el panel.

## API y ejemplos

La especificación de NODE3 está en [openapi.json](openapi.json). Se puede importar en Postman o Swagger Editor. `npm run docs` la regenera desde su fuente.

| Método y ruta | Función |
| --- | --- |
| `GET /health` | Salud del servicio y su PostgreSQL |
| `GET /api/atm` | Estado público; sin inventario ni credenciales |
| `GET /api/accounts/:numero/saldo` | Saldo central de una cuenta activa |
| `POST /api/retiros` | Retiro; requiere `Idempotency-Key` UUID |
| `POST /api/depositos` | Depósito; requiere `Idempotency-Key` UUID |
| `GET /api/operaciones/:id` | Resultado y recuperación del mismo movimiento |

Ejemplo de retiro desde una terminal, con una clave nueva por movimiento y la misma clave en sus reintentos:

```bash
curl -X POST http://localhost:3003/api/retiros \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 13cf9711-ef0a-4b58-b991-c1bdfd69cf53' \
  -d '{"numero_cuenta":"10001","monto":"300.00"}'
```

`200` confirma éxito; `202` indica resultado pendiente; `422` puede devolver una operación rechazada en `data`. Los errores previos a crear la operación se devuelven en `error`, con `code` y `message`. Reutilizar una clave con otros datos devuelve `409`.

Las rutas `/admin/*` son formularios HTML protegidos, no una API pública de configuración.

## Pruebas

Las pruebas unitarias y del adaptador HTTP se ejecutan con `npm test`. Para incluir la integración completa debes proporcionar **una base de pruebas dedicada**, no `DATABASE_URL` de producción:

```bash
TEST_DATABASE_URL=postgresql://usuario:clave@127.0.0.1:5432/atm_test npm test
```

Las pruebas crean un esquema aleatorio propio dentro de esa base y eliminan solo ese esquema al terminar. Si falta `TEST_DATABASE_URL`, la suite de integración se marca como omitida; ese resultado no demuestra la integración financiera.

Se verifica el contrato Laravel (incluidos 201/200, clave en JSON, errores antiguos y comprobantes incompletos), el flujo $1,000 → $300 → $700, depósitos, efectivo insuficiente, cuenta bloqueada, claves duplicadas, concurrencia, pérdida de respuesta, timeout real, datos centrales incompatibles, recuperación tras recrear el servicio, sesiones y protección del panel.

GitHub Actions ejecuta la suite con PostgreSQL 17 y Node 24.19.0, verifica dependencias de producción y despliega el commit aprobado a Render. El secreto `RENDER_DEPLOY_HOOK_URL` vive exclusivamente en GitHub Actions. No es necesario ampliar el acceso de la aplicación de GitHub para desplegar este repositorio público.

## Despliegue en Render

1. Publica la rama revisada en el repositorio de NODE3 y conecta ese repositorio desde **New → Blueprint** en Render.
2. Selecciona `main`, que contiene `render.yaml`; el archivo crea **un Web Service gratuito y un PostgreSQL gratuito**, ambos en Oregon.
3. Completa `BANCO_CENTRAL_URL`, `ADMIN_PASSWORD_HASH` y `CONFIG_ENCRYPTION_KEY` en el formulario privado. Puedes obtener hash y clave de una configuración privada generada con `setup:local`; no subas `.env` ni la contraseña a Git. Render genera `SESSION_SECRET` y conecta `DATABASE_URL` internamente.
4. Guarda el Deploy Hook del servicio en el secreto GitHub `RENDER_DEPLOY_HOOK_URL`. El workflow despliega cada push a `main` después de pasar las pruebas. Espera el despliegue. Verifica `/health` y entra al panel para registrar la API Key real del cajero.
5. Completa la demostración integrada con NODE1 y NODE2. Registra aquí la URL real, sin inventarla:

   **URL de NODE3: https://node3-atm.onrender.com**

La cuenta Render debe tener disponible su cupo de una base PostgreSQL gratuita. El servicio gratuito se suspende tras 15 minutos de inactividad y tarda en despertar. **La base gratuita caduca a los 30 días**; planifica la demostración dentro de esa ventana o exporta/restaura antes de la caducidad. Exportación desde un cliente con acceso autorizado: `pg_dump "$DATABASE_URL" --format=custom --file=backups/node3.dump`; restauración en una base nueva y vacía: `pg_restore --dbname="$DATABASE_URL" backups/node3.dump`. Los respaldos contienen datos privados y deben mantenerse fuera de Git. La conexión externa para respaldos requiere habilitar temporalmente una IP autorizada en Render, ya que el Blueprint bloquea acceso externo por defecto.

Render no conserva archivos locales del Web Service entre reinicios. Por eso el efectivo, las operaciones y las sesiones se guardan en PostgreSQL.

**Infraestructura acordada con el profesor:** Render es el despliegue principal; Vercel y Coolify son opcionales.

Fuentes: [Express 5](https://expressjs.com/en/guide/migrating-5/), [Express en Render](https://render.com/docs/deploy-node-express-app), [límites gratuitos](https://render.com/docs/free), [Blueprints](https://render.com/docs/blueprint-spec).

## Demostración conjunta

1. NODE1 crea un cajero activo, asigna efectivo y entrega su API Key.
2. El técnico de NODE3 verifica y guarda esa clave desde el panel.
3. NODE2 crea una cuenta con saldo inicial de **$1,000**.
4. NODE3 consulta esa cuenta y realiza un retiro de **$300**.
5. NODE1 muestra **$700** y una sola transacción global, protegida contra modificación.
6. NODE3 muestra el comprobante y **$300 menos de efectivo disponible**.

No se presenta la prueba contra el simulador como integración real con Supabase. La validación de RLS y de la inmutabilidad global corresponde al Banco Central.

## Postman conjunto

Importar [colección de los tres nodos](postman/tres_nodos_render.postman_collection.json) y [entorno Render sin secretos](postman/tres_nodos_render.postman_environment.json). Completar en un entorno privado las dos API Keys y las credenciales del técnico. Activar `permitir_operaciones=true` para la demostración autorizada.

Las carpetas 00–03 crean una cuenta nueva de $1,000, retiran $300 desde NODE3 y mantienen su saldo en $700. El depósito de $50.15 usa otra cuenta, sin alterar la cuenta de la demostración. El inventario local se verifica mediante la sesión técnica; no se expone al cliente público. La carpeta 04 reutiliza los identificadores después de reiniciar Render y no crea movimientos.
