# Nodo 3 y unión de los tres nodos — completados

El cajero está publicado en https://node3-atm.onrender.com y conectado al Banco Central https://banco-central-nodo1.onrender.com/api. La sucursal usa https://sucursal-nodo2.onrender.com.

**Correcciones aplicadas:** recuperación con API Key rotada sin liberar efectivo pendiente; validación del origen público detrás del proxy; política de cabeceras que permite iniciar sesión desde Chrome; documentación alineada con el Core disponible; despliegue continuo desde GitHub Actions después de las pruebas.

**Resultado real:** la sucursal abrió la cuenta `13447350977369660092` con $1,000; el cajero retiró $300 y los tres nodos confirmaron $700. Solo se registró un retiro. Los reintentos y rechazos no modificaron ese saldo. El depósito de $50.15 se comprobó en otra cuenta. El cajero terminó esa validación inicial con $1,000.31 de efectivo, coincidente con el Central.

**Validación:** 39 pruebas del Nodo 3 con PostgreSQL, sin omisiones ni fallos; auditoría de dependencias sin vulnerabilidades; 46 solicitudes Postman y 49 aserciones aprobadas, incluidas 5 después de reiniciar Render. Se conservaron comprobantes, efectivo y sesión técnica. Además, una prueba aislada con el Core real perdió la respuesta tras un depósito de $0.01 y recuperó el comprobante sin duplicar el crédito.

**Entrega al encargado:** hacer `git pull origin main`. Importar la colección y entorno de los tres nodos, disponibles en `postman/` del repositorio del cajero. Las URL están completas; rellenar las credenciales únicamente en un entorno privado. Consultar `docs/flujo-postman.md` para el orden de las carpetas. El acceso técnico generado se conserva fuera de Git en `NODE3_INTEGRACION/.local-admin.render.txt`, dentro del workspace de Omar.

**Operación:** el inventario, la configuración, los pendientes y las sesiones viven en PostgreSQL propio. No cambiar `CONFIG_ENCRYPTION_KEY`. Con un pendiente, recuperar con la misma clave y conservar la reserva; no sincronizar efectivo ni repetir con otra clave. Una nueva API Key debe pertenecer al mismo ID de cajero.

**Infraestructura:** Render es el destino principal acordado con el profesor. Cada push a `main` despliega el commit que pasó las pruebas mediante un Deploy Hook privado; `autoDeployTrigger: off` deja ese control al workflow. La base gratuita del cajero vence el **8 de noviembre de 2026**, según Render: preparar respaldo o renovación antes si todavía se utilizará.

No quedan bloqueos funcionales identificados para el examen. La documentación final incluye guion de 10 minutos, OpenAPI, Postman, capturas y respaldo restaurado en una base aislada. Consultar [entrega final](docs/ENTREGA_FINAL.md). La exposición ante el profesor corresponde al equipo.

El nuevo ensayo de cierre volvió a aprobar 46 solicitudes / 49 aserciones y dejó $750.46 de efectivo, sin pendientes. La cuenta original conserva $700; el nuevo ensayo utilizó otra cuenta.
