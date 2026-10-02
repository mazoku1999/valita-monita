import { useSyncExternalStore } from 'react'
import { CARRIL_VH } from '@/features/agujero-negro/constantes/viajeScroll'

type Escucha = () => void

let progresoActual = 0
const escuchas = new Set<Escucha>()

const limitar = (valor: number): number => Math.min(1, Math.max(0, valor))

export function establecerProgreso(valor: number): void {
  const siguiente = limitar(Number.isFinite(valor) ? valor : 0)
  if (siguiente === progresoActual) return
  progresoActual = siguiente
  escuchas.forEach((escucha) => escucha())
}

export function obtenerProgreso(): number {
  return progresoActual
}

let guiado = false

/**
 * Mientras la canción lleva la cámara (ver `features/cancion`), el progreso lo pone ella y no el
 * scroll de la página: en el iPhone, con la página quieta, Safari no siempre la deja desplazarse
 * por código, y la cámara se quedaba atrás.
 */
export function guiarProgreso(activo: boolean): void {
  guiado = activo
}

export function progresoGuiado(): boolean {
  return guiado
}

/**
 * Lo que se puede desplazar la página (px) para recorrer el carril, medido con la altura grande de
 * la ventana (la del propio carril, en `vh`, que no cambia): en un móvil, al esconderse o aparecer
 * la barra del navegador cambia `innerHeight` y, con ella, el progreso daba un saltito (la cámara
 * saltaba).
 */
export function largoDelCarril(): number {
  const total = document.documentElement.scrollHeight
  return Math.max(1, total * (1 - 100 / CARRIL_VH))
}

/**
 * Progreso con inercia para las escenas del espacio y del valle: sigue al del scroll como un muelle
 * con amortiguamiento crítico (sin pasarse), de modo que cada golpe de rueda se convierte en un
 * deslizamiento suave de la cámara y no en un salto. La cámara del agujero negro suaviza por su
 * cuenta y sigue leyendo el progreso directo. Lo avanza `avanzarProgresoSuave` una vez por
 * fotograma (ver `components/ProgresoSuave.tsx`).
 */
const MUELLE = {
  /** Pulsación del muelle (1/s): llega a su sitio en algo menos de un segundo. */
  omega: 5.5,
  /** Con un salto mayor que éste (Inicio/Fin, la barra de desplazamiento) va directo. */
  saltoMaximo: 0.2,
} as const

let progresoSuave = 0
let velocidadSuave = 0
let suaveIniciado = false

export function obtenerProgresoSuave(): number {
  return progresoSuave
}

export function avanzarProgresoSuave(paso: number): void {
  const objetivo = progresoActual
  if (!suaveIniciado || Math.abs(objetivo - progresoSuave) > MUELLE.saltoMaximo) {
    suaveIniciado = true
    progresoSuave = objetivo
    velocidadSuave = 0
    return
  }
  // Solución exacta del muelle críticamente amortiguado: estable con cualquier paso.
  const w = MUELLE.omega
  const desvio = progresoSuave - objetivo
  const empuje = (velocidadSuave + w * desvio) * paso
  const caida = Math.exp(-w * paso)
  velocidadSuave = (velocidadSuave - w * empuje) * caida
  progresoSuave = objetivo + (desvio + empuje) * caida
  if (Math.abs(progresoSuave - objetivo) < 1e-6 && Math.abs(velocidadSuave) < 1e-6) {
    progresoSuave = objetivo
    velocidadSuave = 0
  }
}

export function suscribirProgreso(escucha: Escucha): () => void {
  escuchas.add(escucha)
  return () => {
    escuchas.delete(escucha)
  }
}

const obtenerProgresoServidor = (): number => 0

export function useProgresoScroll(): number {
  return useSyncExternalStore(suscribirProgreso, obtenerProgreso, obtenerProgresoServidor)
}
