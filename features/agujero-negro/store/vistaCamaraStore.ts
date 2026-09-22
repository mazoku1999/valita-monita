import { useSyncExternalStore } from 'react'
import { esIdVista, VISTA_INICIAL, type IdVista } from '../constantes/vistasCamara'

/**
 * Claves de calibración que se pueden fijar desde la URL SÓLO en desarrollo, por ejemplo
 * `?vista=inferior&polar=1.75&ganancia=6&bloomUmbral=0.7`. Sirven para afinar una vista con
 * capturas sin editar código; en producción se ignoran y mandan las constantes de cada vista.
 */
export type ClaveAjuste =
  | 'polar'
  | 'distancia'
  | 'fov'
  | 'inclinacion'
  | 'encuadreX'
  | 'encuadreY'
  | 'ganancia'
  | 'bloomUmbral'
  | 'bloomIntensidad'
  | 'bloomRadio'
  | 'bloomNiveles'
  | 'resplandorBase'
  | 'resplandorPolvo'
  | 'resplandorPolvoRadio'
  | 'resplandorPolvoNiveles'
  | 'niebla'
  | 'nieblaLuz'
  | 'anillo'
  | 'polvoExposicion'
  | 'polvoExponente'
  | 'gusanoMuestras'

export type AjustesCalibracion = Partial<Record<ClaveAjuste, number>>

const CLAVES_AJUSTE: readonly ClaveAjuste[] = [
  'polar',
  'distancia',
  'fov',
  'inclinacion',
  'encuadreX',
  'encuadreY',
  'ganancia',
  'bloomUmbral',
  'bloomIntensidad',
  'bloomRadio',
  'bloomNiveles',
  'resplandorBase',
  'resplandorPolvo',
  'resplandorPolvoRadio',
  'resplandorPolvoNiveles',
  'niebla',
  'nieblaLuz',
  'anillo',
  'polvoExposicion',
  'polvoExponente',
  'gusanoMuestras',
]

type Escucha = () => void

let vistaActual: IdVista = VISTA_INICIAL
/** Sube cada vez que se elige un encuadre: la cámara lo lee para volver a él desde el modo libre. */
let versionVista = 0
/** El usuario ha orbitado o hecho zoom desde el último encuadre elegido. */
let modoLibre = false
/** Zoom pedido desde la interfaz (pasos acumulados hasta que la cámara los consume). */
let zoomPendiente = 0
let ajustesActuales: AjustesCalibracion = {}
const escuchas = new Set<Escucha>()

const notificar = (): void => escuchas.forEach((escucha) => escucha())

/** Elige un encuadre. Volver a elegir el activo también vale: devuelve la cámara a él. */
export function establecerVista(id: IdVista): void {
  vistaActual = id
  versionVista += 1
  modoLibre = false
  notificar()
}

export function obtenerVista(): IdVista {
  return vistaActual
}

export function obtenerVersionVista(): number {
  return versionVista
}

export function marcarModoLibre(): void {
  if (modoLibre) return
  modoLibre = true
  notificar()
}

export function esModoLibre(): boolean {
  return modoLibre
}

/** Pasos de zoom desde la interfaz: positivo acerca, negativo aleja. */
export function solicitarZoom(pasos: number): void {
  zoomPendiente += pasos
}

export function consumirZoomPendiente(): number {
  const pasos = zoomPendiente
  zoomPendiente = 0
  return pasos
}

/** Valor calibrado desde la URL si existe (sólo desarrollo); si no, el valor por defecto. */
export function ajuste(clave: ClaveAjuste, valorPorDefecto: number): number {
  return ajustesActuales[clave] ?? valorPorDefecto
}

export function suscribirVista(escucha: Escucha): () => void {
  escuchas.add(escucha)
  return () => {
    escuchas.delete(escucha)
  }
}

const obtenerVistaServidor = (): IdVista => VISTA_INICIAL
const obtenerLibreServidor = (): boolean => false

export function useVistaCamara(): IdVista {
  return useSyncExternalStore(suscribirVista, obtenerVista, obtenerVistaServidor)
}

export function useModoLibre(): boolean {
  return useSyncExternalStore(suscribirVista, esModoLibre, obtenerLibreServidor)
}

/**
 * Aplica la vista pedida en la URL (`?vista=inferior`) y, sólo en desarrollo, los ajustes de
 * calibración. Se llama una vez tras montar, nunca durante el render, para no romper la hidratación.
 */
export function aplicarVistaDesdeUrl(busqueda: string): void {
  const parametros = new URLSearchParams(busqueda)
  const vista = parametros.get('vista')
  if (esIdVista(vista)) establecerVista(vista)

  if (process.env.NODE_ENV !== 'development') return

  const ajustes: AjustesCalibracion = {}
  for (const clave of CLAVES_AJUSTE) {
    const valor = parametros.get(clave)
    if (valor === null) continue
    const numero = Number(valor)
    if (Number.isFinite(numero)) ajustes[clave] = numero
  }
  ajustesActuales = ajustes
  notificar()
}
