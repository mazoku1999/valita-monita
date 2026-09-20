import type { Epilogo } from '../contenido/capitulos'

interface EpilogoSectionProps {
  epilogo: Epilogo
}

export function EpilogoSection({ epilogo }: EpilogoSectionProps) {
  return (
    <section
      aria-labelledby="titulo-epilogo"
      className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
    >
      <p className="font-mono-narrativa text-[11px] uppercase tracking-[0.32em] text-oro-tenue">
        {epilogo.etiqueta}
      </p>
      <h2
        id="titulo-epilogo"
        className="mt-8 max-w-[16ch] font-serif-display text-[clamp(2.5rem,5vw,5.2rem)] leading-[0.98] tracking-[-0.015em] text-crema text-balance"
      >
        {epilogo.titulo} <em className="font-normal text-oro">{epilogo.enfasis}</em>
      </h2>
      <p className="mt-10 max-w-[44ch] font-mono-narrativa text-[13px] leading-[1.95] text-gris">
        {epilogo.cierre}
      </p>
    </section>
  )
}
