/**
 * Ritmo del dibujo animado: la imagen se redibuja a 24 dibujos por segundo y entre uno y otro se
 * queda quieta, como en los dibujos animados hechos a mano (y como la película que los proyectaba).
 * La cámara, el scroll y el resto del estado siguen avanzando cada fotograma de pantalla; sólo lo
 * que se VE cambia a este ritmo. De paso, los fotogramas que no toca dibujar no cuestan nada: ni el
 * trazado de rayos del agujero ni el dibujo se calculan.
 *
 * Un `useFrame` con prioridad negativa (el primero de cada fotograma) llama a `avanzarRitmo`; el
 * resto consulta `tocaDibujar()`.
 */
export const RITMO_DIBUJO = {
  dibujosPorSegundo: 24,
} as const

let dibujoActual = -1
let toca = true

export function avanzarRitmo(tiempo: number, dibujosPorSegundo: number = RITMO_DIBUJO.dibujosPorSegundo): void {
  const dibujo = Math.floor(tiempo * dibujosPorSegundo)
  toca = dibujo !== dibujoActual
  dibujoActual = dibujo
}

/** Si en este fotograma de pantalla toca un dibujo nuevo. */
export function tocaDibujar(): boolean {
  return toca
}

/** Número del dibujo actual (para el temblor de la tinta y el titileo de las estrellas). */
export function numeroDeDibujo(): number {
  return dibujoActual
}
