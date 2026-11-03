"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * Texto editable en el lugar (doble clic). Se confirma al salir del campo o con Enter (en una línea);
 * Esc cancela. Pega siempre como texto plano. Remonta con `key` al cambiar el valor desde afuera (deshacer, etc.).
 */
export function EditableText({
  value,
  onCommit,
  multiline = false,
  as: Tag = "div",
  style,
  className,
}: {
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  as?: "div" | "h1" | "p";
  style?: CSSProperties;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!editing || !el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editing]);

  const finish = (commit: boolean) => {
    const el = ref.current;
    if (!el) return;
    const next = el.innerText.replace(/\n+$/, "");
    if (!commit) el.innerText = value;
    setEditing(false);
    if (commit && next !== value) onCommit(next);
  };

  const T = Tag as "div";
  return (
    <T
      key={value}
      ref={ref as React.RefObject<HTMLDivElement>}
      contentEditable={editing}
      suppressContentEditableWarning
      spellCheck={false}
      title={editing ? undefined : "Doble clic para editar"}
      onDoubleClick={() => setEditing(true)}
      onBlur={() => editing && finish(true)}
      onKeyDown={(e) => {
        if (!editing) return;
        if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
          ref.current?.blur();
        } else if (e.key === "Enter" && !multiline) {
          e.preventDefault();
          ref.current?.blur();
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
      }}
      style={{
        ...style,
        // Al editar se muestra el texto tal cual se escribió: `innerText` respeta las mayúsculas visuales y
        // guardaría el texto ya en mayúsculas.
        textTransform: editing ? "none" : style?.textTransform,
        outline: editing ? "2px solid #2563eb" : undefined,
        outlineOffset: 2,
        cursor: editing ? "text" : undefined,
        whiteSpace: multiline ? "pre-wrap" : undefined,
        minHeight: "1em",
      }}
      className={className}
    >
      {value}
    </T>
  );
}
