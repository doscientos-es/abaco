# DEV-74 · Mediciones tipadas

Esta primera entrega se limita a visitas con una piscina vinculada y parámetros configurados en el modelo que ya existe. Se registra un valor numérico en la unidad del parámetro y con el método indicado. Un cambio de unidad o de versión mientras se rellena el parte obliga a revisar y volver a introducir el valor. No hay borrador de mediciones sin conexión; esto no cambia el guardado offline del texto del parte.

Tras registrar, la comparación muestra únicamente el valor, unidad y fecha de la lectura válida más reciente de otra visita finalizada anterior a la lectura actual. Requiere misma empresa, activo, parámetro, unidad histórica y método exacto; omite lecturas reemplazadas por correcciones. Sin coincidencia no hay diferencia, tendencia ni evaluación. No se convierten unidades ni se exponen identidad, notas, evaluaciones de cumplimiento ni otros datos del parte histórico. La visibilidad debe renovarse cuando cambia la asignación actual y siempre se comprueba en el servidor.

## Para otros equipos o instalaciones

Esta entrega no cubre medidas generales sin un catálogo acordado. Empezar por un activo no piscina concreto y definir los parámetros aplicables con códigos estables, unidades permitidas y métodos identificables. Después generalizar la relación de la definición hacia activos de esa empresa, manteniendo las lecturas inmutables, los identificadores de parámetros de piscina y su historial. Evitar una segunda tabla de observaciones libres o reutilizar unidades de consumos como si fueran medidas. Conservar el mismo control de versión/unidad, comparación exacta e interfaz hasta que exista una regla explícita, probada y reversible para cualquier conversión.
