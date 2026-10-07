# Cinefilia Club - TP de Programación IV

**Autor:** Julian Santiago Müller  
**Institución:** Universidad Tecnológica Nacional, Facultad Regional Avellaneda  
**Carrera:** Tecnicatura Universitaria en Programación  
**Aplicación:** https://cinefilia-club-3d7d7.web.app

Cinefilia Club es una aplicación web para administrar un cine de varias salas y permitir la compra de entradas y artículos de Candy. Incluye reservas de butacas, comprobantes PDF y QR, cupones, fidelización, crédito por cancelaciones, reseñas y herramientas para empleados y administradores.

El resumen de los requisitos de la consigna está en [docs/REQUISITOS.md](docs/REQUISITOS.md), con una copia en PDF. El código se entrega en el repositorio de GitHub que contiene este README; ese repositorio debe estar disponible para los docentes.

## Alcance y roles

| Rol | Operaciones principales |
| --- | --- |
| Invitado | Consultar cartelera, reseñas y Candy; reservar butacas; comprar sin cuenta proporcionando un correo; consultar sus comprobantes desde el navegador utilizado. |
| Cliente registrado | Operaciones del invitado, cupones habilitados, puntos y canjes, crédito, historial de compras, películas vistas, reseñas y alertas de disponibilidad. |
| Empleado | Validar entradas y entregas de Candy mediante cámara o código manual. |
| Administrador | Administrar usuarios, películas y géneros, salas y butacas, funciones y tarifas, Candy, cupones y recompensas; consultar reportes y actividad. También puede acceder al panel de empleado. |

Los pagos son **simulados**. Se prueban tarjeta de crédito, débito, transferencia y crédito interno, con resultados aprobados o rechazados. No se ingresan datos bancarios ni se efectúan cobros reales. Una compra aprobada sí se persiste en Supabase para probar todo el circuito.

## Tecnologías

Las versiones declaradas por el proyecto son Angular `^22.1.0`, Angular CLI y Build `^22.1.6`, TypeScript `~6.0.2` y Supabase JS `^2.117.2`. `package-lock.json` fija las versiones utilizadas por `npm ci`.

- Angular y TypeScript: componentes standalone, rutas, formularios y servicios.
- Supabase: Auth, PostgreSQL, Storage, Realtime y Edge Functions.
- Firebase Hosting: publicación de la SPA por HTTPS.
- SCSS: estilos de componentes y adaptación a dispositivos móviles.
- `@zxing/browser`: lectura de QR mediante cámara.
- `qrcode`: generación de QR; `jspdf`: comprobantes y reportes PDF.
- Generador propio OpenXML en `excel.ts`: reportes `.xlsx` con varias hojas, sin macros ni fórmulas.
- Vitest: prueba del contenedor principal de Angular.

## Arquitectura

La aplicación tiene tres responsabilidades principales:

1. **Presentación:** los componentes muestran datos, capturan selecciones y ofrecen estados de carga, éxito y error. Las plantillas utilizan enlaces de propiedades, eventos y control de flujo `@if`/`@for`.
2. **Acceso a datos:** los servicios inyectables centralizan el cliente Supabase, las consultas y las llamadas RPC. También hay funciones auxiliares para validar selecciones y mostrar cálculos preliminares.
3. **Reglas y persistencia:** las operaciones sensibles se solicitan a PostgreSQL mediante RPC. El servidor debe controlar permisos, disponibilidad, precios definitivos, saldos, cancelaciones y consumo de QR. Los guards y cálculos del navegador no sustituyen esos controles.

Firebase sirve los archivos compilados; no implementa la lógica comercial. Supabase es el backend. No hay un servidor Express dentro de este proyecto.

### Organización del código

| Ubicación | Responsabilidad |
| --- | --- |
| `src/main.ts` | Arranque con `bootstrapApplication` y registro del service worker. |
| `src/app/app.config.ts` | Proveedores de la aplicación. |
| `src/app/app.routes.ts` | Rutas, carga diferida y protección de paneles. |
| `src/app/pages` | Pantallas de cliente, empleado y administración. |
| `src/app/shared` | Navegación, destacados de Candy, selección de cupones, canjes y pago. |
| `src/app/base/service` | Servicios de dominio y acceso a Supabase. |
| `src/app/base/guard/rol.guard.ts` | Guard funcional `permitirRoles`. |
| `src/app/base/config/supabase.config.ts` | URL y configuración pública del cliente Supabase. |
| `public` | Logos, ícono y manifiesto PWA. |
| `scripts/preparar-pwa.mjs` | Generación del service worker posterior al build. |

