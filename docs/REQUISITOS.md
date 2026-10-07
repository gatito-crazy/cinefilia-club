# Resumen de requisitos - Cinefilia Club

**Trabajo práctico:** Programación IV, TP 1, segundo cuatrimestre de 2026  
**Autor:** Julian Santiago Müller  
**Institución:** Universidad Tecnológica Nacional, Facultad Regional Avellaneda  
**Fuente:** consigna «TP 1 - Programacion IV - 2026 C2», intercambio de correos del 01/01/2020 al 10/03/2020.  
**Versión del documento:** 7 de octubre de 2026

## 1. Objetivo y alcance

Desarrollar una aplicación para un establecimiento de cine con varias salas que permita vender entradas y Candy, emitir comprobantes PDF con QR, administrar programación y recursos, validar el ingreso y la entrega de productos, y ofrecer beneficios a clientes registrados.

El alcance incluye interfaces para invitados, clientes, empleados y administradores. La aplicación debe integrar Angular, Supabase y PWA, estar desplegada con una URL funcional y contar con código en GitHub y README técnico. Este documento resume lo solicitado; sus condiciones de aceptación no representan por sí mismas pruebas ejecutadas ni certifican cumplimiento del backend.

## 2. Actores

- **Invitado:** consulta películas, reseñas y productos y compra sin registrarse.
- **Cliente registrado:** compra, recibe beneficios, acumula y canjea puntos, administra crédito y consulta sus películas e historial.
- **Empleado:** valida entradas y entregas de Candy con QR o ingreso manual.
- **Administrador:** controla salas, butacas, funciones, películas, productos, tarifas y beneficios; consulta reportes y actividad.

## 3. Catálogo, cartelera y películas

**RF-01. Información de películas.** Registrar y mostrar nombre, imagen, sinopsis y duración de cada película. La duración se utiliza en la programación de funciones.

**RF-02. Géneros y búsqueda.** Cada película puede pertenecer a varios géneros. El listado debe permitir buscar películas y filtrar por género.

**RF-03. Inicio.** Mostrar primero las tres películas con mayor venta de entradas. El ranking debe basarse en los datos de ventas, no en un orden manual presentado como estadístico.

**RF-04. Control administrativo.** El administrador debe controlar qué películas se muestran, sus funciones, horarios, formatos e idiomas.

**Aceptación:** una película conserva sus datos y varios géneros; la búsqueda y el filtro devuelven resultados coherentes; el inicio muestra un máximo de tres películas del ranking solicitado.

## 4. Salas, butacas y funciones

**RF-05. Varias salas.** Administrar las salas de un único establecimiento y su disponibilidad para programar funciones.

**RF-06. Distribución original.** La sala base tiene 20 filas identificadas por letras, con tres bloques de 4, 20 y 4 butacas por fila.

**RF-07. Adaptación accesible.** Reemplazar las filas J y K por una fila accesible con 2, 10 y 2 lugares por bloque. Estos lugares deben distinguirse visualmente. La distribución final resulta en 518 lugares: 420 estándar, 14 accesibles y 84 VIP.

**RF-08. VIP.** Las últimas tres filas R, S y T deben ser VIP, distinguirse visualmente y tener un precio superior. Antes de pagar se debe informar claramente ese tipo de ubicación.

**RF-09. Administración de butacas.** Permitir al administrador controlar la distribución y la disponibilidad de butacas conforme a la sala reglamentaria.

**RF-10. Formatos e idiomas.** Ofrecer funciones 2D, 3D, 4D y 5D, en castellano o subtituladas.

**RF-11. Duración e intervalo.** Una sala no puede recibir otra función antes de que transcurran 30 minutos desde la finalización de la anterior. La finalización depende de la duración de la película.

**RF-12. Asignación automática.** El sistema debe asignar una sala disponible al crear una función, sin superponer funciones en una misma sala.

**RF-13. Programación por días.** Permitir programar una película en determinados días y horarios, asignando automáticamente sala a cada fecha generada.

**RF-14. Ocupación en tiempo real.** Durante la selección, mostrar las butacas ocupadas por compras o reservas de otros usuarios. La confirmación debe impedir ventas duplicadas de una misma ubicación y función.

**Aceptación:** validar cantidad, bloques y tipos de butaca; probar asignación automática y el caso sin sala disponible; rechazar un horario solapado o separado por menos de 30 minutos; abrir dos sesiones y verificar actualización de ocupación y rechazo de reserva incompatible.

## 5. Registro, cuenta y restricciones de edad

**RF-15. Datos del registro.** Solicitar correo, nombre, apellido, fecha de nacimiento, tipo de sangre, color de ojos y cantidad de días de vacaciones por año.

**RF-16. Compra anónima.** Permitir comprar sin crear una cuenta. El registro no debe ser obligatorio para adquirir entradas.

