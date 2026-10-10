import { writeFile } from 'node:fs/promises';
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const json = schema => ({ 'application/json': { schema } });
const response = (description, schema = ref('ErrorEnvelope')) => ({ description, content: json(schema) });
const envelope = schema => ({ type: 'object', required: ['data'], properties: { data: schema } });
const opResponse = response('Operación local y su resultado central.', envelope(ref('Operation')));
const move = (summary, tipo) => ({
  summary, description: `Simulación de ${tipo}. No autentica al titular de la cuenta. Reutilizar la misma clave y el mismo cuerpo al reintentar.`,
  parameters: [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', format: 'uuid' } }],
  requestBody: { required: true, content: json(ref('MovementRequest')) },
  responses: {
    200: opResponse, 202: response('Confirmación pendiente; conservar clave e identificador.', envelope(ref('Operation'))),
    409: response('Cajero ocupado o clave reutilizada con otros datos.'),
    415: response('Se requiere application/json.'),
    422: { description: 'Validación o rechazo definitivo. El rechazo de una operación devuelve data; los errores previos devuelven error.', content: json({ oneOf: [envelope(ref('Operation')), ref('ErrorEnvelope')] }) },
    429: response('Límite de solicitudes.'), 503: response('Cajero sin configurar o almacenamiento no disponible.'),
  },
});
const spec = {
  openapi: '3.0.3',
  info: { title: 'NODE3 · Cajero automático', version: '1.0.0', description: 'API de simulación académica. El backend consume NODE1 con su API Key privada; no hay autenticación real del cliente.' },
  servers: [{ url: '/', description: 'Mismo origen que la aplicación' }],
  paths: {
    '/health': { get: { summary: 'Comprobar servicio y PostgreSQL propio', responses: {
      200: response('Disponible.', { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['ok'] } } }),
      503: response('No disponible.', { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['unavailable'] } } }),
    } } },
    '/api/atm': { get: { summary: 'Estado público, sin inventario ni secretos', responses: { 200: response('Estado del cajero.', envelope({ type: 'object', required: ['configured', 'available', 'mode'], properties: { configured: { type: 'boolean' }, available: { type: 'boolean' }, mode: { type: 'string', enum: ['simulacion'] } } })) } } },
    '/api/accounts/{numero}/saldo': { get: {
      summary: 'Consultar saldo central', parameters: [{ name: 'numero', in: 'path', required: true, schema: { type: 'string', maxLength: 255 } }],
      responses: { 200: response('Cuenta activa y saldo central.', envelope(ref('Account'))), 422: response('Cuenta inválida, bloqueada o inexistente.'), 502: response('Contrato central incompatible.'), 503: response('Banco Central no disponible o cajero sin configurar.') },
    } },
    '/api/retiros': { post: move('Retirar efectivo', 'retiro') },
    '/api/depositos': { post: move('Depositar efectivo', 'depósito') },
    '/api/operaciones/{id}': { get: {
      summary: 'Consultar y recuperar la misma operación', description: 'Si está pendiente, consulta el estado central. Solo reenvía el movimiento con la clave original cuando el banco responde OPERATION_NOT_FOUND. El ID es opaco y debe conservarse.',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: { 200: opResponse, 202: response('Resultado todavía pendiente.', envelope(ref('Operation'))), 404: response('Operación no encontrada.') },
    } },
  },
  components: { schemas: {
    Money: { type: 'string', pattern: '^\\d{1,13}\\.\\d{2}$', example: '300.00', description: 'Importe decimal exacto en MXN.' },
    Error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' } } },
    ErrorEnvelope: { type: 'object', required: ['error'], properties: { error: ref('Error') } },
    MovementRequest: { type: 'object', required: ['numero_cuenta', 'monto'], properties: { numero_cuenta: { type: 'string', minLength: 1, maxLength: 255, example: '10001' }, monto: { type: 'string', pattern: '^\\d{1,13}(?:\\.\\d{1,2})?$', example: '300.00', description: 'Mayor que cero; enviar como texto para conservar los centavos.' } } },
    Account: { type: 'object', required: ['numero_cuenta', 'nombre_titular', 'saldo_global', 'estado'], properties: { numero_cuenta: { type: 'string' }, nombre_titular: { type: 'string' }, saldo_global: ref('Money'), estado: { type: 'string', enum: ['activa'] } } },
    Receipt: { type: 'object', required: ['transaction_id', 'tipo', 'numero_cuenta', 'monto', 'saldo_global', 'efectivo_disponible', 'created_at'], properties: { transaction_id: { type: 'string' }, tipo: { type: 'string', enum: ['retiro', 'deposito'] }, numero_cuenta: { type: 'string' }, monto: ref('Money'), saldo_global: ref('Money'), efectivo_disponible: ref('Money'), created_at: { type: 'string', format: 'date-time' } } },
    Operation: { type: 'object', required: ['id', 'idempotency_key', 'tipo', 'numero_cuenta', 'monto', 'status', 'receipt', 'error', 'created_at'], properties: {
      id: { type: 'string', format: 'uuid' }, idempotency_key: { type: 'string', format: 'uuid' }, tipo: { type: 'string', enum: ['retiro', 'deposito'] }, numero_cuenta: { type: 'string' }, monto: ref('Money'), status: { type: 'string', enum: ['pending', 'succeeded', 'rejected'] },
      receipt: { allOf: [ref('Receipt')], nullable: true }, error: { allOf: [ref('Error')], nullable: true }, created_at: { type: 'string', format: 'date-time' },
    } },
  } },
};
await writeFile(new URL('../openapi.json', import.meta.url), JSON.stringify(spec, null, 2) + '\n');
console.log('OpenAPI de NODE3 generado.');
