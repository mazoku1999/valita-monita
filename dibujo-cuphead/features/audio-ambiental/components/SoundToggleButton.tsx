'use client'

import { useAudioAmbiental } from '../hooks/useAudioAmbiental'

export function SoundToggleButton() {
  const { activo, alternar } = useAudioAmbiental()

  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={() => void alternar()}
      className={`pointer-events-auto flex cursor-pointer items-center gap-2 font-mono-narrativa text-[11px] uppercase tracking-[0.32em] transition-colors duration-500 ${
        activo ? 'text-crema' : 'text-gris hover:text-crema/80'
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block size-1.5 rounded-full transition-all duration-500 ${
          activo ? 'bg-oro shadow-[0_0_8px_2px_rgba(217,166,96,0.55)]' : 'bg-gris-tenue'
        }`}
      />
      <span>{activo ? 'Sound on' : 'Sound off'}</span>
    </button>
  )
}
