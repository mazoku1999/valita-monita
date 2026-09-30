'use client'

import { useFrame } from '@react-three/fiber'
import { avanzarProgresoSuave } from '../store/progresoScrollStore'

/**
 * Avanza el progreso con inercia (ver `obtenerProgresoSuave`) una vez por fotograma. Va el primero
 * dentro del lienzo: los que lo leen después en el mismo fotograma ven el valor ya actualizado.
 */
export function ProgresoSuave() {
  useFrame((_, delta) => avanzarProgresoSuave(Math.min(delta, 0.1)))
  return null
}
