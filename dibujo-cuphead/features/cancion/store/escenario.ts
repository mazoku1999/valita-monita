import type * as THREE from 'three'
import type { LineaEscenario } from '../escenario/letrero'

/**
 * El escenario de la canción (ver `escenario/Escenario.ts`) en el dibujo animado: lo pinta
 * `EscenarioCancion` y lo compone `PasoDibujo` entre el dibujo y la película (ver `VIAJE_FRAG`).
 */
export const ESCENARIO = {
  /** La letra y el final (nítidos, con su transparencia) y la escena pintada (sRGB tal cual). */
  encima: null as THREE.Texture | null,
  escena: null as THREE.Texture | null,
  /** Si hay algo que componer y si tapa la pantalla entera (el resto del dibujo no hace falta). */
  activo: false,
  cubre: false,
  /** El fondo del túnel en la pantalla (uv, y hacia arriba). */
  centro: { x: 0.5, y: 0.5 },
  /** Medio ancho y medio alto del recuadro de la escena, en altos de pantalla. */
  mitad: { x: 0.5, y: 0.5 },
  /** El acercamiento de la escena (1 en su sitio; más, pasando de largo; menos, llegando) y su opacidad. */
  zoom: 1,
  opacidadEscena: 0,
  /** Cuánto se ve el viaje a los costados (0–1) y cuál (ver `VIAJE_FRAG`; con decimales, al pasar de uno a otro). */
  viaje: 0,
  estilo: 0,
  /** Por cuánto se descubre lo de encima, en círculo (0–1; 1, entero). */
  revelado: 1,
}

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
