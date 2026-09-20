/** Generador determinista (mulberry32) para que el campo de polvo sea el mismo en cada carga. */
export const crearAleatorio = (semilla: number): (() => number) => {
  let estado = semilla >>> 0
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0
    let t = estado
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Normal estándar por Box-Muller sobre el generador dado. */
export const crearGaussiano = (aleatorio: () => number): (() => number) => () => {
  const u = Math.max(aleatorio(), 1e-9)
  const v = aleatorio()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** smoothstep de GLSL: 0 por debajo de `borde0`, 1 por encima de `borde1`, Hermite entre ambos. */
export const suavizar = (borde0: number, borde1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - borde0) / (borde1 - borde0)))
  return t * t * (3 - 2 * t)
}
