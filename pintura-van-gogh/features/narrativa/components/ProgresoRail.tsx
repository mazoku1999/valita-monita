'use client'

import { FOTOGRAMAS_CAMARA } from '@/features/agujero-negro/utils/fotogramasCamara'
import { useProgresoScroll } from '../store/progresoScrollStore'

const ALTURA_MARCADOR = 9

export function ProgresoRail() {
  const progreso = useProgresoScroll()
  const posicion = progreso * (100 - ALTURA_MARCADOR)

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed right-5 top-[29vh] z-20 hidden h-[42vh] w-3 md:block"
    >
      <div className="absolute right-0 top-0 h-full w-px bg-crema/15" />
      {FOTOGRAMAS_CAMARA.map((fotograma) => (
        <span
          key={fotograma.progreso}
          className="absolute right-0 h-px w-2 bg-crema/25"
          style={{ top: `${fotograma.progreso * 100}%` }}
        />
      ))}
      <span
        className="absolute right-0 w-px bg-oro shadow-[0_0_6px_1px_rgba(217,166,96,0.6)] transition-[top] duration-150 ease-out"
        style={{ top: `${posicion}%`, height: `${ALTURA_MARCADOR}%` }}
      />
    </div>
  )
}
