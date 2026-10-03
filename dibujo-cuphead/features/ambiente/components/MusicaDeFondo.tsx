'use client'

import { useEffect } from 'react'
import { faseCancion } from '@/features/cancion/store/cancion'
import { cancionAudible, estadoDelSonido, reanudarAudio } from '@/features/cancion/utils/audio'
import { faseCarta } from '@/features/cochabamba/store/carta'
import { ajustarMusicaDeFondo, estadoMusicaDeFondo, precargarMusicaDeFondo } from '../utils/musicaDeFondo'

/**
 * La música de fondo (ver `utils/musicaDeFondo.ts`) donde no suena otra: desde que se activa el sonido en
 * el diálogo del inicio, salvo mientras suena la canción del agujero o la música de la carta, o si
 * se silencia con el botón. Se revisa cuatro veces por segundo.
 */
export function MusicaDeFondo() {
  useEffect(() => {
    const revisar = (): void => {
      const callar = estadoDelSonido() !== 'activo' || faseCancion() === 'sonando' || cancionAudible() || faseCarta() !== 'cerrada'
      ajustarMusicaDeFondo(!callar)
    }
    const intervalo = window.setInterval(revisar, 250)
    // Mientras se ve el diálogo del sonido ya se va cargando (un momento después de abrir la página,
    // para no quitarle ancho de banda a lo primero que hace falta).
    const precarga = window.setTimeout(precargarMusicaDeFondo, 800)
    // Si el teléfono pausó el audio (una llamada, la pantalla bloqueada), el siguiente gesto lo reanuda.
    const tipos = ['pointerup', 'keydown'] as const
    for (const tipo of tipos) window.addEventListener(tipo, reanudarAudio, { passive: true })
    if (process.env.NODE_ENV === 'development') (window as unknown as { __fondo?: unknown }).__fondo = estadoMusicaDeFondo
    return () => {
      window.clearInterval(intervalo)
      window.clearTimeout(precarga)
      for (const tipo of tipos) window.removeEventListener(tipo, reanudarAudio)
    }
  }, [])
  return null
}
