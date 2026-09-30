import { CORAZON, direccionRumbo } from '../constantes/valle'

/**
 * El corazón de flores en el suelo del valle (el mismo que pinta `CORAZON_GLSL`): distancia con
 * signo (m, negativa dentro) al borde del corazón, con la punta hacia el sureste y los lóbulos hacia
 * el noroeste (ver `constantes/valle.ts`).
 */

const punto2 = (x: number, y: number): number => x * x + y * y

/** Corazón con signo (Íñigo Quílez): la punta en (0, 0), los lóbulos hacia +y. */
const sdCorazon = (px: number, py: number): number => {
  const x = Math.abs(px)
  if (py + x > 1) return Math.sqrt(punto2(x - 0.25, py - 0.75)) - Math.SQRT2 / 4
  const m = 0.5 * Math.max(x + py, 0)
  return Math.sqrt(Math.min(punto2(x, py - 1), punto2(x - m, py - m))) * Math.sign(x - py)
}

const [EJE_X, EJE_Z] = direccionRumbo(CORAZON.rumbo)

export const distanciaCorazon = (x: number, z: number): number => {
  const u = x * -EJE_Z + z * EJE_X
  const v = x * EJE_X + z * EJE_Z
  return sdCorazon(u / CORAZON.escala, v / CORAZON.escala + 0.6) * CORAZON.escala
}
