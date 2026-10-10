# Respaldo del cajero

La base gratuita vence el **8 de noviembre de 2026**, según su panel. El plan gratuito no incluye respaldos administrados: se exporta con `pg_dump`. Referencia: [Render](https://render.com/docs/postgresql-backups).

## Archivos privados

El respaldo está fuera de Git en `/home/omarbolanos/.local/share/examen-topweb/respaldos/`, con directorios 700 y archivos privados 600. Incluye:

- `nodo3-render-public.dump`: esquema y datos, formato custom de PostgreSQL 17.
- `nodo3-config-render.env`: configuración, clave de cifrado, sesión y autenticación técnica.
- `nodo3-admin-privado.txt` y `nodo3-clave-central.env`: acceso técnico y conexión del mismo cajero.
- `manifest.json`: fecha, tamaño y SHA-256; `production-state.json`: estado de referencia.

La evidencia pública de restauración está en `evidencias/respaldo_nodo3_verificado.json`. Dump y credenciales se excluyen del ZIP y de GitHub. Guardar una segunda copia privada en otro medio si se necesita protección frente a la pérdida de esta computadora.

## Exportar nuevamente

1. Confirmar ausencia de pendientes y coordinar que nadie use el ATM durante el respaldo.
2. En Render permitir temporalmente solo la IP del equipo exportador, rango `/32`, y obtener la conexión externa de forma privada. No habilitar `0.0.0.0/0`.
3. Con cliente PostgreSQL 17, configurar privadamente `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` y `PGSSLMODE=require`:

   ```bash
   umask 077
   pg_dump --format=custom --schema=public --no-owner --no-privileges --file=nodo3-render-public.dump
   sha256sum nodo3-render-public.dump
   ```

4. Conservar la misma clave de cifrado y sesión junto con el dump. Al terminar retirar la regla temporal de acceso externo.

## Restaurar

Usar exclusivamente una base vacía PostgreSQL 17, independiente de Render y del Central. Con las variables PG apuntando al destino:

```bash
pg_restore --exit-on-error --clean --if-exists --no-owner --no-privileges --dbname="$PGDATABASE" nodo3-render-public.dump
```

`--clean --if-exists` prepara los objetos del destino, incluido el esquema `public`; usarlo solo en la base vacía de restauración. Comparar inventario, operaciones, comprobantes y configuración; comprobar que la API Key se descifra con la clave conservada. La verificación se realizó en una base local aislada y no modificó producción.

Para reemplazar una base expirada, restaurar en un destino vacío, mantener `CONFIG_ENCRYPTION_KEY` y actualizar `DATABASE_URL`. Antes de habilitarlo comparar efectivo y último resultado con el Central: una copia antigua puede estar detrás de movimientos posteriores. No ejecutar operaciones financieras desde la copia de ensayo ni restaurar sobre el ledger central.
