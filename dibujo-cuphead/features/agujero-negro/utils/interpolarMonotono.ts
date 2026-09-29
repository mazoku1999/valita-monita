/**
 * Interpolación cúbica monótona (Fritsch-Carlson): pasa por los puntos sin pasarse de ninguno ni
 * detenerse en los intermedios. La pendiente del primer punto es nula (se sale del reposo); la del
 * último, nula salvo con `seguirAlFinal`, que la toma del último tramo (se llega sin frenar).
 */
export const interpolarMonotono = (x: number, xs: readonly number[], ys: readonly number[], seguirAlFinal = false): number => {
  const n = xs.length
  if (x <= xs[0]) return ys[0]
  if (x >= xs[n - 1]) return ys[n - 1]
  const pendientes = xs.map((_, i) => {
    if (i === 0) return 0
    if (i === n - 1) return seguirAlFinal ? (ys[i] - ys[i - 1]) / (xs[i] - xs[i - 1]) : 0
    const antes = (ys[i] - ys[i - 1]) / (xs[i] - xs[i - 1])
    const despues = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i])
    if (antes * despues <= 0) return 0
    return (2 * antes * despues) / (antes + despues)
  })
  let i = 0
  while (x > xs[i + 1]) i += 1
  const h = xs[i + 1] - xs[i]
  const t = (x - xs[i]) / h
  const t2 = t * t
  const t3 = t2 * t
  return (
    (2 * t3 - 3 * t2 + 1) * ys[i] +
    (t3 - 2 * t2 + t) * h * pendientes[i] +
    (-2 * t3 + 3 * t2) * ys[i + 1] +
    (t3 - t2) * h * pendientes[i + 1]
  )
}
