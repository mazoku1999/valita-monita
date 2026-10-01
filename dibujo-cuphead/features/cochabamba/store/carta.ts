/**
 * La cajita y la carta del final (lo pidió el usuario: al abrir una cajita la cámara mira al cielo,
 * que se vuelve una noche estrellada de dibujo animado, y ya no hay mandos: sólo se ve la carta).
 *
 * - `cerrada`: la cajita espera sobre su tocón; se abre tocándola (o con el botón del regalo).
 * - `abriendo`: la cámara se acerca si hace falta, la tapa salta, la cámara se alza hacia el cielo y
 *   cae la noche (ver `COREOGRAFIA` en `constantes/carta.ts`; lo lleva `EscenaCochabamba`).
 * - `leyendo`: la carta, párrafo a párrafo (`components/CartaEstrellada.tsx`).
 */
export type FaseCarta = 'cerrada' | 'abriendo' | 'leyendo'

export const CARTA = {
  fase: 'cerrada' as FaseCarta,
  /** Cuándo (s, reloj de la página) se abrió. */
  inicio: 0,
  /** Cuándo (s desde que se abrió) llega la cámara junto a la cajita; lo fija la escena al empezar. */
  llegada: -1,
  /** Un toque o clic sin arrastre sobre el lienzo (coordenadas normalizadas), por comprobar si dio en la cajita. */
  toque: null as { x: number; y: number } | null,
}

export const relojCarta = (): number => performance.now() / 1000

const oyentes = new Set<() => void>()
const avisar = (): void => {
  for (const oyente of oyentes) oyente()
}

export function suscribirCarta(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}

export const faseCarta = (): FaseCarta => CARTA.fase

/** Abre la cajita (una sola vez). */
export function abrirCajita(): void {
  if (CARTA.fase !== 'cerrada') return
  CARTA.fase = 'abriendo'
  CARTA.inicio = relojCarta()
  CARTA.llegada = -1
  CARTA.toque = null
  avisar()
}

/** Segundos desde que se abrió (−1 si sigue cerrada). */
export const segundosCarta = (): number => (CARTA.fase === 'cerrada' ? -1 : relojCarta() - CARTA.inicio)

/** Segundos desde que la cámara llegó junto a la cajita (negativo antes). */
export const desdeLlegada = (): number => (CARTA.llegada < 0 ? -1e3 : segundosCarta() - CARTA.llegada)

/** La noche ya cayó: empieza la carta. */
export function empezarLectura(): void {
  if (CARTA.fase !== 'abriendo') return
  CARTA.fase = 'leyendo'
  avisar()
}

// En desarrollo: abrir y adelantar el reloj desde la consola o las capturas.
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  ;(window as unknown as { __carta?: unknown }).__carta = {
    abrir: abrirCajita,
    saltar: (segundos: number) => {
      CARTA.inicio -= segundos
    },
    fase: () => CARTA.fase,
  }
}