**RF-17. Restricción de edad.** Configurar películas sin restricción y con edad mínima de 13 o 18 años. No permitir que un comprador menor que la edad requerida complete la compra.

**RF-18. Aviso en la entrada.** Las entradas para películas restringidas deben indicar el acompañamiento de un adulto solicitado por la consigna. El aviso no sustituye la comprobación de edad del comprador.

**Aceptación:** registrar todos los datos y rechazar valores inválidos; completar una compra como invitado; verificar los límites de edad y el texto del comprobante de una película restringida.

## 6. Compra, PDF, QR y validación

**RF-19. Compra de entradas.** Permitir seleccionar función y ubicaciones, conocer el detalle económico y completar la compra.

**RF-20. Comprobante.** Generar un PDF con los datos de la entrada y el QR que se presenta para ingresar.

**RF-21. Panel de empleado.** Disponer de usuarios empleados para validar entradas y retirar artículos de Candy.

**RF-22. Lectura y alternativa manual.** Permitir escanear QR y escribir su código cuando la cámara o el lector no estén disponibles.

**RF-23. Consumo único.** Una entrada validada y una entrega de Candy realizada no deben volver a utilizarse. La operación debe quedar persistida en el servidor.

**RF-24. Entrada y Candy asociados.** La compra conjunta debe permitir presentar su comprobante para ambas prestaciones. El sistema debe distinguir el consumo del ingreso del retiro de Candy y evitar duplicaciones en cada uno.

**Aceptación:** descargar y leer un PDF, validar el código con cámara y manualmente, comprobar los datos de función y productos y rechazar el segundo uso de una prestación ya consumida.

## 7. Candy y combos

**RF-25. Productos y categorías.** Administrar productos del sector Candy, como pochoclos y bebidas, agrupados en categorías.

**RF-26. Compra conjunta.** Agregar artículos de Candy a la compra de entradas y vincularlos con el comprobante.

**RF-27. Combos con entrada.** Ofrecer combos de entrada, pochoclos y bebida a un precio fijo configurable por el administrador. Deben aparecer destacados durante la compra.

**Aceptación:** crear categorías y productos; comprar entradas con Candy; modificar el precio y los componentes de un combo; comprobar que el detalle final y el retiro corresponden a las cantidades compradas.

## 8. Cupones y fidelización

**RF-28. Primera compra.** Dar a los registrados un cupón de primera compra. El porcentaje inicial solicitado es 20%, pero debe poder modificarse desde administración.

**RF-29. Descuento por edad.** Permitir crear cupones destinados exclusivamente a usuarios mayores de 50 años. La elegibilidad debe basarse en su edad, no en una selección libre del cliente.

**RF-30. Acumulación de puntos.** Cada usuario registrado gana un punto por cada peso gastado.

**RF-31. Recompensas.** Permitir canjear puntos por entradas gratis y productos de Candy. El administrador configura el costo en puntos de cada recompensa; los valores de 500 y 150 puntos del correo son ejemplos configurables.

**RF-32. Consulta personal.** Mostrar puntos acumulados e historial de canjes en el perfil.

**RF-33. No transferencia.** Los puntos no pueden transferirse entre usuarios.

**Aceptación:** verificar el descuento configurado, su utilización en la primera compra y la exclusión de usuarios sin la edad requerida; comparar puntos con el gasto; canjear una recompensa con aporte monetario cero; rechazar saldo insuficiente y operaciones sobre saldos ajenos.

## 9. Reseñas y películas vistas

**RF-34. Opiniones.** Permitir calificar películas con estrellas y un comentario corto.

**RF-35. Consulta previa.** Mostrar reseñas y puntuación promedio antes de comprar entradas.

**RF-36. Mis películas.** Mostrar un historial visual de películas vistas con pósters, fechas y calificación personal.

**Aceptación:** publicar una reseña, consultar su promedio en la cartelera y verificar la aparición de la película y su calificación en el historial del cliente.

## 10. Próximamente, alertas y preventa

**RF-37. Próximamente.** Mostrar películas que se estrenan en las próximas semanas.

**RF-38. Alertas.** Permitir activar un aviso cuando las entradas de una película pasen a estar disponibles para venta.

**RF-39. Preventa.** Abrir la venta siete días antes del estreno con precio especial, configurable por película. Al finalizar la preventa, el precio vuelve al normal.

**Aceptación:** verificar visibilidad del estreno, activación de alerta, generación del aviso al abrir la venta y aplicación del precio correspondiente antes, durante y después del período de preventa.

## 11. Cancelaciones y crédito

**RF-40. Plazo de cancelación.** Permitir cancelar una compra hasta dos horas antes del inicio de la función.

**RF-41. Compensación.** La cancelación entrega crédito interno para futuras compras, no devolución bancaria.

