'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { resolucionDePantalla } from '@/features/dibujo/store/ritmoDibujo'

/**
 * La resolución del dibujo según el escalón de calidad (ver `features/dibujo/store/ritmoDibujo.ts`):
 * si el aparato no llega a 60 fotogramas por segundo, se dibuja con menos píxeles (`maxima` es la
 * del aparato, ver `AgujeroNegroCanvas`).
 */
export function ResolucionAdaptable({ maxima }: { maxima: number }) {
  const setDpr = useThree((estado) => estado.setDpr)
  const aplicada = useRef(1)
  useFrame(() => {
    const resolucion = resolucionDePantalla()
    if (resolucion === aplicada.current) return
    aplicada.current = resolucion
    setDpr(Math.min(window.devicePixelRatio || 1, maxima) * resolucion)
  })
  return null
}
