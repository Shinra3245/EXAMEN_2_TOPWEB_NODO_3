# Entrega final — sistema bancario distribuido

La implementación e integración de los tres nodos está completada en Render. Se entregan documentación, OpenAPI, Postman y evidencias públicas.

| Nodo | Aplicación | Repositorio |
| --- | --- | --- |
| Central | [Render](https://banco-central-nodo1.onrender.com) | [GitHub Nodo 1](https://github.com/Shinra3245/EXAMEN_2_TOPWEB_NODO_1) |
| Sucursal | [Render](https://sucursal-nodo2.onrender.com) | [GitHub Nodo 2](https://github.com/Shinra3245/EXAMEN_2_TOPWEB_NODO_2) |
| Cajero | [Render](https://node3-atm.onrender.com) | [GitHub Nodo 3](https://github.com/Shinra3245/EXAMEN_2_TOPWEB_NODO_3) |

## Material

- [Resumen para el equipo](RESUMEN_EQUIPO.md).
- [Requisitos y evidencias](REQUISITOS_EXAMEN.md).
- [Guion de 10 minutos](GUION_DEMOSTRACION.md).
- [Flujo Postman](flujo-postman.md), [colección](../postman/tres_nodos_render.postman_collection.json) y [entorno sin secretos](../postman/tres_nodos_render.postman_environment.json).
- OpenAPI en el workspace: `NODE1/openapi.yaml`, `NODE2_CORRECCIONES/docs/openapi.yaml` y `NODE3_INTEGRACION/openapi.json`. El paquete incluye copias en `openapi/`.
- [Respaldo y recuperación](RESPALDO_NODO3.md).

## Validación

Las suites registradas aprobaron 43 pruebas PostgreSQL del Central, 36 de sucursal y 39 del cajero. El ensayo conjunto aprobó 46 solicitudes / 49 aserciones: apertura $1,000, retiro $300, saldo $700, depósito, rechazos, reintentos y cinco consultas después del reinicio de Render.

La cuenta original `13447350977369660092` conserva $700. El ensayo de cierre y su estado operativo se registran en [ensayo_entrega_postman.json](../evidencias/ensayo_entrega_postman.json). El respaldo se verifica mediante [restauración local aislada](../evidencias/respaldo_nodo3_verificado.json).

El paquete `ENTREGA_EXAMEN_TOPWEB.zip` contiene documentación, contratos, Postman y evidencias, con manifiesto y `SHA256SUMS`. No incluye `.env`, sesiones, contraseñas, API Keys ni el dump privado. El código se entrega en los tres repositorios GitHub.

## Presentación y continuidad

Actualizar `main` conservando cambios locales, iniciar sesiones privadas y activar los servicios minutos antes. Crear una cuenta nueva para el flujo en vivo; no reutilizar una que ya terminó en $700.

La base gratuita del cajero vence el **8 de noviembre de 2026**. Existe respaldo local; renovar o migrar antes si seguirá utilizándose. Render es el destino acordado; Vercel y Coolify son opcionales.

La entrega técnica está preparada. La exposición de 10 minutos y la entrega en la plataforma del profesor corresponden al equipo.
