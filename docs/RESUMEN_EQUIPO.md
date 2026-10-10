# Estado del proyecto para el equipo

El sistema bancario está implementado y conectado con sus tres nodos en Render:

- Banco Central: https://banco-central-nodo1.onrender.com
- Sucursal: https://sucursal-nodo2.onrender.com
- Cajero: https://node3-atm.onrender.com

Se comprobó apertura con **$1,000**, retiro de **$300** desde el cajero y saldo final de **$700** en los tres servicios. Funcionan depósitos, historial por nodo, reportes, efectivo local y recuperación sin duplicar movimientos.

Las validaciones registran **43 pruebas del Central, 36 de sucursal y 39 del cajero**. El ensayo conjunto aprobó **46 solicitudes Postman y 49 aserciones**, incluido reinicio con comprobantes, efectivo y sesión persistentes. Los tres nodos tienen despliegue continuo vinculado a GitHub.

La documentación está actualizada. Se entrega guion de 10 minutos, OpenAPI, Postman, capturas y resultados. El respaldo del cajero se conserva de forma privada y se verifica mediante restauración aislada.

**Para presentar:** cada integrante expone su nodo; Omar coordina el Central y la comprobación final. Crear una cuenta nueva y seguir `GUION_DEMOSTRACION.md`; las cuentas de ensayo ya tienen $700. Compartir credenciales únicamente de forma privada.

La base gratuita del cajero vence el **8 de noviembre de 2026**; renovar o migrar antes si seguirá utilizándose. Vercel y Coolify son opcionales. No hay pendientes funcionales identificados para el flujo del examen; resta realizar la exposición y entregar el material al profesor.
