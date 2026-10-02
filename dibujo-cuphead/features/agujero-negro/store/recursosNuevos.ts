/**
 * Aviso de mallas o texturas nuevas en la escena (las que llegan del hilo aparte, ver
 * `features/segundo-plano`): `PrecalentarSombreadores` las sube a la GPU en cuanto llegan, y no la
 * primera vez que aparecen (en un móvil, eso trababa el viaje justo ahí).
 */
const oyentes = new Set<() => void>()

export function avisarRecursoNuevo(): void {
  for (const oyente of oyentes) oyente()
}

export function escucharRecursosNuevos(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}
