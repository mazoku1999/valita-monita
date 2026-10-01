/**
 * Por dónde va la canción del agujero negro (ver `constantes/cancion.ts`):
 *
 * - `armada`: espera a que se llegue al agujero bajando.
 * - `esperando`: en la puerta, el scroll quieto; si el navegador no la deja sonar sin un gesto, se
 *   pide un toque (`pideToque`).
 * - `sonando`: la cámara cruza sola al compás de la canción, con la letra; sin scroll.
 * - `libre`: se soltó el scroll (al final del cruce o porque se saltó); puede seguir sonando el final.
 *   Volver por encima del agujero la arma otra vez.
 */
export type FaseCancion = 'armada' | 'esperando' | 'sonando' | 'libre'

const estado = {
  fase: 'armada' as FaseCancion,
  pideToque: false,
}

const oyentes = new Set<() => void>()
const avisar = (): void => {
  for (const oyente of oyentes) oyente()
}

export function suscribirCancion(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}

export const faseCancion = (): FaseCancion => estado.fase
export const cancionPideToque = (): boolean => estado.pideToque

export function cambiarFaseCancion(fase: FaseCancion): void {
  if (estado.fase === fase && !estado.pideToque) return
  estado.fase = fase
  estado.pideToque = false
  avisar()
}

export function pedirToque(): void {
  if (estado.fase !== 'esperando' || estado.pideToque) return
  estado.pideToque = true
  avisar()
}
