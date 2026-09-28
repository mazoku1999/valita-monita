import { MARCA } from '../contenido/capitulos'

export function NarrativaFooter() {
  return (
    <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex items-end justify-between px-5 py-5 font-mono-narrativa text-[11px] uppercase tracking-[0.32em] md:px-6">
      <p className="flex items-center gap-4">
        <span className="hidden text-gris-tenue sm:inline">{MARCA.reloj}</span>
        <span className="text-oro">{MARCA.estadoReloj}</span>
      </p>
      <p className="flex items-center gap-3">
        <span className="text-crema">{MARCA.numeroCapitulo}</span>
        <span className="text-gris-tenue">/</span>
        <span className="text-gris">{MARCA.nombreCapitulo}</span>
      </p>
    </footer>
  )
}
