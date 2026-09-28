import type { Capitulo } from '../contenido/capitulos'

interface CapituloSectionProps {
  capitulo: Capitulo
}

export function CapituloSection({ capitulo }: CapituloSectionProps) {
  return (
    <section
      aria-labelledby="titulo-capitulo"
      className="min-h-[200vh] px-6 md:pl-[7.8vw] md:pr-0"
    >
      <p className="font-mono-narrativa text-[11px] uppercase tracking-[0.32em] text-oro-tenue">
        {capitulo.etiqueta}
      </p>

      <h1
        id="titulo-capitulo"
        className="mt-9 font-serif-display text-[clamp(2.6rem,5.2vw,5.6rem)] leading-[1.02] tracking-[-0.015em] text-crema"
      >
        {capitulo.lineasTitulo.map((linea) => (
          <span key={linea} className="block">
            {linea}
          </span>
        ))}
        <em className="block font-normal text-oro">{capitulo.enfasis}</em>
      </h1>

      <p className="mt-10 max-w-[38ch] font-mono-narrativa text-[13.5px] leading-[1.95] text-gris">
        {capitulo.cuerpo}
      </p>

      <p className="mt-9 flex max-w-[130ch] items-baseline gap-3 font-mono-narrativa text-[11px] uppercase tracking-[0.3em] text-oro">
        <span aria-hidden="true" className="size-1.5 shrink-0 translate-y-[-1px] rounded-full bg-oro" />
        <span>{capitulo.nota}</span>
      </p>
    </section>
  )
}
