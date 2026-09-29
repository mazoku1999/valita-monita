/** smoothstep de GLSL: 0 por debajo de `borde0`, 1 por encima de `borde1`, Hermite entre ambos. */
export const suavizar = (borde0: number, borde1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - borde0) / (borde1 - borde0)))
  return t * t * (3 - 2 * t)
}
