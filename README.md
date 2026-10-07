# Cinefilia Club — TP de Programación IV

Autor: Julian Santiago Müller. Universidad Tecnológica Nacional, Facultad Regional Avellaneda.

Aplicación publicada: https://cinefilia-club-3d7d7.web.app

El enlace al repositorio corresponde al repositorio desde el que se consulte este README. Antes de entregar, verificar que sea accesible para los docentes y que la versión publicada coincida con el último commit.

## Arquitectura

Angular utiliza componentes standalone, rutas, guards por rol, formularios, servicios inyectables y signals para representar el estado. `src/app/pages` contiene las pantallas; `src/app/shared` contiene navegación, cupones, canjes y pago; `src/app/base/service` centraliza el acceso a Supabase y los cálculos auxiliares. Los archivos `.ts` implementan comportamiento, los `.html` las plantillas y los `.scss` los estilos.

Supabase proporciona Auth, PostgreSQL, Storage y Realtime. Las funciones RPC validan compras, disponibilidad, permisos, descuentos, canjes y crédito. El cliente nunca decide por sí solo los precios finales ni modifica saldos. Firebase Hosting publica los archivos compilados y resuelve las rutas de la SPA mediante `index.html`.

## Decisiones de negocio

- Compra de prueba: tarjeta, débito y transferencia son simulados. No se recopilan datos bancarios ni se realizan cobros reales.
- Los registrados acumulan un punto por peso del total definitivo. Los canjes tienen puntos y un aporte configurable que puede ser cero. Entradas y Candy pueden canjearse juntos.
- Por decisión del proyecto, las entradas por puntos y los paquetes por puntos se limitan a 2D sin VIP. Los paquetes pagados admiten otros formatos y mantienen el recargo VIP.
- Los combos con entrada se configuran en Candy, con productos y cantidades a elección. Se eligen en Candy durante la compra. Cada unidad incorpora una de las butacas ya reservadas; no agrega otra entrada independiente.
- Se admite un tipo de paquete por compra, con varias unidades. El paquete pagado y el paquete por puntos son alternativas. Puede combinarse con otras entradas y canjes de Candy.
- La preventa abre siete días antes del estreno y termina al comenzar el día del estreno en Argentina. Cada película configura su porcentaje, mayor que cero y menor que cien. VIP conserva su tarifa normal.
- Las salas conservan 518 lugares: 420 estándar, 14 accesibles y 84 VIP. Administración permite consultar el mapa, habilitar lugares o dejarlos fuera de servicio. La restauración reglamentaria repara bloques, orden y tipo, sin reemplazar identificadores y solo sin funciones pendientes.
- Los precios y los beneficios se cotizan en el servidor. La huella de la cotización detecta cambios antes de confirmar. Las claves de compra y los bloqueos permiten reintentar sin duplicar compras ni movimientos.
- Las cancelaciones producen crédito interno; no una devolución bancaria. Los movimientos permiten consultar puntos y crédito.

## Correos

Las notificaciones de cancelación y apertura de venta se preparan en PostgreSQL. La Edge Function `cine-notificaciones` permite retirar un lote y registrar el resultado. Google Apps Script envía los correos desde Gmail mediante un activador periódico. Los usuarios registrados reciben los avisos en el correo de su cuenta; los invitados proporcionan un correo de contacto.

Las claves del servidor y el secreto del procesamiento pertenecen a Supabase y a las propiedades del script. No deben incorporarse a Angular ni al repositorio. Mantener la copia vigente de las Edge Functions, SQL anteriores y Google Apps Script en el respaldo del proyecto y adjuntarla a la entrega si no está en Git.

## Instalación y actualización

```powershell
npm ci
npm start
```

Se requiere Node compatible con la versión de Angular indicada en `package.json`. La configuración pública de Supabase se encuentra en `src/app/base/config/supabase.config.ts`; las claves privadas se configuran exclusivamente en el servidor.

Esta entrega es una actualización de la base existente, no una instalación inicial. Ejecutar completo `supabase/migrations/20261007_mejoras_finales.sql` en el SQL Editor antes de publicar este frontend. No volver a ejecutar migraciones antiguas sobre esta actualización: podrían reinstalar las restricciones y cálculos anteriores.

## Compilación, publicación y PWA

```powershell
npm run build
firebase deploy --only hosting --project cinefilia-club-3d7d7 --account juliansanti2002@gmail.com
```

`npm run build` ejecuta `postbuild`, que genera `dist/proyecto-cine/browser/cine-sw.js`. `ng build` solo no ejecuta ese paso. El manifiesto define nombre, ícono y modo standalone. El service worker guarda la interfaz y los recursos estáticos; las consultas a Supabase y las compras necesitan conexión. El registro del worker está deshabilitado en localhost.

Probar en el sitio publicado: Application → Manifest, Application → Service Workers, instalación desde un navegador compatible y recarga sin conexión. La interfaz debe abrir; no se promete una cartelera actualizada ni compras sin internet. Al publicar, cerrar las ventanas de la app y volver a abrirlas si hay un worker nuevo esperando activación.

## Verificación

Consultar `VALIDACION.md` para las comprobaciones realizadas y las pruebas pendientes en la base remota. Consultar `REQUISITOS.md` para la relación con la consigna. La prueba del shell de Angular se ejecuta con `npm test -- --watch=false`.
