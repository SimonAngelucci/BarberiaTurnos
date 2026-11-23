/**
 * Esqueleto que aparece al instante al cambiar de pestaña (el menú y la barra de arriba ya están: viven en el layout). Tiene la
 * misma forma que las pantallas del panel (bloque de color, tarjetas) para que el cambio no deje la pantalla en blanco.
 */
export default function Loading() {
  return (
    <div data-skel aria-busy="true" aria-label="Cargando" className="space-y-6 motion-safe:animate-pulse">
      <div className="h-44 rounded-b-[2.5rem] rounded-t-[1.75rem]" style={{ background: "var(--hero)", opacity: 0.55 }} />
      <div className="grid grid-cols-2 gap-3">
        <div className="card h-14 !rounded-2xl" />
        <div className="card h-14 !rounded-2xl" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="h-40 rounded-[1.75rem]" style={{ background: "var(--ink)", opacity: 0.85 }} />
        <div className="card h-40 !rounded-[1.75rem]" />
      </div>
      <div className="card h-32" />
    </div>
  );
}
