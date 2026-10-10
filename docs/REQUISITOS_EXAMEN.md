# Requisitos y evidencias

Comparación con el PDF del examen. Por la aclaración del profesor comunicada por el usuario, Render es el destino principal; Vercel y Coolify son opcionales.

| Requisito | Estado y evidencia |
| --- | --- |
| Laravel/Composer y Express/NPM | Implementados en los tres repositorios y archivos de dependencias. |
| Cuentas, saldos y transacciones en Supabase | Implementados en NODE1; apertura y saldo compartido comprobados en Postman. |
| RLS, Auth y Realtime | Auth administrativo, API Keys por nodo, RLS y canal privado. `nodo3_realtime_panel.json`: conexión autorizada, aviso y rechazo anónimo. |
| Nodos, responsables y efectivo | Panel central `/admin`; capturas de nodos/inventario y contrato `nodes/me`. |
| Historial global por nodo y reportes | Filtros y CSV; `nodo1_filtros_corregidos.json` y captura del historial conjunto. |
| Sucursal: apertura, historial y reportes | Implementados; 36 pruebas aisladas y validación publicada en `https://github.com/Shinra3245/EXAMEN_2_TOPWEB_NODO_2/blob/main/docs/VALIDACION.md`. |
| Cajero: consulta, retiro y depósito | Flujo real $1,000 → retiro $300 → saldo $700; depósito separado de $50.15. |
| Efectivo local y panel de API Key | PostgreSQL propio, reservas, panel técnico y sincronización; rechazo local e inventarios coincidentes. |
| Consistencia e historial inmutable | 46 solicitudes / 49 aserciones; reintentos con un único movimiento. La suite del Core comprueba rechazo de edición/borrado del ledger. |
| Despliegue continuo desde Git | Nodos 1/2: automático desde Git. Nodo 3: Actions prueba y despliega ese commit en Render. |
| Un repositorio por nodo | Tres repositorios GitHub, enlazados en `ENTREGA_FINAL.md`. |
| README, diagrama, URL y OpenAPI | Disponibles para los tres nodos y reunidos en el paquete. |
| Demostración de 10 minutos | Guion preparado; ensayo técnico ejecutado. La exposición ante el profesor corresponde al equipo. |

## Referencias

- [Flujo Postman](flujo-postman.md), [resultados originales](../evidencias/tres_nodos_render_resultados.json), [reinicio](../evidencias/tres_nodos_reinicio_render.json) y [ensayo de cierre](../evidencias/ensayo_entrega_postman.json).
- [Respaldo](RESPALDO_NODO3.md) y [restauración aislada](../evidencias/respaldo_nodo3_verificado.json).
- [Guion de exposición](GUION_DEMOSTRACION.md).

Las cifras de cada suite corresponden a ejecuciones y alcances distintos; las simulaciones se distinguen de las solicitudes reales.