Los archivos `.ts` contienen comportamiento, los `.html` plantillas y los `.scss` estilos. Los componentes importan las dependencias que utilizan. `signal` representa estado y `computed` produce valores derivados. `effect` sincroniza cambios de estado cuando corresponde. Las suscripciones, canales y recursos de cámara se liberan al finalizar su uso.

### Rutas

| Ruta | Pantalla |
| --- | --- |
| `/` | Inicio con películas más vendidas y Candy destacado. |
| `/cartelera` | Películas, búsqueda por nombre/género, funciones, reseñas y Próximamente. |
| `/proximamente` | Redirección a la cartelera, donde se integra esa sección. |
| `/candy` | Compra independiente de productos y combos. |
| `/registro` | Registro de clientes. |
| `/recuperar-contrasena` | Solicitud de enlace por correo. |
| `/restablecer-contrasena` | Cambio mediante sesión de recuperación. |
| `/butacas/:id` | Mapa de butacas de una función. |
| `/compra/:id/candy` | Candy y paquetes dentro de la compra de entradas. |
| `/compra/:id/confirmar` | Revisión final, beneficios, medio de pago y comprobante. |
| `/mis-compras` | Historial, detalle, comprobantes y cancelación. |
| `/mi-perfil` | Puntos, crédito, movimientos, películas vistas y reseñas. |
| `/empleado` | Validación; admite empleado y administrador. |
| `/admin` | Administración; admite administrador. |

El inicio de sesión se ofrece desde la navegación. La ruta comodín redirige al inicio. Las pantallas administrativas, de compra y perfil utilizan `loadComponent` para cargar su código cuando se necesita.

## Circuitos principales

### Compra de entradas

1. El cliente consulta una película y elige una función disponible.
2. El mapa muestra estándar, accesibles y VIP, y consulta su ocupación por función.
3. `ReservasService` solicita la reserva mediante `cine_reservar_butacas`. Su vencimiento y el horario del servidor permiten controlar la vigencia.
4. El cliente puede agregar Candy, un paquete con entrada y canjes compatibles.
5. El paso final comprueba la restricción de edad y solicita una cotización mediante `cine_cotizar_beneficios`.
6. Se seleccionan cupones, puntos, crédito y un medio de pago de prueba. La cotización incluye una huella para confirmar la selección utilizada.
7. `cine_confirmar_beneficios` procesa la confirmación con las opciones y la huella. Ante un resultado incierto, la interfaz consulta la compra antes de permitir otro intento.
8. La compra confirmada genera comprobantes QR y permite descargar su PDF.

El pago de Candy independiente reutiliza el selector de pago y los beneficios. No requiere reservar una butaca.

### Disponibilidad y concurrencia

`ReservasService` escucha cambios de `cine_ocupacion_butacas`, filtrados por función, con Supabase Realtime. Al recibir un cambio vuelve a consultar la ocupación. El estado local ayuda a mostrar disponibilidad, pero la reserva válida debe decidirse en el servidor para evitar que dos compradores obtengan la misma butaca. Las claves de solicitud permiten recuperar el proceso en el navegador.

### QR y empleado

El empleado selecciona validación de entrada o de Candy, escanea con la cámara o escribe el código. `PanelService` llama a `cine_validar_codigo`. El servidor debe registrar el consumo correspondiente y rechazar su reutilización. La compra puede tener comprobantes por tipo; consumir Candy y validar el ingreso son operaciones distintas, y cada validación debe agotarse una sola vez.

### Cuenta, historial y reseñas

Supabase Auth administra la sesión. El registro solicita nombre, apellido, correo, contraseña, fecha de nacimiento, tipo de sangre, color de ojos y días de vacaciones. Los roles se consultan en `perfiles`.

Las compras de invitado se vinculan mediante `cine_vincular_compras_invitado` al acceder con una cuenta cuyo correo esté confirmado. La operación debe comparar el correo de contacto con el de la cuenta. La vinculación preserva la compra y sus comprobantes; no equivale a generar una compra nueva ni a acreditar puntos históricos automáticamente.

En el perfil se consultan la billetera y las películas vistas. Las reseñas se escriben desde Mis películas y se consultan públicamente desde la cartelera. Ocultar una compra o limpiar el historial afecta su presentación; no elimina la venta, los movimientos contables ni las entradas.

