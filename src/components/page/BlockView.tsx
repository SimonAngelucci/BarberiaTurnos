import type { CSSProperties, ReactNode } from "react";
import { FONTS, fluidFont, type Align, type Block, type PageConfig, type TextBlock } from "@/lib/page-config";
import { EditableText } from "./EditableText";

// Renderizado de la página pública a partir de su configuración. Lo usan, sin cambios, la página real
// (/b/[slug]) y la vista previa del editor: lo que se ve en el editor es lo que se publica.

export type BlockCtx = {
  name: string;
  tagline: string;
  logoUrl: string | null;
  booking: ReactNode;
  /** Solo en el editor: habilita la edición de texto en el lugar. */
  edit?: { onText: (id: string, text: string) => void };
};

const JUSTIFY: Record<Align, CSSProperties["justifyContent"]> = { left: "flex-start", center: "center", right: "flex-end" };

export const alignOf = (b: Block): Align => ("align" in b ? b.align : "center");
export const widthOf = (b: Block) => ("widthPct" in b ? b.widthPct : 100);
const mtOf = (b: Block) => ("mt" in b ? b.mt : 0);
const mbOf = (b: Block) => ("mb" in b ? b.mb : 0);

/** Contenedor de un bloque: ancho en %, alineación y espaciado. `overlay` es solo para el editor. */
export function BlockBox({ block, children, overlay, innerStyle, innerProps }: {
  block: Block;
  children: ReactNode;
  overlay?: ReactNode;
  innerStyle?: CSSProperties;
  innerProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  return (
    <div style={{ display: "flex", justifyContent: JUSTIFY[alignOf(block)] }}>
      <div
        {...innerProps}
        style={{ position: "relative", width: `${widthOf(block)}%`, marginTop: mtOf(block), marginBottom: mbOf(block), textAlign: alignOf(block), ...innerStyle }}
      >
        {children}
        {overlay}
      </div>
    </div>
  );
}

/** Efectos de lettering en CSS puro. Los colores ya vienen validados (#RRGGBB) por el esquema. */
function fxCss(b: TextBlock): CSSProperties {
  const c = b.color ?? "var(--page-fg)"; // color base: el elegido o el automático según el fondo
  const f = b.fxColor;
  switch (b.fx) {
    case "shadow":
      return { textShadow: `3px 3px 0 ${f}` };
    case "outline":
      return { color: "transparent", WebkitTextStroke: `2px ${c}` };
    case "neon":
      return { textShadow: `0 0 4px ${f}, 0 0 12px ${f}, 0 0 28px ${f}` };
    case "gradient":
      return { backgroundImage: `linear-gradient(90deg, ${c}, ${f})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" };
    case "retro3d":
      return { textShadow: [1, 2, 3, 4, 5].map((n) => `${n}px ${n}px 0 ${f}`).join(", ") };
    case "stamp":
      return { display: "inline-block", border: `0.12em solid ${c}`, padding: "0.1em 0.45em", borderRadius: "0.12em" };
    default:
      return {};
  }
}

export function textStyle(b: TextBlock, line: number): CSSProperties {
  return {
    fontSize: fluidFont(b.size),
    fontWeight: b.weight,
    color: b.color ?? undefined,
    opacity: b.opacity,
    fontFamily: b.font ? FONTS[b.font].css : undefined,
    lineHeight: line,
    overflowWrap: "anywhere",
    letterSpacing: b.tracking ? `${b.tracking}px` : undefined,
    textTransform: b.caps ? "uppercase" : undefined,
    transform: b.rotate ? `rotate(${b.rotate}deg)` : undefined,
    ...fxCss(b),
  };
}

const RADIUS = { circle: "9999px", rounded: "16px", square: "0" } as const;

export function BlockContent({ block, ctx }: { block: Block; ctx: BlockCtx }) {
  switch (block.type) {
    case "logo":
      if (!ctx.logoUrl) {
        return ctx.edit ? (
          <div
            style={{ width: block.size, height: block.size, borderRadius: RADIUS[block.shape] }}
            className="inline-flex items-center justify-center border-2 border-dashed border-neutral-400 bg-white/60 px-1 text-center text-[11px] text-neutral-500"
          >
            Subí tu logo en «Negocio»
          </div>
        ) : null;
      }
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ctx.logoUrl} alt={ctx.name} style={{ width: block.size, height: block.size, borderRadius: RADIUS[block.shape], objectFit: "cover", display: "inline-block" }} className="bg-white shadow" />
      );
    case "title":
    case "tagline":
    case "text": {
      const value = block.type === "title" ? (block.text ?? ctx.name) : block.type === "tagline" ? (block.text ?? ctx.tagline) : block.text;
      const style = textStyle(block, block.type === "text" ? 1.5 : block.type === "title" ? 1.2 : 1.4);
      const Tag = block.type === "title" ? "h1" : "p";
      if (ctx.edit) {
        const defaultText = block.type === "title" ? ctx.name : block.type === "tagline" ? ctx.tagline : null;
        return (
          <EditableText
            as={Tag}
            value={value}
            multiline={block.type === "text"}
            style={style}
            onCommit={(t) => ctx.edit!.onText(block.id, defaultText !== null && t === defaultText ? "" : t)}
          />
        );
      }
      return <Tag style={{ ...style, whiteSpace: block.type === "text" ? "pre-wrap" : undefined }}>{value}</Tag>;
    }
    case "spacer":
      return <div style={{ height: block.height }} aria-hidden />;
    case "booking":
      // `zoom` escala el flujo completo (tarjetas, botones y textos) de forma proporcional.
      return <div style={{ zoom: block.scale, color: block.color ?? undefined, textAlign: "left" }}>{ctx.booking}</div>;
  }
}

/** Marco de la página: fuente global, ancho máximo, radio de tarjetas y contenedor para las unidades `cqw`. */
export function PageFrame({ config, children, style, className = "" }: { config: PageConfig; children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <div
      className={`mx-auto w-full px-4 py-8 ${className}`}
      style={{
        maxWidth: config.global.maxWidth,
        fontFamily: FONTS[config.global.font].css,
        containerType: "inline-size",
        ["--card-radius" as string]: `${config.global.cardRadius}px`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
