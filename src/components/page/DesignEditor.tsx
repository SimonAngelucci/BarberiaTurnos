"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BookingFlow } from "@/components/BookingFlow";
import { Modal } from "@/components/Modal";
import { saveDesign } from "@/app/admin/actions";
import { contrastFg } from "@/lib/format";
import type { PayConfig } from "@/lib/payment-math";
import { ALL_FONTS_HREF, defaultConfig, newBlockId, type Block, type PageConfig } from "@/lib/page-config";
import { BlockBox, BlockContent, PageFrame, alignOf, type BlockCtx } from "./BlockView";
import { Inspector, type AddType } from "./Inspector";

// ---------------------------------------------------------------- historial (deshacer / rehacer)
type H = { past: PageConfig[]; present: PageConfig; future: PageConfig[] };
type A = { t: "set"; cfg: PageConfig; coalesce: boolean } | { t: "undo" } | { t: "redo" };

function reduce(h: H, a: A): H {
  switch (a.t) {
    case "set":
      // coalesce: arrastrar un slider/manija genera muchos cambios seguidos; cuentan como un solo paso.
      return a.coalesce ? { ...h, present: a.cfg, future: [] } : { past: [...h.past.slice(-49), h.present], present: a.cfg, future: [] };
    case "undo":
      return h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h;
    case "redo":
      return h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h;
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const LABEL: Record<Block["type"], string> = { logo: "Logo", title: "Título", tagline: "Subtítulo", text: "Texto", spacer: "Espacio", booking: "Reservas" };

/** Arrastre con el puntero para las manijas de tamaño (mouse y táctil). */
function startDrag(e: React.PointerEvent, onMove: (dx: number, dy: number) => void) {
  e.preventDefault();
  e.stopPropagation();
  const x0 = e.clientX;
  const y0 = e.clientY;
  const move = (ev: PointerEvent) => onMove(ev.clientX - x0, ev.clientY - y0);
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}

// ---------------------------------------------------------------- bloque arrastrable con manijas
type Patch = (id: string, p: Record<string, unknown>, key?: string) => void;

function SortableBlock({ block, selected, onSelect, ctx, patch, remove, duplicate }: {
  block: Block;
  selected: boolean;
  onSelect: (id: string) => void;
  ctx: BlockCtx;
  patch: Patch;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const align = alignOf(block);
  const hasWidth = "widthPct" in block;
  const dragKey = `drag:${block.id}`;

  // Ancho disponible = el del contenedor de la página (padre del bloque), para convertir píxeles en %.
  const containerW = (el: EventTarget) => (el as HTMLElement).offsetParent?.parentElement?.clientWidth ?? 358;

  const widthHandle = (side: "left" | "right") => {
    if (!hasWidth) return null;
    if ((side === "right" && align === "right") || (side === "left" && align === "left")) return null; // el borde pegado al costado no se mueve
    const factor = align === "center" ? 2 : 1;
    const dir = side === "right" ? 1 : -1;
    return (
      <div
        role="separator"
        aria-label="Cambiar ancho"
        onPointerDown={(e) => {
          const w = containerW(e.currentTarget);
          const base = (block as { widthPct: number }).widthPct;
          const min = block.type === "booking" ? 40 : 20;
          startDrag(e, (dx) => patch(block.id, { widthPct: Math.round(clamp(base + ((dir * dx * factor) / w) * 100, min, 100)) }, dragKey));
        }}
        className={`absolute top-1/2 z-10 h-10 w-3 -translate-y-1/2 cursor-ew-resize touch-none rounded-full bg-blue-600 ${side === "right" ? "-right-2" : "-left-2"}`}
      />
    );
  };

  const cornerHandle = () => {
    const base = (() => {
      switch (block.type) {
        case "title":
        case "tagline":
        case "text":
        case "logo":
          return block.size;
        case "booking":
          return block.scale;
        default:
          return 0;
      }
    })();
    if (block.type === "spacer") {
      return (
        <div
          role="separator"
          aria-label="Cambiar altura"
          onPointerDown={(e) => startDrag(e, (_, dy) => patch(block.id, { height: Math.round(clamp(block.height + dy, 0, 240)) }, dragKey))}
          className="absolute -bottom-2 left-1/2 z-10 h-3 w-12 -translate-x-1/2 cursor-ns-resize touch-none rounded-full bg-blue-600"
        />
      );
    }
    return (
      <div
        role="separator"
        aria-label="Cambiar tamaño"
        onPointerDown={(e) =>
          startDrag(e, (dx, dy) => {
            const d = dx + dy;
            if (block.type === "booking") patch(block.id, { scale: Math.round(clamp(base + d / 800, 0.8, 1.3) * 100) / 100 }, dragKey);
            else if (block.type === "logo") patch(block.id, { size: Math.round(clamp(base + d / 2, 32, 240)) }, dragKey);
            else patch(block.id, { size: Math.round(clamp(base + d * 0.25, 10, 96)) }, dragKey);
          })
        }
        className="absolute -bottom-2 -right-2 z-10 h-4 w-4 cursor-nwse-resize touch-none rounded-full border-2 border-blue-600 bg-white"
      />
    );
  };

  const overlay = selected ? (
    <>
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        type="button"
        aria-label={`Mover ${LABEL[block.type]}`}
        className="absolute -top-7 left-0 z-10 flex cursor-grab touch-none items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-medium text-white active:cursor-grabbing"
      >
        <span aria-hidden>⠿</span> {LABEL[block.type]}
      </button>
      {block.type !== "booking" && (
        <div className="absolute -top-7 right-0 z-10 flex gap-1">
          {(block.type === "text" || block.type === "spacer") && (
            <button type="button" onClick={() => duplicate(block.id)} className="rounded-md bg-white px-2 py-1 text-[11px] font-medium text-neutral-700 shadow ring-1 ring-neutral-300" aria-label="Duplicar">
              Duplicar
            </button>
          )}
          <button type="button" onClick={() => remove(block.id)} className="rounded-md bg-white px-2 py-1 text-[11px] font-medium text-red-600 shadow ring-1 ring-neutral-300" aria-label="Eliminar">
            Eliminar
          </button>
        </div>
      )}
      {widthHandle("right")}
      {widthHandle("left")}
      {cornerHandle()}
    </>
  ) : null;

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.6 : 1, position: "relative", zIndex: isDragging ? 20 : selected ? 10 : undefined }}>
      <BlockBox
        block={block}
        overlay={overlay}
        innerProps={{
          onClick: (e) => {
            e.stopPropagation();
            onSelect(block.id);
          },
          className: "cursor-pointer rounded-sm outline-offset-[3px] hover:outline hover:outline-1 hover:outline-blue-300",
        }}
        innerStyle={selected ? { outline: "2px solid #2563eb" } : undefined}
      >
        <BlockContent block={block} ctx={ctx} />
      </BlockBox>
    </div>
  );
}

