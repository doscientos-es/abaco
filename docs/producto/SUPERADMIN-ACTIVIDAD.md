# Actividad de superadmin

El menú «Actividad» muestra los cambios en renovaciones, archivo, acuerdos de
cuota, IVA, territorio fiscal, tarifas de catálogo y cortesías de módulos.
Desde cada empresa puede verse su propio historial.

Los cambios de renovación, archivo, acuerdos de cuota e IVA se leen de los
registros existentes. El territorio, las tarifas y las cortesías se registran
desde esta migración, dentro de la misma transacción que el cambio. Un fallo o
una modificación sin cambios materiales no agrega una entrada.

Solo el superadmin puede consultar la actividad. La API devuelve una proyección
de valores permitidos y no expone NIF, domicilio, códigos postales, contactos
de facturación, credenciales ni referencias de pago. El operador se identifica
por su cuenta de plataforma actual si sigue disponible. No hay edición ni
eliminación del historial desde la aplicación.
