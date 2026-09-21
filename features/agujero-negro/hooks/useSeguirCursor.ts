'use client'

import { useEffect, useRef, type RefObject } from 'react'

/** Posición del ratón en coordenadas normalizadas de pantalla (−1..1, y hacia arriba). */
export interface PosicionCursor {
  x: number
  y: number
  /** Falso hasta que el ratón entra en la ventana y cuando la abandona (o en pantallas táctiles). */
  activo: boolean
}

/**
 * Sigue al ratón por toda la ventana, sin necesidad de pulsar: el disco inclina su línea hacia
 * donde está el cursor (ver `components/CamaraNarrativa.tsx`). Los punteros táctiles y de lápiz
 * no cuentan (en ellos no hay "hover" y el arrastre ya orbita la cámara).
 */
export function useSeguirCursor(): RefObject<PosicionCursor> {
  const cursor = useRef<PosicionCursor>({ x: 0, y: 0, activo: false })

  useEffect(() => {
    const mover = (evento: PointerEvent): void => {
      if (evento.pointerType !== 'mouse') return
      const estado = cursor.current
      estado.x = (evento.clientX / window.innerWidth) * 2 - 1
      estado.y = 1 - (evento.clientY / window.innerHeight) * 2
      estado.activo = true
    }
    const salir = (): void => {
      cursor.current.activo = false
    }
    window.addEventListener('pointermove', mover, { passive: true })
    document.documentElement.addEventListener('mouseleave', salir)
    window.addEventListener('blur', salir)
    return () => {
      window.removeEventListener('pointermove', mover)
      document.documentElement.removeEventListener('mouseleave', salir)
      window.removeEventListener('blur', salir)
    }
  }, [])

  return cursor
}
