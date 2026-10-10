# Flujo conjunto de los tres nodos

- Banco Central: https://banco-central-nodo1.onrender.com
- Sucursal: https://sucursal-nodo2.onrender.com
- Cajero: https://node3-atm.onrender.com

Importar `postman/tres_nodos_render.postman_collection.json` y `postman/tres_nodos_render.postman_environment.json` en Postman. Las URL ya están configuradas; el entorno público no contiene secretos.

En un entorno privado completar `sucursal_api_key`, `cajero_api_key`, `admin_username` y `admin_password`. Las credenciales del técnico están en el archivo privado `.local-admin.render.txt` de `NODE3_INTEGRACION`; las claves de los nodos están en `NODE1/.env.nodos.local`. Mantenerlas fuera de capturas, Git y exportaciones compartidas.

## Ejecutar

1. Abrir Collection Runner y seleccionar las carpetas 00–03, una iteración y detener ante errores. Activar `permitir_operaciones=true` únicamente para ejecutar esta demostración autorizada.
2. La carpeta 00 verifica los servicios, la API Key del cajero, su configuración y la sesión técnica. Se requiere efectivo inicial superior a $1,000 para distinguir la prueba de fondos insuficientes de la prueba de efectivo insuficiente. Si no hay esa cantidad, coordinar una recarga en el Banco Central y sincronizar el cajero sin pendientes antes de ejecutar.
3. La carpeta 01 crea en la sucursal una cuenta de $1,000, consulta el saldo desde el cajero y retira $300 mediante `POST /api/retiros`. Comprueba $700 en los tres nodos, un solo retiro, la disminución de efectivo y la separación de historiales.
4. La carpeta 02 prueba reintentos, conflictos y rechazos. El retiro sin efectivo se rechaza localmente y no aparece como una operación central.
5. La carpeta 03 abre otra cuenta con saldo cero y deposita $50.15 desde el cajero, sin doble crédito. La cuenta principal conserva $700 para presentar el examen.
6. Conservar las variables obtenidas y las cookies de la sesión técnica. Reiniciar el servicio del cajero en Render y ejecutar solo la carpeta 04. Comprueba los mismos comprobantes, saldo, efectivo y sesión almacenados en PostgreSQL. No volver a ejecutar la carpeta 00: genera identificadores nuevos.

Los movimientos de demostración quedan registrados en el historial inmutable. Nunca borrar ni editar ese historial para repetir una prueba. Cada ejecución completa genera cuentas y claves nuevas.

## Rutas reales del cajero

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/health` | Servicio, PostgreSQL y commit desplegado |
| GET | `/api/atm` | Disponibilidad; no expone inventario ni claves |
| GET | `/api/accounts/{numero}/saldo` | Cuenta en `data`, saldo como texto decimal |
| POST | `/api/retiros` | JSON `{numero_cuenta, monto:"300.00"}` y cabecera `Idempotency-Key` UUID |
| POST | `/api/depositos` | Mismo contrato; importe exacto decimal |
| GET | `/api/operaciones/{id}` | Comprobante persistente o recuperación de pendiente |
| GET | `/admin` | Inventario y pendientes; requiere sesión técnica |

El cajero responde `200 data.status=succeeded`, `202 pending` o `422 rejected`. Una pérdida de respuesta conserva la reserva. La recuperación usa la misma clave y solo reenvía cuando el Banco Central confirma `OPERATION_NOT_FOUND`. La rotación de API Key conserva la identidad; con un pendiente, permite recuperar sin modificar la reserva.

## Despliegue continuo

Cada push a `main` del Nodo 3 ejecuta las pruebas con PostgreSQL y la auditoría de dependencias. Si pasan, GitHub Actions solicita a Render desplegar ese commit mediante un Deploy Hook guardado como secreto. La configuración, el efectivo, las operaciones y las sesiones están en PostgreSQL propio; los reinicios del servicio conservan esos datos.

La base gratuita de Render expira a los 30 días. Registrar su fecha real de vencimiento en el reporte de entrega y preparar un respaldo antes si el examen será posterior.
