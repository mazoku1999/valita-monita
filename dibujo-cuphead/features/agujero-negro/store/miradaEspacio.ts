/**
 * La mirada del usuario una vez dentro del agujero, en el sistema solar y en el valle: lo que suma
 * arrastrando (órbita alrededor de lo que se mira; en el valle, girar la cabeza), pellizcando o con
 * Ctrl + rueda (zoom) y dónde está el cursor (un leve paralaje). Lo llena `CamaraNarrativa`, que
 * ahí deja de girar la cámara del agujero negro (si no, el marco del agujero de gusano la seguía
 * con retraso y el sistema solar se deslizaba por la pantalla y volvía solo); lo aplican
 * `EscenaSistemaSolar` y `EscenaCochabamba` (la que se vea) con `avanzarMirada`.
 */
export const MIRADA_ESPACIO = {
  /** Giro acumulado (rad), con la inercia del arrastre. */
  azimut: 0,
  /** Elevación sumada (rad): arrastrar hacia abajo sube la cámara, como al agarrar el mundo. */
  elevacion: 0,
  /** Zoom en escala logarítmica (positivo acerca). */
  zoom: 0,
  /** Cursor en coordenadas normalizadas de pantalla (−1..1, y hacia arriba) y si está dentro. */
  cursorX: 0,
  cursorY: 0,
  cursorActivo: false,
  /** Se está arrastrando ahora mismo (la mirada no vuelve al camino mientras tanto). */
  arrastrando: false,
  /** Doble clic (o doble toque): la mirada vuelve al camino con un travelling suave. */
  volver: false,
}

/** Cuánto se recupera el camino por unidad de progreso de scroll, tras un doble clic (1/s) y el ritmo del cursor. */
const VUELTA = { porProgreso: 55, dobleClic: 3.5, cursor: 1.8 } as const

let progresoPrevio: number | null = null
const cursorSuave = { x: 0, y: 0 }

/**
 * Un fotograma de la mirada: vuelve al camino a medida que se sigue con el scroll (y del todo tras
 * un doble clic) salvo mientras se arrastra, y sigue al cursor con retraso. Devuelve el cursor
 * suavizado. Lo llama una vez por fotograma la escena que se está viendo.
 */
export function avanzarMirada(progreso: number, paso: number): { readonly x: number; readonly y: number } {
  const mirada = MIRADA_ESPACIO
  const avance = progresoPrevio === null ? 0 : Math.abs(progreso - progresoPrevio)
  progresoPrevio = progreso
  if (mirada.arrastrando) {
    mirada.volver = false
  } else {
    const k = Math.exp(-avance * VUELTA.porProgreso - (mirada.volver ? paso * VUELTA.dobleClic : 0))
    mirada.azimut *= k
    mirada.elevacion *= k
    mirada.zoom *= k
    if (mirada.volver && Math.abs(mirada.azimut) + Math.abs(mirada.elevacion) + Math.abs(mirada.zoom) < 1e-3) {
      mirada.azimut = 0
      mirada.elevacion = 0
      mirada.zoom = 0
      mirada.volver = false
    }
  }
  const kCursor = 1 - Math.exp(-paso * VUELTA.cursor)
  cursorSuave.x += ((mirada.cursorActivo ? mirada.cursorX : 0) - cursorSuave.x) * kCursor
  cursorSuave.y += ((mirada.cursorActivo ? mirada.cursorY : 0) - cursorSuave.y) * kCursor
  return cursorSuave
}

/** Deja la mirada en el camino (al volver a la parte del agujero negro o del túnel). */
export function reiniciarMirada(): void {
  MIRADA_ESPACIO.azimut = 0
  MIRADA_ESPACIO.elevacion = 0
  MIRADA_ESPACIO.zoom = 0
  MIRADA_ESPACIO.volver = false
}
