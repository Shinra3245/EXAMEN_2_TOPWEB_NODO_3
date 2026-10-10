# Contrato de integración NODE1 ↔ NODE3

**Aceptación real de NODE3 completada:** 46 solicitudes / 49 aserciones Postman, sin fallos, incluido reinicio de Render. Ver [reporte](../ENTREGA_INTEGRACION.md).

**Estado: implementado y desplegado en NODE1**, verificado con el Core `7fc14e3` y NODE2 `fae8349`. URL: `https://banco-central-nodo1.onrender.com/api`.

## Contrato central disponible

| Ruta | Contrato disponible |
| --- | --- |
| `GET /api/accounts/{numero_cuenta}` | Cuenta en la raíz; conserva cuentas compartidas entre nodos |
| `POST /api/transactions` | Clave en JSON; 201 nuevo / 200 repetido; comprobante y saldos originales para cajeros |
| `GET /api/transactions` | Historial financiero paginado del nodo autenticado |
| `GET /api/nodes/me` | Identidad activa, tipo y efectivo actual |
| `GET /api/transactions/by-idempotency-key/{clave}` | Resultado persistente del mismo nodo; 404 `OPERATION_NOT_FOUND` autoriza reenvío |

La autenticación mantiene 401 con `error` de texto. Los rechazos ATM persistidos usan el objeto estructurado y la misma clave definidos abajo. Un error de autenticación, conflicto, red o servidor nunca libera una reserva incierta.


## Compatibilidad obligatoria con NODE2

La referencia es `NODE2/services/centralApi.js`. Las ampliaciones de este documento son **aditivas**, no sustituyen los contratos compartidos. Mantener las siguientes interfaces:

| Interfaz existente que consume NODE2 | Comportamiento que debe conservar NODE1 |
| --- | --- |
| `POST /api/accounts` | Misma petición y respuesta 201 `{message, account}`. `account` mantiene `numero_cuenta`, `nombre_titular`, `saldo_global` y `estado`. Aceptar `saldo_inicial` numérico, incluido cero. Mantener validaciones 422 y respuestas de error existentes. |
| `GET /api/accounts/{numero_cuenta}` | Cuenta directamente en la raíz, sin envolver en `data`; 404 si no existe. No limitar la consulta a la sucursal que abrió la cuenta: NODE3 debe consultar cuentas creadas por NODE2. |
| `GET /api/transactions` | Historial financiero del nodo autenticado con filtro `cuenta`, parámetro `page`, lista `data`, `next_page_url` y `last_page`. Conservar `idempotency_key`, `tipo`, cuentas, `monto` y `created_at` en cada movimiento. |
| Autenticación y errores compartidos | Mantener `X-API-KEY` y los errores existentes: `error` de texto, `message` de texto o `errors` de validación. NODE2 convierte un objeto `error` en `[object Object]`; no reemplazar globalmente su formato por el error estructurado del ATM. |

Reglas para evitar regresiones:

- **UUID solo en NODE3.** NODE2 envía claves centrales `sucursal:<hash de 16 caracteres>:<clave del intento>`. Mantener en NODE1 `idempotency_key` como texto de hasta 255 caracteres; no imponer UUID global, quitar el prefijo, cambiar claves existentes ni exigir `Idempotency-Key` al cliente central.
- NODE2 recupera aperturas repetidas mediante `GET /accounts/{numero}` y el historial paginado, después de 422/500/503. No sustituir esos resultados por 202 pendiente o por otros códigos en la apertura sin coordinar un cambio de NODE2. No eliminar ni renombrar la clave del depósito inicial.
- La apertura con saldo positivo sigue registrándose como `deposito` de la **sucursal**. Con saldo cero, no insertar un movimiento ficticio. Las nuevas garantías de recuperación del ATM no obligan a NODE2 a enviar campos o efectuar consultas adicionales.
- Agregar campos raíz a una respuesta exitosa conservando todos los existentes es compatible con el adaptador revisado de NODE2. No mover `account`, el saldo o la lista paginada dentro de otra envoltura.
- Aplicar el control y actualización de efectivo ATM **solo** cuando el nodo autenticado sea `cajero` y el movimiento sea retiro/depósito. Conservar las operaciones de sucursal y transferencia actuales; no exigir que todo cliente de la API sea un cajero.
- `GET /nodes/me` es una ruta adicional. Puede identificar sucursales y cajeros; NODE3 comprueba por su cuenta `tipo: cajero`. NODE2 puede continuar comprobando conexión mediante `GET /transactions?page=1`.
- Los rechazos recuperables, estados pendientes y saldos originales se almacenan separados del ledger financiero inmutable. No introducir esos resultados como depósitos/retiros ficticios en `GET /transactions`, ni alterar depósitos de apertura históricos.
- Los errores estructurados y estados del ATM definidos abajo corresponden a sus operaciones y rutas nuevas. Mantener intactos los errores de cuentas, autenticación e historial que consume NODE2. Los errores 409 de transacciones deben conservar `message` de texto al añadir un código.

