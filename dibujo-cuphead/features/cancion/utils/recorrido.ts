/**
 * Interpolación monótona (Fritsch–Carlson) de una lista de puntos [x, y] con x creciente: pasa por
 * todos, nunca se pasa de largo entre ellos (si y sube, sube) y la velocidad no salta en los puntos.
 * Fuera del tramo, el extremo.
 */
export function interpolarMonotona(puntos: readonly (readonly [number, number])[], x: number): number {
  const n = puntos.length
  if (n === 0) return 0
  if (x <= puntos[0][0]) return puntos[0][1]
  if (x >= puntos[n - 1][0]) return puntos[n - 1][1]
  const pendientes: number[] = []
  for (let i = 0; i < n - 1; i++) pendientes.push((puntos[i + 1][1] - puntos[i][1]) / (puntos[i + 1][0] - puntos[i][0]))
  // Tangentes de PCHIP: media armónica ponderada de las pendientes vecinas (0 si cambian de signo).
  const tangentes: number[] = [pendientes[0]]
  for (let i = 1; i < n - 1; i++) {
    const a = pendientes[i - 1]
    const b = pendientes[i]
    const h0 = puntos[i][0] - puntos[i - 1][0]
    const h1 = puntos[i + 1][0] - puntos[i][0]
    const w1 = 2 * h1 + h0
    const w2 = h1 + 2 * h0
    tangentes.push(a * b <= 0 ? 0 : (w1 + w2) / (w1 / a + w2 / b))
  }
  tangentes.push(pendientes[n - 2])
  let i = 0
  while (x > puntos[i + 1][0]) i++
  const [x0, y0] = puntos[i]
  const [x1, y1] = puntos[i + 1]
  const h = x1 - x0
  const t = (x - x0) / h
  const t2 = t * t
  const t3 = t2 * t
  return (
    (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * tangentes[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * tangentes[i + 1]
  )
}
