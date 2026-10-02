'use client'

import { useEffect } from 'react'
import { establecerProgreso, largoDelCarril, obtenerProgreso, progresoGuiado } from '../store/progresoScrollStore'

/**
 * Progreso de scroll de la narrativa (0..1). El viaje empieza siempre arriba: se desactiva la
 * restauración de posición del navegador (al recargar volvía al punto anterior y la cámara
 * "viajaba sola" hasta allí) y la página se pone en 0 al montar. Si cambia el alto de la ventana
 * (pantalla completa, girar el teléfono), el carril cambia de largo: la página se lleva al mismo
 * punto del viaje, en vez de dejar que la cámara salte.
 */
export function useSincronizarScroll(): void {
  useEffect(() => {
    let solicitud = 0
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
    window.scrollTo(0, 0)
    let largoAnterior = largoDelCarril()

    const medir = (): void => {
      solicitud = 0
      const largo = largoDelCarril()
      if (Math.abs(largo - largoAnterior) > 1) {
        largoAnterior = largo
        window.scrollTo(0, obtenerProgreso() * largo)
        return
      }
      if (!progresoGuiado()) establecerProgreso(window.scrollY / largo)
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