### Aceptación de compatibilidad

Además de las pruebas del ATM, el responsable de NODE1 debe ejecutar contra su implementación ampliada: conexión de NODE2; apertura 1000.00; apertura 0.00 sin depósito; reintento y recuperación de apertura con la misma clave; consulta de cuenta; historial de más de una página; reportes; errores 401/404/422; aislamiento por nodo.

En el flujo conjunto, la apertura de 1000.00 pertenece al historial de NODE2; el retiro de 300.00 pertenece al de NODE3. Ambos consultan saldo 700.00. El depósito de apertura no modifica el efectivo asignado al ATM. El retiro reduce únicamente el efectivo del cajero responsable, una sola vez.

## Convenciones

- NODE3 usa exclusivamente HTTP(S) y `X-API-KEY`. No recibe credenciales de Supabase ni manipula sus tablas.
- La URL configurada puede ser el origen o terminar en `/api`; NODE3 la normaliza a un solo sufijo `/api`. Producción e integración real exigen HTTPS.
- NODE3 envía dinero como texto decimal exacto: `"300.00"`; conservar también los importes numéricos aceptados de NODE2; máximo `NUMERIC(15,2)`. NODE3 usa centavos enteros y acepta respuestas numéricas válidas con hasta dos decimales. NODE1 debe evitar aritmética monetaria de coma flotante.
- Números de cuenta como texto, conservando ceros iniciales.
- La clave generada por NODE3 es un UUID único por movimiento; esta validación no se aplica a las claves con prefijo de NODE2. El navegador entrega `Idempotency-Key` a NODE3; NODE3 la transforma en `idempotency_key` dentro del JSON enviado a NODE1. La API central no necesita leer esa cabecera.
- Errores nuevos de operaciones ATM y recuperación: `{ "error": { "code": "...", "message": "..." } }`; no reemplazar globalmente los errores existentes de NODE2. Los mensajes visibles los controla NODE3.

## 1. Identidad y efectivo: GET /api/nodes/me

El middleware identifica el nodo exclusivamente por su API Key. Respuesta 200:

```json
{
  "data": {
    "id": "d6f9d760-e639-46ed-8dfb-74263740fdbe",
    "nombre": "Cajero Centro",
    "tipo": "cajero",
    "activo": true,
    "efectivo_disponible": "5000.00"
  }
}
```

NODE3 exige un cajero activo y efectivo válido. No exige campos `capabilities`: declarar flags no prueba atomicidad ni idempotencia; esas garantías deben verificarse con pruebas conjuntas. La ausencia de esta ruta impide configurar NODE3 y se informa como `CENTRAL_CONTRACT_PENDING`.

La ruta no restringe globalmente a los clientes de la API a `tipo: cajero`: esa comprobación la realiza NODE3 para su propia configuración.

Esta consulta entrega efectivo **actual**, no una asignación inicial constante. Un reinicio local conserva configuración, efectivo, sesiones y pendientes en PostgreSQL propio. La sincronización administrativa solo se permite sin pendientes y con el mismo ID central. Rotar la API Key debe conservar ese ID. Con un pendiente se permite guardar la clave verificada del mismo cajero, manteniendo efectivo y reserva anteriores hasta recuperar el resultado.

## 2. Cuenta: GET /api/accounts/{numero_cuenta}

Se conserva la respuesta actual de NODE1, sin `data`:

```json
{
  "numero_cuenta": "10001",
  "nombre_titular": "Cliente de demostración",
  "saldo_global": "1000.00",
  "estado": "activa"
}
```

Cuenta ausente: 404. Cuenta bloqueada: conservar la cuenta con `estado: "bloqueada"` en la respuesta 200 compartida; NODE3 interpreta ese estado. No sustituir esa consulta por un error nuevo que cambie el comportamiento de NODE2. Mostrar un saldo no autoriza un retiro posterior: NODE1 vuelve a validar dentro de la transacción financiera.

