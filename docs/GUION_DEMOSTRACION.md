# Demostración del examen — 10 minutos

Los integrantes exponen su propio nodo. Omar presenta el Central y coordina el cierre; los encargados de sucursal y cajero presentan sus aplicaciones.

## Preparación

1. Abrir Central `/admin`, sucursal `/cuentas/nueva`, cajero `/`, panel técnico `/admin` y Postman. Iniciar las sesiones antes de proyectar.
2. Visitar `/up`, `/healthz` y `/health` minutos antes para activar los servicios gratuitos. Verificar sucursal conectada y cajero disponible.
3. Comprobar ausencia de pendientes y efectivo para retirar $300. Para ejecutar toda la colección, el efectivo inicial debe superar $1,000; coordinar recarga y sincronización sin pendientes si hace falta.
4. Importar colección y entorno de `postman/`; completar credenciales en valores privados. Para el ensayo completo seguir [flujo-postman.md](flujo-postman.md).
5. Crear una cuenta nueva en la exposición. Las cuentas de ensayo ya tienen $700; otro retiro no reproducirá el saldo final del examen. Conservar una clave por intento y recuperar una operación incierta antes de iniciar otra.
6. Preparar capturas, resultados y último workflow exitoso. Cerrar pestañas con contraseñas o claves visibles.

## Cronograma

| Tiempo | Responsable | Acción y frase sugerida |
| --- | --- | --- |
| 0:00–1:00 | Omar | Mostrar diagrama y URL. «El Central guarda las cuentas y el historial; sucursal y cajero operan por la API». |
| 1:00–3:00 | Omar | Mostrar nodos, responsables y efectivo en `/admin`. Explicar API Keys y autenticación. «Las operaciones se validan en el Central y el historial no se puede editar». |
| 3:00–5:00 | Nodo 2 | En `/cuentas/nueva`, ingresar titular, saldo `1000` y pulsar **Crear cuenta** una vez. Copiar la cuenta y mostrar su consulta e historial. «La cuenta se creó en Supabase a través del Central». |
| 5:00–7:00 | Nodo 3 | Ingresar la cuenta y **Consultar saldo**: $1,000. Elegir **Retirar efectivo**, importe `300` y **Confirmar operación**. Mostrar comprobante y $700. «Comprobamos efectivo local y confirmación central antes de descontar una sola vez». |
| 7:00–9:00 | Omar y Nodo 2 | Filtrar historial central por cuenta: apertura y único retiro. Consultar $700 en sucursal y mostrar inventario reducido en $300. Mostrar en Postman/evidencias el mismo comprobante al reintentar con la misma clave. No crear otra operación para representar el reintento. |
| 9:00–10:00 | Equipo | Mostrar repositorios, OpenAPI, resultado Postman y workflow. «Comprobamos 46 solicitudes y 49 aserciones, incluida persistencia después del reinicio. Los tres servicios están en Render». |

Los bloques suman 600 segundos. No ejecutar las 46 solicitudes mientras se narra: mostrar el flujo web y los resultados reales del ensayo completo.

Si una respuesta tarda, esperar o consultar la misma operación; no iniciar otro retiro. Ante una caída externa, distinguir las evidencias guardadas de la ejecución en vivo.

El ensayo técnico está en [ensayo_entrega_postman.json](../evidencias/ensayo_entrega_postman.json). La exposición y su duración real corresponden al equipo el día del examen.
