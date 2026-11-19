"use client";

import { useEffect, useState } from "react";

/**
 * Botón hacia el alta (/registro). Si la landing se abrió con un link de creador (?ref=JUAN20), el código se conserva para que
 * el registro lo tome. La página sigue siendo estática: el código se lee recién en el navegador.
 */
export function CtaLink({ className, children, where }: { className: string; children: React.ReactNode; where: string }) {
  const [href, setHref] = useState("/registro");
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) setHref(`/registro?ref=${encodeURIComponent(ref.slice(0, 30))}`);
  }, []);
  return (
    <a href={href} className={className} data-cta={where}>
      {children}
    </a>
  );
}
