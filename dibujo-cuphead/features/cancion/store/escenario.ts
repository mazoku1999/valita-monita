import type * as THREE from 'three'
import type { LineaEscenario } from '../escenario/letrero'

/**
 * El escenario de la canción (ver `escenario/Escenario.ts`) en el dibujo animado: lo pinta
 * `EscenarioCancion` y lo compone `PasoDibujo` encima del dibujo, antes de la película.
 */
export const ESCENARIO: {
  /** El lienzo del escenario como textura (sRGB tal cual, con su transparencia). */
  textura: THREE.Texture | null
  /** Si hay algo que componer (0 o 1). */
  opacidad: number
  /** Si tapa la pantalla entera (el resto del dibujo no hace falta calcularlo). */
  cubre: boolean
} = { textura: null, opacidad: 0, cubre: false }

/** La letra con la hora de cada palabra, en cuanto se lee (ver `CancionDelAgujero`). */
let letra: readonly LineaEscenario[] | null = null

export const letraDelEscenario = (): readonly LineaEscenario[] | null => letra

export function ponerLetraDelEscenario(lineas: readonly LineaEscenario[] | null): void {
  letra = lineas
}

/**
 * El final de la canción (el mensaje para Valeria, ver `escenario/final.ts`): cuándo empezó (s del
 * reloj de la página; −1 si no) y en qué punto del carril (vh), para cerrarlo al seguir deslizando.
 * Empieza al acabar la canción o al saltarla, y se olvida al volver a armarla.
 */
export const FINAL = { inicio: -1, vh: 0 }

export function empezarFinal(vh: number): void {
  if (FINAL.inicio >= 0) return
  FINAL.inicio = performance.now() / 1000
  FINAL.vh = vh
}

export function olvidarFinal(): void {
  FINAL.inicio = -1
}