## 3. Movimiento: POST /api/transactions

Retiro:

```json
{
  "tipo": "retiro",
  "cuenta_origen": "10001",
  "monto": "300.00",
  "idempotency_key": "13cf9711-ef0a-4b58-b991-c1bdfd69cf53"
}
```

Depósito: `tipo: "deposito"`, `cuenta_destino: "10001"` y ninguna cuenta origen.

Para movimientos del cajero, conservar `message` y `transaction` en la raíz y **añadir** `status`, `saldo_global` y `efectivo_disponible`. Mantener el comportamiento existente de sucursales y transferencias; no exigir esos campos en `POST /accounts`. Responder 201 para una operación nueva y 200 para una repetición:

```json
{
  "message": "Transacción exitosa",
  "status": "succeeded",
  "transaction": {
    "id": "c5f2d481-6f35-4281-afc0-1752989ab315",
    "nodo_id": "d6f9d760-e639-46ed-8dfb-74263740fdbe",
    "tipo": "retiro",
    "cuenta_origen": "10001",
    "cuenta_destino": null,
    "monto": "300.00",
    "idempotency_key": "13cf9711-ef0a-4b58-b991-c1bdfd69cf53",
    "created_at": "2026-10-09T18:00:00Z"
  },
  "saldo_global": "700.00",
  "efectivo_disponible": "4700.00"
}
```

NODE3 verifica nodo, tipo, cuenta, importe, clave, ID, fecha y ambos importes resultantes antes de confirmar. Una respuesta antigua sin confirmación completa queda pendiente; no se sustituye por una consulta del saldo actual, porque otras operaciones pueden haberlo cambiado.

La primera confirmación debe incluir `created_at` generado por la base de datos; cargarlo antes de serializar, ya que el modelo actual no asigna timestamps.

El resultado debe guardar los saldos originales de la operación y devolverlos en reintentos/consultas. No calcularlos nuevamente desde el saldo actual.

Solo para el protocolo de operaciones ATM, en proceso: 202 con `{ "status": "pending" }`. Rechazo definitivo persistido: 422 en POST o 200 en consulta, con la misma clave:

```json
{
  "status": "rejected",
  "idempotency_key": "13cf9711-ef0a-4b58-b991-c1bdfd69cf53",
  "error": { "code": "INSUFFICIENT_FUNDS", "message": "Fondos insuficientes" }
}
```

Rechazos de negocio reconocidos: `INSUFFICIENT_FUNDS`, `INSUFFICIENT_CASH`, `ACCOUNT_BLOCKED`, `ACCOUNT_NOT_FOUND`, `VALIDATION_ERROR`. Autenticación, conflictos de clave, respuestas incompletas, errores desconocidos y 5xx mantienen pendiente un movimiento incierto.

## 4. Recuperación: GET /api/transactions/by-idempotency-key/{clave}

La consulta se limita al nodo autenticado:

- Confirmada: 200, el mismo comprobante raíz del POST.
- Pendiente: 200 o 202 con `{ "status": "pending" }`.
- Rechazada: 200 con el rechazo persistido y su `idempotency_key`.
- Inexistente: 404 con `{ "error": { "code": "OPERATION_NOT_FOUND", "message": "Operación no encontrada" } }`.

Solo ese último resultado permite reenviar **el mismo cuerpo y la misma clave**. Un 404 genérico, HTML, 401/403, timeout o 5xx no permite reenviar ni liberar la reserva. Si el reenvío devuelve un rechazo, NODE3 vuelve a consultar para confirmar el resultado durable antes de liberar una reserva anterior.

No deducir ausencia buscando en páginas del historial. Conservar los registros de idempotencia durante toda la vida de los datos de demostración.

## 5. Garantías que implementa NODE1

Dentro de una transacción PostgreSQL o procedimiento autorizado:

