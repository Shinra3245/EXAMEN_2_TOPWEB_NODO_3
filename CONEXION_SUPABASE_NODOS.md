# Conexión de los nodos con Supabase

## Estado actual

Supabase está configurado en la organización **EXAMEN**, proyecto **Banco Central**.

- Referencia: `rtfdnrwcjwovpplmfthc`.
- URL de Supabase: `https://rtfdnrwcjwovpplmfthc.supabase.co`.
- Tablas: `bank_admins`, `bank_nodes`, `users_accounts` y `transactions`.
- RLS activo; el acceso directo a las tablas está bloqueado para `anon` y `authenticated`.
- El historial tiene protección contra edición, borrado y truncado.

**Pendiente:** implementar Laravel en el Nodo 1, crear los nodos y sus API Keys, y proporcionar la URL de la API bancaria.

## Cómo debe conectarse cada nodo

**Nodo 1 — Banco Central:** conecta Laravel con Supabase. La configuración está en el archivo privado `NODE1/.env.supabase.local`, con las variables `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_DB_PASSWORD`. La clave secreta activa se llama `laravel_core`. Se utiliza exclusivamente en el servidor del Banco Central.

**Nodo 2 — Sucursal y Nodo 3 — Cajero:** sus backends llaman a la API de Laravel del Nodo 1. El Banco Central realiza las operaciones en Supabase. Cada nodo recibirá su propia API Key; las claves secretas de Supabase y la contraseña de PostgreSQL se mantienen en el Nodo 1.

Variables que deberán configurar en el servidor de cada sucursal o cajero:

```dotenv
# URL de la API de Laravel, incluida su ruta base. Pendiente de proporcionar.
BANCO_CENTRAL_URL=
# Clave exclusiva de esta sucursal o cajero. Pendiente de generar en el Nodo 1.
BANCO_CENTRAL_API_KEY=
```

Cabecera prevista en el borrador OpenAPI:

```http
X-API-KEY: <clave_exclusiva_del_nodo>
Content-Type: application/json
```

La URL de Supabase identifica el servicio de datos; `BANCO_CENTRAL_URL` identifica la API bancaria que desarrollará Laravel. La clave publicable de Supabase no permite acceder a las tablas bancarias con los permisos actuales.

## Para los agentes de IA

1. Solicitar al agente del Nodo 1 la URL real, la API Key propia y el OpenAPI definitivo. El contrato actual es un borrador; no presentar rutas ni respuestas propuestas como implementadas.
2. Guardar las variables en el backend y excluir los archivos `.env` de Git. Las API Keys de nodos tampoco se incluyen en el JavaScript del navegador.
3. La sucursal crea cuentas y consulta historial/reportes mediante el Banco Central. El cajero consulta saldos, deposita y retira mediante el mismo servicio.
4. El cajero verifica primero su efectivo local y lo descuenta tras la confirmación del retiro central. Coordinar el tratamiento de errores y reintentos con el Nodo 1 para evitar movimientos duplicados.
5. No volver a ejecutar el SQL de creación sobre las tablas existentes. Los cambios de esquema se coordinan con el Nodo 1.

La prueba conjunta pendiente es: abrir una cuenta con **$1,000**, retirar **$300** y verificar **$700** en el Banco Central.

