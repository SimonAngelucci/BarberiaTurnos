/**
 * Interruptores de funciones del panel. Para volver a activar una, cambiá el valor a `true`: no hace falta tocar nada más.
 *
 * DESIGN_EDITOR: editor visual «Diseño de tu página». Apagado, no aparece en el panel, /admin/design da «no encontrado» y el
 * servidor rechaza guardar un diseño. El código (src/components/page/*, _sections/Design.tsx, saveDesign) sigue en el proyecto,
 * y las páginas públicas siguen usando el diseño que ya estaba guardado (colores, fuentes) sin cambios.
 */
export const FEATURES = {
  DESIGN_EDITOR: false,
} as const;
