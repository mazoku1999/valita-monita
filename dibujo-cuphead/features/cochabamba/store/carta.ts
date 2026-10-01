/**
 * La cajita y la carta del final (lo pidió el usuario: al abrir una cajita la cámara mira al cielo,
 * que se vuelve "La noche estrellada", y ya no hay mandos: sólo la carta; y un botón para salir).
 *
 * - `cerrada`: la cajita espera sobre su tocón; se abre tocándola (o con el botón del regalo).
 * - `abriendo`: la cámara se acerca si hace falta, la tapa salta, la cámara se alza hacia el cielo y
 *   cae la noche (ver `COREOGRAFIA` en `constantes/carta.ts`; lo lleva `EscenaCochabamba`).
 * - `leyendo`: llega el sobre, se abre y sale la carta (`components/CartaEstrellada.tsx`).
 * - `saliendo`: (botón de salir o Escape) la noche se levanta, la cámara vuelve a mirar la cajita,
 *   la tapa vuelve a su sitio y se devuelven los mandos (y entonces, otra vez `cerrada`).
 */
export type FaseCarta = 'cerrada' | 'abriendo' | 'leyendo' | 'saliendo'

export const CARTA = {
  fase: 'cerrada' as FaseCarta,
  /** Cuándo (s, reloj de la página) se abrió y cuándo se empezó a salir. */
  inicio: 0,
  salida: 0,
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

/** Abre la cajita (si está cerrada). */
export function abrirCajita(): void {
  if (CARTA.fase !== 'cerrada') return
  CARTA.fase = 'abriendo'
  CARTA.inicio = relojCarta()
  CARTA.llegada = -1
  CARTA.toque = null
  avisar()
}

/** Segundos desde que se abrió (−1 si está cerrada). */
export const segundosCarta = (): number => (CARTA.fase === 'cerrada' ? -1 : relojCarta() - CARTA.inicio)

/** Segundos desde que la cámara llegó junto a la cajita (muy negativo antes). */
export const desdeLlegada = (): number => (CARTA.llegada < 0 ? -1e3 : segundosCarta() - CARTA.llegada)

/** La noche ya cayó: llega la carta. */
export function empezarLectura(): void {
  if (CARTA.fase !== 'abriendo') return
  CARTA.fase = 'leyendo'
  avisar()
}

/** Salir de la carta y de la noche: de vuelta al corazón de flores. */
export function salirDeLaCarta(): void {
  if (CARTA.fase !== 'abriendo' && CARTA.fase !== 'leyendo') return
  CARTA.fase = 'saliendo'
  CARTA.salida = relojCarta()
  avisar()
}

/** Segundos desde que se empezó a salir (−1 si no se está saliendo). */
export const segundosSalida = (): number => (CARTA.fase === 'saliendo' ? relojCarta() - CARTA.salida : -1)

/** Ya se salió: la cajita, cerrada otra vez (se puede volver a abrir). */
export function terminarSalida(): void {
  if (CARTA.fase !== 'saliendo') return
  CARTA.fase = 'cerrada'
  CARTA.llegada = -1
  avisar()
}

// En desarrollo: abrir, salir y adelantar el reloj desde la consola o las capturas.
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  ;(window as unknown as { __carta?: unknown }).__carta = {
    abrir: abrirCajita,
    salir: salirDeLaCarta,
    saltar: (segundos: number) => {
      CARTA.inicio -= segundos
    },
    fase: () => CARTA.fase,
  }
}