### Cancelación y crédito

La consigna permite cancelar hasta dos horas antes del inicio y compensar con crédito interno. El cliente registrado usa `cine_cancelar_compra_credito`; el invitado, `cine_cancelar_compra_invitado`. El perfil ofrece `cine_reclamar_compensacion` para recuperar una compensación de invitado con una cuenta de correo confirmado coincidente. La reclamación debe ser idempotente y no acreditar dos veces el mismo importe.

Administración solicita la cancelación de una función mediante `cine_cancelar_funcion_credito`. Desactivar una película debe aplicar la política de cancelación de funciones pendientes configurada en PostgreSQL. Cancelación, desactivación, archivo y eliminación física son operaciones distintas: se conserva el historial y se protegen registros relacionados con ventas.

## Decisiones de negocio y de diseño

- La sala original tiene 20 filas de 28 lugares. J y K se reemplazan por una fila accesible de 14: quedan **518 lugares**, distribuidos en **420 estándar, 14 accesibles y 84 VIP**. Las últimas tres filas R, S y T son VIP. Administración permite habilitar o inhabilitar lugares; esta versión no ofrece al usuario el botón de restauración de distribución.
- Las funciones nuevas solicitan asignación automática de sala. La programación por días genera fechas dentro de un rango. El backend debe respetar duración de la película y 30 minutos entre funciones.
- Las fechas de funciones se presentan con referencia horaria argentina. La disponibilidad y los vencimientos deben comprobarse con el tiempo del servidor.
- El beneficio de primera compra y los cupones por edad son configurables. Los cálculos mostrados en el cliente son auxiliares; el importe definitivo procede de la cotización del servidor.
- Las recompensas permiten configurar costo en puntos y aporte monetario, incluido cero. Para satisfacer la recompensa gratuita de la consigna se utiliza aporte cero. En esta implementación los canjes de entradas y paquetes por puntos se limitan a 2D sin VIP.
- Un paquete combina entrada y Candy. Cada unidad utiliza una butaca ya reservada, no agrega una entrada adicional. Se elige un tipo de paquete por compra y pueden comprarse varias unidades; paquete pagado y paquete por puntos son alternativas.
- La preventa se configura por película: apertura siete días antes del estreno y descuento durante la preventa. La decisión documentada del proyecto conserva la tarifa VIP normal.
- La interfaz utiliza una identidad visual oscura, rojo para acciones, azul para accesibles y dorado para VIP. En móviles, los mapas se desplazan para conservar el tamaño de las butacas.
- PDF, QR y exportaciones cargan bibliotecas cuando se necesitan. El reporte Excel se construye como un archivo OpenXML real, con hojas de facturación, Candy, semanas y meses.

## Supabase y dependencias del backend

Este archivo fuente contiene el frontend, pero **el RAR revisado no incluye las migraciones SQL, las implementaciones de Edge Functions ni el código del proceso de correos**. Por eso clonar e instalar dependencias no crea una base nueva con todas las reglas de negocio. Para reproducir el sistema desde cero hace falta el respaldo vigente del backend.

El cliente requiere, entre otras, estas tablas o relaciones consultadas por el código: `perfiles`, `peliculas`, `generos`, `salas`, `butacas`, `funciones` y `cine_ocupacion_butacas`. Las compras, reservas y beneficios se consultan principalmente a través de RPC.

| Dominio | Ejemplos de contratos RPC utilizados |
| --- | --- |
| Reservas | `cine_obtener_ocupacion`, `cine_reservar_butacas`, `cine_obtener_reserva`, `cine_cancelar_reserva` |
| Pago y beneficios | `cine_beneficios_catalogo`, `cine_cotizar_beneficios`, `cine_confirmar_beneficios`, `cine_mi_billetera` |
| Historial y cancelaciones | `cine_listar_mis_compras_con_cupon`, `cine_ocultar_historial_compras`, `cine_cancelar_compra_credito`, `cine_cancelar_funcion_credito` |
| Invitados | `cine_vincular_compras_invitado`, `cine_cancelar_compra_invitado`, `cine_reclamar_compensacion` |
| Reseñas y estrenos | `cine_mis_peliculas`, `cine_guardar_resena`, `cine_resenas_pelicula`, `cine_proximamente` |
| Administración | `cine_crear_funcion_automatica`, `cine_validar_codigo`, `cine_listar_actividad`, `cine_reporte_beneficios` |

