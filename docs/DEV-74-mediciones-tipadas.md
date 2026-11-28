# DEV-74 · Mediciones tipadas

Esta primera entrega se limita a visitas con una piscina vinculada y parámetros configurados en el modelo que ya existe. Se registra un valor numérico en la unidad del parámetro y con el método indicado. Un cambio de unidad o de versión mientras se rellena el parte obliga a revisar y volver a introducir el valor. No hay borrador de mediciones sin conexión; esto no cambia el guardado offline del texto del parte.

Tras registrar, la comparación muestra únicamente el valor, unidad y fecha de la lectura válida más reciente de otra visita finalizada anterior a la lectura actual. Requiere misma empresa, activo, parámetro, unidad histórica y método exacto; omite lecturas reemplazadas por correcciones. Sin coincidencia no hay diferencia, tendencia ni evaluación. No se convierten unidades ni se exponen identidad, notas, evaluaciones de cumplimiento ni otros datos del parte histórico. La visibilidad debe renovarse cuando cambia la asignación actual y siempre se comprueba en el servidor.

## Para otros equipos o instalaciones

Esta entrega no cubre medidas generales sin un catálogo acordado. Empezar por un activo no piscina concreto y definir los parámetros aplicables con códigos estables, unidades permitidas y métodos identificables. Después generalizar la relación de la definición hacia activos de esa empresa, manteniendo las lecturas inmutables, los identificadores de parámetros de piscina y su historial. Evitar una segunda tabla de observaciones libres o reutilizar unidades de consumos como si fueran medidas. Conservar el mismo control de versión/unidad, comparación exacta e interfaz hasta que exista una regla explícita, probada y reversible para cualquier conversión.

## Prototipo local de activos genéricos

Para un activo genérico activo ya vinculado a una visita abierta, coordinación puede iniciar el catálogo desde el propio parte. Registra explícitamente nombre, unidad y método. Cada parámetro creado conserva esa definición; no se ofrecen edición, borrado, límites, conversiones ni alta de equipos. Si cambia el significado, se define otro parámetro en vez de reinterpretar el histórico. El técnico solo registra el valor con la unidad y el método fijados.

El prototipo conserva todas las relaciones de piscina. Las definiciones genéricas y sus lecturas inmutables se guardan en tablas privadas aparte, detrás de los mismos RPC de lectura y registro y el mismo panel. La lectura anterior continúa siendo un valor, una unidad y una fecha, sin informes ni adjuntos. Está acotada al mismo activo, parámetro, unidad y método. El selector de activos existentes en altas de nuevas visitas queda fuera; debe respetar empresa y centro. No hace falta un ciclo de alta de equipos para utilizar visitas ya vinculadas.

Las lecturas genéricas se consultan con permisos del parte y no se añaden al PDF ni al enlace público.
