import { CopyButton } from "@/components/ui/CopyButton";

/** Link con su botón de copiar (ícono). Server component: el único cliente es el botón. */
export function CopyLink({ url }: { url: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={url} target="_blank" className="min-w-0 truncate text-sm underline">
        {url}
      </a>
      <CopyButton text={url} label="Copiar link" />
    </div>
  );
}