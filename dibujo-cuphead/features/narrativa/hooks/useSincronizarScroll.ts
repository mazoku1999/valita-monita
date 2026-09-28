'use client'

import { useEffect } from 'react'
import { establecerProgreso } from '../store/progresoScrollStore'

/**
 * Progreso de scroll de la narrativa (0..1). El viaje empieza siempre arriba: se desactiva la
 * restauración de posición del navegador (al recargar volvía al punto anterior y la cámara
 * "viajaba sola" hasta allí) y la página se pone en 0 al montar.
 */
export function useSincronizarScroll(): void {
  useEffect(() => {
    let solicitud = 0
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
    window.scrollTo(0, 0)

    const medir = (): void => {
      solicitud = 0
      const alturaScroll = document.documentElement.scrollHeight - window.innerHeight
      establecerProgreso(alturaScroll > 0 ? window.scrollY / alturaScroll : 0)
    }

    const programar = (): void => {
      if (solicitud !== 0) return
      solicitud = window.requestAnimationFrame(medir)
    }

    medir()
    window.addEventListener('scroll', programar, { passive: true })
    window.addEventListener('resize', programar)

    return () => {
      if (solicitud !== 0) window.cancelAnimationFrame(solicitud)
      window.removeEventListener('scroll', programar)
      window.removeEventListener('resize', programar)
    }
  }, [])
}