Es una selección de contratos, no un inventario completo ni una migración. Los nombres y parámetros efectivos están en los servicios y componentes que invocan RPC.

El frontend también invoca las Edge Functions `consultar-registro`, `reenviar-confirmacion` y `administrar-usuarios`. Los pósters se suben al bucket `posters`. Realtime debe estar habilitado para la ocupación y deben existir las políticas de acceso correspondientes.

La recuperación de contraseña utiliza Supabase Auth y su plantilla de correo. Deben configurarse las URL de retorno autorizadas, incluida la del sitio publicado. Las notificaciones comerciales de cancelación y apertura de venta requieren el proceso externo de correos del proyecto; su implementación no está incluida en este RAR. Un estado de envío registrado no demuestra por sí solo recepción en la bandeja del destinatario.

La configuración del frontend es pública. Las claves privilegiadas, secretos de correo y credenciales del servidor deben permanecer en la configuración privada del backend. Los permisos SQL y las políticas RLS son necesarios incluso si el navegador tiene guards por rol.

## Instalación y ejecución

El `package-lock.json` declara para Angular CLI compatibilidad con Node `^22.22.3 || ^24.15.0 || >=26.0.0`. Utilizar una versión que satisfaga ese rango. El proyecto declara `npm@11.17.0` como gestor.

Desde la raíz del repositorio:

```powershell
npm ci
npm start
```

Abrir `http://localhost:4200`. Revisar la configuración pública de Supabase en `src/app/base/config/supabase.config.ts` y disponer de un backend compatible antes de probar operaciones.

No se necesitan `node_modules` ni `dist` versionados en Git: las dependencias se reconstruyen con `npm ci` y el frontend con el build.

## Compilación y publicación

```powershell
npm run build
firebase deploy --only hosting --project cinefilia-club-3d7d7
```

El despliegue requiere Firebase CLI y una cuenta con acceso al proyecto. `firebase.json` publica `dist/proyecto-cine/browser` y redirige rutas de la SPA a `index.html`.

Utilizar **`npm run build`**, porque ejecuta también `postbuild`. `ng build` por sí solo no ejecuta el generador de PWA. Los límites de presupuesto de Angular pueden producir advertencias o detener el build si se supera el máximo de error.

## PWA

`public/manifest.webmanifest` define nombre, ícono, colores y modo standalone. `scripts/preparar-pwa.mjs` genera `cine-sw.js` después del build, con una versión de caché calculada a partir de los archivos JavaScript y CSS.

El worker almacena el shell y recursos estáticos. Para navegación intenta la red y, si falla, utiliza el shell guardado. Los recursos estáticos incluidos se recuperan de la caché. Las solicitudes a otros dominios, incluido Supabase, no son interceptadas por este worker.

La aplicación puede abrir su interfaz sin conexión después de una instalación satisfactoria del worker, pero comprar, autenticar, consultar saldos y obtener datos actualizados requiere conexión. No se ofrece compra offline. El registro del worker está deshabilitado en localhost y 127.0.0.1.

Verificar en un navegador compatible: manifiesto, registro del worker, instalación y apertura del shell sin conexión. El worker no fuerza activación inmediata; tras una publicación puede ser necesario cerrar las ventanas controladas por la versión anterior.

## Verificación y demostración

```powershell
npm test -- --watch=false
npm run build
```

La prueba incluida en `app.spec.ts` verifica la ubicación de la navegación y el `router-outlet`. No constituye una prueba integral de compras o del backend. La revisión realizada para esta documentación fue estática: no se ejecutaron pagos, envíos ni modificaciones contra la base remota.

Para la defensa, demostrar además:

1. Compra registrada e invitada, pago aprobado y rechazado, QR y PDF.
2. Competencia por una butaca desde dos sesiones y recuperación tras un intento incierto.
3. Validación de entrada y Candy, seguida del rechazo de un segundo consumo.
4. Restricción de edad, cupón de primera compra, puntos, canje gratuito y pago combinado con crédito.
5. Programación automática, rechazo de superposición y separación de 30 minutos.
6. Cancelación dentro y fuera del plazo, compensación de invitado y reclamo con el mismo correo confirmado.
7. Reseña y promedio, alerta de estreno, preventa y cambio al precio normal.
8. Reportes PDF/Excel, gráficos por período, actividad de administración y PWA.

Las condiciones de aceptación se detallan en el documento de requisitos. La defensa debe diferenciar lo que comprueba Angular, lo que controla PostgreSQL y lo que depende de servicios externos.
