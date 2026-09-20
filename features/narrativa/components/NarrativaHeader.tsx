import { SelectorVista } from '@/features/agujero-negro/components/SelectorVista'
import { SoundToggleButton } from '@/features/audio-ambiental/components/SoundToggleButton'
import { MARCA } from '../contenido/capitulos'

export function NarrativaHeader() {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between px-5 py-5 font-mono-narrativa text-[11px] uppercase tracking-[0.32em] md:px-6">
      <span className="text-crema">{MARCA.nombre}</span>
      <div className="flex items-center gap-6 md:gap-12">
        <span className="hidden text-gris 2xl:inline">{MARCA.lema}</span>
        <SelectorVista />
        <SoundToggleButton />
      </div>
    </header>
  )
}
