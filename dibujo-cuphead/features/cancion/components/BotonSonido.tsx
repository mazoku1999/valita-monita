'use client'

import { useSyncExternalStore } from 'react'
import { faseCarta, suscribirCarta } from '@/features/cochabamba/store/carta'
import { paseoActivo, suscribirPaseo } from '@/features/cochabamba/store/paseo'
import { CANCION } from '../constantes/cancion'
import { alternarSonido, estadoDelSonido, suscribirSonido } from '../utils/audio'

/** El dibujo del parlante: con sus ondas (suena) o con una cruz (en silencio). */
export function IconoSonido({ activo }: { activo: boolean }) {
  return (
    <>
      <path d="M3.5 9.4 H7 L11.6 5.6 V18.4 L7 14.6 H3.5 Z" fill="currentColor" />
      {activo ? (
        <>
          <path d="M15.1 9.2 C16.4 10.6 16.4 13.4 15.1 14.8" />
          <path d="M17.8 6.6 C20.6 9.3 20.6 14.7 17.8 17.4" />
        </>
      ) : (
        <path d="M15.6 9.6 L20.4 14.4 M20.4 9.6 L15.6 14.4" />
      )}
    </>
  )
}

/**
 * El sonido (la canción y el sonido ambiente, ver `features/ambiente`), pequeño arriba a la
 * derecha: para apagarlo o encenderlo en todo el viaje. Se activa al inicio, en el diálogo que hay
 * que presionar (ver `DialogoSonido`); mientras está, este botón no se ve. En el paseo del final va
 * entre sus botones (ver `ControlesPaseo`) y con la carta abierta no hace falta.
 */
export function BotonSonido() {
  const estado = useSyncExternalStore(suscribirSonido, estadoDelSonido, () => 'pendiente' as const)
  const posado = useSyncExternalStore(suscribirPaseo, paseoActivo, () => false)
  const carta = useSyncExternalStore(suscribirCarta, faseCarta, () => 'cerrada' as const)
  if (estado === 'pendiente' || posado || carta !== 'cerrada') return null
  const activo = estado === 'activo'
  return (
    <button
      type="button"
      className="boton-cristal boton-sonido"
      aria-label={activo ? 'Silenciar el sonido' : 'Activar el sonido'}
      aria-pressed={activo}
      onClick={() => alternarSonido(CANCION.audio)}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <IconoSonido activo={activo} />
      </svg>
    </button>
  )
}
