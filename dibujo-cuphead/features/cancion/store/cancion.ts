/**
 * Por dónde va la canción del agujero negro (ver `constantes/cancion.ts`):
 *
 * - `armada`: espera a que se entre en el agujero bajando.
 * - `sonando`: la cámara cruza sola al compás de la canción, con la letra; sin scroll (con sonido o
 *   sin él, según se haya activado: ver `utils/audio.ts`).
 * - `libre`: se soltó el scroll (al final del cruce o porque se saltó); puede seguir sonando el final.
 *   Volver fuera del agujero la arma otra vez.
 */
export type FaseCancion = 'armada' | 'sonando' | 'libre'

let fase: FaseCancion = 'armada'

const oyentes = new Set<() => void>()

export function suscribirCancion(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}

export const faseCancion = (): FaseCancion => fase

export function cambiarFaseCancion(siguiente: FaseCancion): void {
  if (fase === siguiente) return
  fase = siguiente
  for (const oyente of oyentes) oyente()
}
