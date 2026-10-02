'use client'

import { useEffect } from 'react'
import { CARRIL_VH } from '@/features/agujero-negro/constantes/viajeScroll'
import { faseCancion } from '@/features/cancion/store/cancion'
import { cancionAudible, contextoDeAudio, estadoDelSonido, reanudarAudio } from '@/features/cancion/utils/audio'
import { faseCarta } from '@/features/cochabamba/store/carta'
import { obtenerProgresoSuave } from '@/features/narrativa/store/progresoScrollStore'
import { type Capas, PaisajeSonoro, SIN_CAPAS, renderizarAmbiente } from './paisajeSonoro'

const suave = (desde: number, hasta: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - desde) / (hasta - desde)))
  return t * t * (3 - 2 * t)
}

/**
 * Qué suena en cada punto del viaje (vh): en el espacio (el agujero negro, el túnel, el sistema
 * solar y la Tierra), el colchón y las estrellas; bajando entre las nubes, el viento; en el valle,
 * la brisa, los pájaros y las campanitas.
 */
export function capasDelViaje(vh: number): Capas {
  const nubes = suave(1300, 1480, vh)
  const valle = suave(1480, 1600, vh)
  return {
    colchon: 1 - 0.75 * nubes - 0.25 * valle,
    estrellas: 1 - nubes,
    viento: nubes * (1 - 0.55 * valle),
    pajaros: valle,
    campanitas: valle,
  }
}

/** Escenas para escuchar aparte en desarrollo (ver `window.__ambiente`). */
const ESCENAS: Record<string, Capas> = {
  espacio: capasDelViaje(0),
  nubes: capasDelViaje(1470),
  valle: capasDelViaje(1700),
}

/**
 * El sonido ambiente (ver `paisajeSonoro.ts`) donde no hay música: empieza en cuanto se activa el
 * sonido (el diálogo del inicio) y se calla mientras suena la canción o la música de la carta, y si
 * se silencia con el botón. Se fija cuatro veces por segundo, con fundidos lentos.
 */
export function AmbienteSonoro() {
  useEffect(() => {
    let paisaje: PaisajeSonoro | null = null
    const tic = (): void => {
      const ctx = contextoDeAudio()
      if (!ctx || ctx.state !== 'running') return
      if (!paisaje) paisaje = new PaisajeSonoro(ctx, ctx.destination)
      const callar = estadoDelSonido() !== 'activo' || faseCancion() === 'sonando' || cancionAudible() || faseCarta() !== 'cerrada'
      paisaje.fijar(callar ? SIN_CAPAS : capasDelViaje(obtenerProgresoSuave() * CARRIL_VH), callar ? 0.5 : 1.6)
      paisaje.programar(ctx.currentTime + 0.6)
    }
    const intervalo = window.setInterval(tic, 250)
    // Si el teléfono pausó el audio (una llamada, la pantalla bloqueada), el siguiente gesto lo reanuda.
    const tipos = ['pointerup', 'keydown'] as const
    for (const tipo of tipos) window.addEventListener(tipo, reanudarAudio, { passive: true })
    if (process.env.NODE_ENV === 'development') {
      ;(window as unknown as { __ambiente?: unknown }).__ambiente = {
        /** `segundos` de una escena ('espacio', 'nubes' o 'valle') en un WAV, para escucharlo aparte. */
        renderizar: (escena: string, segundos: number) => renderizarAmbiente(ESCENAS[escena] ?? ESCENAS.espacio, segundos),
        /** Las capas a las que va ahora (null si aún no empezó). */
        capas: () => paisaje?.capasActuales() ?? null,
      }
    }
    return () => {
      window.clearInterval(intervalo)
      for (const tipo of tipos) window.removeEventListener(tipo, reanudarAudio)
      paisaje?.detener()
    }
  }, [])
  return null
}
