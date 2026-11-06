/** Resume un user-agent en «Navegador · Sistema (tipo de dispositivo)». Es solo para mostrar, no para decidir nada. */
export function describeDevice(ua: string | null | undefined): { browser: string; os: string; kind: "Celular" | "Tablet" | "Computadora" } {
  const s = ua ?? "";
  const browser = /Edg\//.test(s) ? "Edge" : /OPR\/|Opera/.test(s) ? "Opera" : /Firefox\//.test(s) ? "Firefox" : /Chrome\/|CriOS/.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : "Navegador desconocido";
  const os = /Windows/.test(s) ? "Windows" : /Android/.test(s) ? "Android" : /iPhone|iPad|iPod/.test(s) ? "iOS" : /Mac OS X|Macintosh/.test(s) ? "macOS" : /Linux/.test(s) ? "Linux" : "Sistema desconocido";
  const kind = /iPad|Tablet/.test(s) ? "Tablet" : /Mobi|iPhone|Android/.test(s) ? "Celular" : "Computadora";
  return { browser, os, kind };
}