// ---------------------------------------------------------------- editor
type BookingData = {
  slug: string;
  timezone: string;
  currency: string;
  maxAdvanceDays: number;
  pay: PayConfig;
  businessType?: import("@/lib/service-icons").BusinessType;
  services: { id: string; name: string; description: string | null; priceCents: number; durationMin: number; iconKey?: string | null; iconUrl?: string | null; comingSoon?: boolean }[];
  barbers: { id: string; name: string; photoUrl: string | null; bio: string | null }[];
};

export function DesignEditor({ initial, business, publicUrl, booking }: {
  initial: PageConfig;
  business: { name: string; tagline: string; logoUrl: string | null; primaryColor: string; bgColor: string };
  publicUrl: string;
  booking: BookingData;
}) {
  const [h, dispatch] = useReducer(reduce, { past: [], present: initial, future: [] });
  const cfg = h.present;
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const last = useRef({ key: "", t: 0 });

  const [sel, setSel] = useState<string | null>(null);
  const [pageOpen, setPageOpen] = useState(false); // solo celular: panel de ajustes de la página
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const dirty = JSON.stringify(cfg) !== saved;
  const block = cfg.blocks.find((b) => b.id === sel) ?? null;

  const update = useCallback((fn: (c: PageConfig) => PageConfig, key = "") => {
    const next = fn(cfgRef.current);
    const now = Date.now();
    const coalesce = !!key && last.current.key === key && now - last.current.t < 800;
    last.current = { key, t: now };
    cfgRef.current = next;
    dispatch({ t: "set", cfg: next, coalesce });
  }, []);

  const patch = useCallback<Patch>((id, p, key) => update((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === id ? ({ ...b, ...p } as Block) : b)) }), key), [update]);
  const setGlobal = useCallback((p: Partial<PageConfig["global"]>, key = "global") => update((c) => ({ ...c, global: { ...c.global, ...p } }), key), [update]);

  const insert = useCallback((nb: Block) => {
    update((c) => {
      const at = c.blocks.findIndex((b) => b.id === sel);
      const idx = at >= 0 ? at + 1 : c.blocks.findIndex((b) => b.type === "booking");
      const blocks = [...c.blocks];
      blocks.splice(idx < 0 ? blocks.length : idx, 0, nb);
      return { ...c, blocks };
    });
    setSel(nb.id);
  }, [update, sel]);

  const add = useCallback((type: AddType) => {
    const t = {
      weight: 400 as const, color: null, opacity: 1, align: "center" as const, font: null, widthPct: 100, mt: 0, mb: 12,
      fx: "none" as const, fxColor: "#ff2d95", tracking: 0, caps: false, rotate: 0,
    };
    const nb: Block =
      type === "text" ? { id: newBlockId("t"), type: "text", text: "Tu texto aquí", size: 16, ...t }
      : type === "spacer" ? { id: newBlockId("s"), type: "spacer", height: 24 }
      : type === "logo" ? { id: newBlockId("logo"), type: "logo", size: 80, shape: "circle", align: "center", mt: 0, mb: 12 }
      : type === "title" ? { id: newBlockId("title"), type: "title", text: null, size: 24, ...t, weight: 700 }
      : { id: newBlockId("tag"), type: "tagline", text: null, size: 16, ...t, opacity: 0.7 };
    insert(nb);
  }, [insert]);

  const duplicate = useCallback((id: string) => {
    const src = cfgRef.current.blocks.find((b) => b.id === id);
    if (!src || src.type === "booking" || src.type === "logo" || src.type === "title" || src.type === "tagline") return;
    insert({ ...src, id: newBlockId(src.type === "text" ? "t" : "s") });
  }, [insert]);

  const remove = useCallback((id: string) => {
    update((c) => ({ ...c, blocks: c.blocks.filter((b) => b.id !== id || b.type === "booking") }));
    setSel(null);
  }, [update]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    update((c) => {
      const from = c.blocks.findIndex((b) => b.id === e.active.id);
      const to = c.blocks.findIndex((b) => b.id === e.over!.id);
      return { ...c, blocks: arrayMove(c.blocks, from, to) };
    });
  };

  // Atajos: Ctrl/Cmd+Z deshacer, Ctrl+Y o Ctrl+Shift+Z rehacer, Esc deselecciona (no interfieren al escribir).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ t: e.shiftKey ? "redo" : "undo" });
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch({ t: "redo" });
      } else if (e.key === "Escape") setSel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Avisa si se intenta salir con cambios sin publicar.
  useEffect(() => {
    if (!dirty) return;
    const f = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [dirty]);

  async function save() {
    setSaving(true);
    setMsg(null);
    const snapshot = JSON.stringify(cfg);
    const r = await saveDesign(cfg).catch(() => null);
    setSaving(false);
    if (r?.ok) {
      setSaved(snapshot);
      setMsg({ ok: true, text: r.message ?? "Diseño publicado." });
    } else setMsg({ ok: false, text: r?.error ?? "No se pudo guardar. Intentá de nuevo." });
  }

  const ctx: BlockCtx = {
    name: business.name,
    tagline: business.tagline,
    logoUrl: business.logoUrl,
    // La vista previa es solo para mirar: el formulario real no se puede operar acá.
    booking: (
      <div className="pointer-events-none select-none">
        <BookingFlow {...booking} />
      </div>
    ),
    edit: {
      onText: (id, text) => {
        const b = cfgRef.current.blocks.find((x) => x.id === id);
        patch(id, { text: b?.type === "text" ? text : text === "" ? null : text }, `text:${id}`);
      },
    },
  };

  const frameVars = {
    ["--brand" as string]: business.primaryColor,
    ["--brand-fg" as string]: contrastFg(business.primaryColor),
    ["--page-bg" as string]: business.bgColor,
    ["--page-fg" as string]: contrastFg(business.bgColor),
  };
  const sheetOpen = block !== null || pageOpen;
  const present = new Set(cfg.blocks.map((b) => b.type as string));

  return (
    <div className="relative left-1/2 w-[min(1240px,100vw-3rem)] -translate-x-1/2 space-y-3">
      {ALL_FONTS_HREF && <link rel="stylesheet" href={ALL_FONTS_HREF} precedence="default" />}

      <div className="card flex flex-wrap items-center gap-2 !p-2">
        <button type="button" className="btn-ghost" disabled={!h.past.length} onClick={() => dispatch({ t: "undo" })} aria-label="Deshacer" title="Deshacer (Ctrl+Z)">
          ↶ Deshacer
        </button>
        <button type="button" className="btn-ghost" disabled={!h.future.length} onClick={() => dispatch({ t: "redo" })} aria-label="Rehacer" title="Rehacer (Ctrl+Y)">
          ↷ Rehacer
        </button>
        <div className="mx-1 hidden h-6 w-px bg-neutral-200 sm:block" />
        <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-neutral-300 text-sm">
          {(["mobile", "desktop"] as const).map((d) => (
            <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)} className={`px-3 py-2 font-medium ${device === d ? "bg-neutral-900 text-white" : "bg-white hover:bg-neutral-100"}`}>
              {d === "mobile" ? "📱 Móvil" : "🖥 Escritorio"}
            </button>
          ))}
        </div>
        <button type="button" className="btn-ghost lg:hidden" onClick={() => { setSel(null); setPageOpen((v) => !v); }}>
          ⚙ Página
        </button>
        <button type="button" className="btn-ghost" onClick={() => setConfirmReset(true)}>
          Restablecer
        </button>
        <div className="ml-auto flex items-center gap-2">
          <a href={publicUrl} target="_blank" className="btn-ghost">
            Ver página ↗
          </a>
          <button type="button" className="btn" disabled={saving || !dirty} onClick={save}>
            {saving ? "Publicando…" : dirty ? "Guardar y publicar ●" : "Publicado ✓"}
          </button>
        </div>
      </div>
      {msg && <p className={`rounded-xl p-3 text-sm ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className={`min-w-0 rounded-2xl bg-neutral-200/60 p-3 ${sheetOpen ? "max-lg:pb-[52vh]" : ""}`}>
          <div
            className="mx-auto overflow-hidden rounded-xl border border-neutral-300 shadow-sm transition-[width] duration-200"
            style={{ ...frameVars, width: device === "mobile" ? 390 : "100%", maxWidth: "100%", background: "var(--page-bg)", color: "var(--page-fg)" }}
            onClick={() => {
              setSel(null);
              setPageOpen(false);
            }}
          >
            <PageFrame config={cfg} style={{ minHeight: 520 }}>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={cfg.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                  {cfg.blocks.map((b) => (
                    <SortableBlock key={b.id} block={b} selected={b.id === sel} onSelect={(id) => { setSel(id); setPageOpen(false); }} ctx={ctx} patch={patch} remove={remove} duplicate={duplicate} />
                  ))}
                </SortableContext>
              </DndContext>
            </PageFrame>
          </div>
          <p className="mt-2 text-center text-xs text-neutral-500">Tocá un elemento para editarlo · arrastrá la etiqueta azul para moverlo · usá las manijas para cambiar su tamaño</p>
        </div>

        {/* En escritorio es una columna fija; en celular, una hoja inferior que aparece al seleccionar */}
        <aside
          className={`card ${sheetOpen ? "" : "max-lg:hidden"} max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:max-h-[48vh] max-lg:overflow-y-auto max-lg:rounded-b-none max-lg:shadow-2xl lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto`}
        >
          <button type="button" className="mb-2 text-xs text-neutral-500 underline lg:hidden" onClick={() => { setSel(null); setPageOpen(false); }}>
            Cerrar panel
          </button>
          <Inspector cfg={cfg} block={block} patch={patch} setGlobal={setGlobal} add={add} remove={remove} duplicate={duplicate} present={present} />
        </aside>
      </div>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="¿Restablecer el diseño?">
        <p className="text-sm">Vuelve al diseño original. Podés deshacerlo con «Deshacer» mientras no cierres esta pantalla, y recién se publica cuando guardás.</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setConfirmReset(false)}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              update(() => defaultConfig());
              setSel(null);
              setConfirmReset(false);
            }}
          >
            Restablecer
          </button>
        </div>
      </Modal>
    </div>
  );
}
