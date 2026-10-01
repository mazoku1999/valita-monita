'use client'

import { useSyncExternalStore } from 'react'
import { CARRIL_VH } from '@/features/agujero-negro/constantes/viajeScroll'
import { obtenerProgreso, suscribirProgreso } from '@/features/narrativa/store/progresoScrollStore'
import { CANCION } from '../constantes/cancion'
import { faseCancion, suscribirCancion } from '../store/cancion'
import { alternarSonido, cancionAudible, estadoDelSonido, suscribirSonido } from '../utils/audio'

/**
 * El sonido de la canción del agujero negro. Al inicio, un botón de cristal bajo el agujero para
 * activarlo (lo pidió el usuario: "que al inicio haya algo para activar el sonido"; los navegadores
 * no dejan sonar sin un gesto y la rueda no cuenta). Al empezar a bajar (o al activarlo) se queda
 * pequeño arriba a la derecha, para apagarlo o encenderlo mientras la canción esté por llegar o
 * suene; si aún no se activó, con un brillo que invita a tocarlo.
 */

const enElInicio = (): boolean => obtenerProgreso() * CARRIL_VH < 40
/** Más allá ya no hace falta (y arriba a la derecha van los botones del paseo del final). */
const lejos = (): boolean => obtenerProgreso() * CARRIL_VH > 1100

export function BotonSonido() {
  const estado = useSyncExternalStore(suscribirSonido, estadoDelSonido, () => 'pendiente' as const)
  const audible = useSyncExternalStore(suscribirSonido, cancionAudible, () => false)
  const fase = useSyncExternalStore(suscribirCancion, faseCancion, () => 'armada' as const)
  const inicio = useSyncExternalStore(suscribirProgreso, enElInicio, () => true)
  const fuera = useSyncExternalStore(suscribirProgreso, lejos, () => false)
  if (fuera || (fase === 'libre' && !audible)) return null
  const activo = estado === 'activo'
  return (
    <button
      type="button"
      className="boton-cristal boton-sonido"
      data-lugar={inicio && estado === 'pendiente' ? 'inicio' : 'esquina'}
      data-estado={estado}
      aria-label={activo ? 'Silenciar la canción' : 'Activar el sonido'}
      aria-pressed={activo}
      onClick={() => alternarSonido(CANCION.audio)}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3.5 9.4 H7 L11.6 5.6 V18.4 L7 14.6 H3.5 Z" fill="currentColor" />
        {activo ? (
          <>
            <path d="M15.1 9.2 C16.4 10.6 16.4 13.4 15.1 14.8" />
            <path d="M17.8 6.6 C20.6 9.3 20.6 14.7 17.8 17.4" />
          </>
        ) : (
          <path d="M15.6 9.6 L20.4 14.4 M20.4 9.6 L15.6 14.4" />
        )}
      </svg>
    </button>
  )
}