**RF-42. Consulta y combinación.** Mostrar el crédito en el perfil y permitir utilizarlo junto con otros métodos de pago.

**Aceptación:** cancelar con suficiente anticipación, rechazar la operación fuera del plazo, invalidar entradas y prestaciones afectadas y comprobar el saldo; pagar una compra posterior utilizando parte de ese crédito y otro medio para la diferencia. Repetir una solicitud no debe duplicar la compensación.

## 12. Reportes y actividad

**RF-43. Facturación diaria.** Mostrar cuánto se facturó por día y cuántas entradas se vendieron.

**RF-44. Exportación.** Exportar el reporte de facturación a PDF y Excel.

**RF-45. Gráficos por período.** Mostrar gráficos de películas más vistas por semana y por mes.

**RF-46. Ranking de Candy.** Identificar el producto de Candy más vendido.

**RF-47. Actividad.** Registrar quién creó una función, modificó un precio o validó un QR, con fecha y hora, y ofrecer el registro al administrador.

**Aceptación:** contrastar reportes con operaciones de prueba conocidas; abrir PDF y Excel; cambiar entre períodos semanales y mensuales; comprobar actor, acción y horario en el registro de actividad.

## 13. Requisitos técnicos y de experiencia

**RNF-01. Angular.** Utilizar correctamente los temas vistos en clase y justificar las decisiones en la defensa oral: componentes, rutas, formularios, servicios, estado y buenas prácticas.

**RNF-02. Supabase.** Integrar el backend para autenticación y persistencia. Las operaciones deben respetar permisos y conservar la integridad comercial.

**RNF-03. PWA.** Integrar la aplicación como PWA. Documentar instalación y comportamiento con y sin conexión.

**RNF-04. Identidad visual.** Crear un estilo visual propio y producido.

**RNF-05. Usabilidad.** Facilitar la navegación a clientes y empleados, incluyendo pantallas móviles y estados comprensibles de carga, error y confirmación.

**RNF-06. Fechas y horas.** Ofrecer una forma ágil de ingresar fechas y horarios, evitando listas que requieran demasiado desplazamiento.

**RNF-07. Integridad y acceso.** Evitar superposición de funciones, doble venta, doble consumo de QR y uso de beneficios de otra cuenta. Los controles visuales deben acompañarse de validaciones en el backend.

**Aceptación:** recorrer el sitio en escritorio y móvil, completar formularios, comprobar controles de acceso y probar la instalación y el shell offline de la PWA sin interpretar ese acceso como disponibilidad de compras sin conexión.

## 14. Entregables y defensa

- Documento que resume todos los requisitos: este documento.
- Aplicación desarrollada con los temas de la materia e integración con Supabase y PWA.
- Aplicación desplegada con URL funcional.
- Código fuente en GitHub disponible para los docentes.
- README con arquitectura y decisiones técnicas.
- Defensa oral de las decisiones de implementación el día de entrega.

La aprobación o promoción depende también de la defensa. Los docentes pueden solicitar cambios si la solución no respeta la consigna.

## 15. Solicitud sin aprobación

El correo del 30/01/2020 propone un mapa del edificio para señalar la sala, pero aclara que aún no tiene aprobación. Se documenta como solicitud pendiente, no como requisito obligatorio confirmado. No debe confundirse con el mapa de selección de butacas, que sí pertenece al alcance.

## 16. Relación con el proyecto entregado

La revisión del RAR del 7 de octubre identifica estas áreas del frontend para demostrar los requisitos:

- Catálogo, búsqueda, reseñas y Próximamente: Inicio y Cartelera.
- Registro y sesión: Registro, navegación y AuthService.
- Salas, butacas, funciones y tarifas: panel Admin y sus componentes especializados.
- Reserva, Candy conjunto y pago: Butacas, CandyCompra, ConfirmarCompra y selector compartido de pago.
- Validación: Empleado y PanelService.
- Beneficios, películas vistas y crédito: MiPerfil, FidelizacionService y BeneficiosService.
- Reportes y exportaciones: BeneficiosAdmin y generador Excel.
- PWA: manifiesto, registro en main y script posterior al build.

Como extensiones se incluyen recuperación de contraseña, Candy independiente, ocultamiento del historial y vinculación de compras de invitado al confirmar una cuenta con el mismo correo. Estas extensiones no sustituyen los requisitos originales.

**Límite de la revisión:** el RAR contiene llamadas a Supabase, pero no las definiciones SQL, las implementaciones de Edge Functions ni el proceso de notificaciones. Los requisitos cuya garantía depende del backend deben demostrarse sobre la base configurada; este documento no acredita que esas garantías se hayan verificado mediante pruebas remotas. La arquitectura, dependencias y decisiones específicas se explican en el README.