1. Tomar `nodo_id` de `authenticated_node`; no aceptarlo del cliente. Conservar permisos y operaciones existentes de sucursales y transferencias; aplicar reglas de efectivo ATM solo a retiros/depósitos de un nodo `cajero`.
2. Registrar/excluir la clave de idempotencia y asociarla al nodo y una huella del tipo, cuenta e importe. Conservar la unicidad global existente, la validación del propietario y las claves textuales con prefijo de NODE2; nunca revelar el resultado de otro nodo.
3. Una repetición idéntica devuelve el resultado original; cambios de datos o propietario devuelven 409 `IDEMPOTENCY_CONFLICT`.
4. Bloquear las filas necesarias y validar cuenta activa y saldo. Para retiros/depósitos del cajero, validar también su efectivo y actualizar saldo, efectivo, historial y resultado recuperable de manera atómica; no añadir esta condición a aperturas u operaciones de sucursal.
5. Resolver también carreras de solicitudes con la misma clave: una restricción única no debe convertirse en un 400 ambiguo; el perdedor recupera el resultado original.
6. Persistir los rechazos definitivos del ATM sin alterar saldos ni insertar movimientos financieros ficticios. Solo un depósito aprobado del cajero suma tanto al saldo de cuenta como al efectivo de ese cajero; el depósito de apertura de una sucursal conserva su comportamiento actual.

La reserva local de NODE3 protege su propio inventario; no sustituye estas garantías centrales. Las recargas/correcciones de efectivo desde administración deben coordinarse sin movimientos pendientes del cajero; no sobrescribir inventario mientras se recupera un comprobante anterior.

### Estado actualizado después del pull de NODE1

**Ya resuelto:** `nodo_id` en transacciones; `sucursal_id` en cuentas; apertura como `deposito`; escritura de efectivo en `efectivo_disponible` (el nombre `efectivo_asignado` del formulario se traduce correctamente); comparación de nodo/tipo/cuentas/importe al repetir claves; bloqueo central por clave; aritmética decimal exacta e historial filtrado por nodo.

**Pendiente para el contrato ATM:** rutas `nodes/me` y consulta por clave; confirmaciones con estado y saldos originales; resultados de rechazo durables con códigos; actualización atómica de efectivo del cajero; garantía de `created_at` en la primera respuesta.

No se modificó NODE1 ni NODE2 ni se ejecutaron sus migraciones. No presentar los errores anteriores como pendientes después del pull. El responsable debe confirmar que la versión desplegada corresponde al código revisado.

## 6. Entrega y aceptación conjunta

NODE1 proporciona URL HTTPS efectiva, API Key e ID del cajero activo con efectivo asignado y confirmación de estas extensiones. NODE2 proporciona una cuenta de prueba con 1000.00. Configurar integración separada siguiendo README, sin reutilizar los datos del simulador.

Comprobar: consulta 1000.00, retiro 300.00, saldo 700.00, efectivo reducido en 300.00 y una sola transacción; depósito; saldo/efectivo insuficientes; cuenta bloqueada; API Key inválida; concurrencia; conflictos de clave; respuesta perdida; reinicio y recuperación. Verificar además que el historial global es inmutable según el examen (responsabilidad NODE1).

El simulador incluido prueba NODE3 con el contrato acordado. No demuestra que NODE1 ni Supabase lo cumplan. La aceptación del cajero se registra en el reporte de integración y la colección Postman; las pruebas del simulador se mantienen separadas de las pruebas reales.

## 7. Evidencia de revisión de compatibilidad

Revisión local del 9 de octubre de 2026, sobre las versiones indicadas al inicio:

- 36 pruebas existentes de NODE2 aprobadas en una copia temporal, con sus dependencias del lockfile y un Central simulado aislado.
- Las mismas 36 pruebas aprobadas al añadir campos raíz a respuestas exitosas, conservando la cuenta, `account`, el historial y la paginación. Se comprobó además que las aperturas siguen enviando claves con prefijo `sucursal:` y saldo inicial numérico.
- Tres controles negativos reprodujeron las incompatibilidades que esta guía prohíbe: validación UUID global rechaza una apertura válida; `error` como objeto produce `[object Object]`; envolver nuevamente el historial rompe conexión y consulta de movimientos.
- No se modificaron archivos de NODE1/NODE2, ni se utilizaron API Keys reales, Render o Supabase. La copia y los instrumentos de prueba son temporales; no forman parte de sus repositorios.

Esta evidencia verifica el comportamiento del consumidor NODE2 frente a esos formatos. No prueba la implementación futura de NODE1, su actualización de efectivo o sus nuevos registros de recuperación. Antes de desplegar el Core ampliado, ejecutar la aceptación conjunta de esta guía y la regresión original de NODE2 contra un entorno autorizado de integración.
