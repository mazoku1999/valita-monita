import type * as THREE from 'three'
import type { LineaEscenario } from '../escenario/letrero'

/**
 * El escenario de la canción (ver `escenario/Escenario.ts`) en el dibujo animado: lo pinta
 * `EscenarioCancion` y lo compone `PasoDibujo` antes de la película (así le caen encima el grano,
 * el vaivén, la viñeta y el iris), con el iris de la película para entrar y salir de él.
 */
export const ESCENARIO: {
  /** El lienzo del escenario como textura (sRGB tal cual). */
  textura: THREE.Texture | null
  /** Cuánto se ve (0–1): todo o nada; el cambio lo tapa el iris cerrado. */
  opacidad: number
  /** Iris de la película para entrar y salir del escenario (1 abierto, 0 cerrado). */
  iris: number
  /** Si tapa la pantalla entera (el resto del dibujo no hace falta calcularlo). */
  cubre: boolean
} = { textura: null, opacidad: 0, iris: 1, cubre: false }

/** La letra con la hora de cada palabra, en cuanto se lee (ver `CancionDelAgujero`). */
let letra: readonly LineaEscenario[] | null = null

export const letraDelEscenario = (): readonly LineaEscenario[] | null => letra

export function ponerLetraDelEscenario(lineas: readonly LineaEscenario[] | null): void {
  letra = lineas
}
