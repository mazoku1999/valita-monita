/**
 * Pantalla completa, con un botón (en el viaje, arriba a la derecha; en el paseo del final, entre
 * sus botones). Donde el navegador lo deja (ordenadores, Android, iPad), la página entera se pone a
 * pantalla completa. En el iPhone, Safari sólo lo deja para los videos: allí la manera es agregar la
 * página a la pantalla de inicio, que la abre como una app, sin las barras de Safari (ver
 * `app/manifest.ts`); el botón explica cómo. Abierta así, el botón no hace falta.
 */

type DocumentoWebkit = Document & {
  webkitFullscreenEnabled?: boolean
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => void
}
type ElementoWebkit = HTMLElement & { webkitRequestFullscreen?: () => void }

/** Con el navegador, agregándola a inicio (iPhone), ya abierta como app, o de ninguna manera. */
export type ModoPantallaCompleta = 'navegador' | 'inicio' | 'app' | 'no'

export function modoPantallaCompleta(): ModoPantallaCompleta {
  const documento = document as DocumentoWebkit
  if (documento.fullscreenEnabled || documento.webkitFullscreenEnabled) return 'navegador'
  const comoApp =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (comoApp) return 'app'
  return /iPhone|iPod/.test(navigator.userAgent) ? 'inicio' : 'no'
}

export function enPantallaCompleta(): boolean {
  const documento = document as DocumentoWebkit
  return Boolean(documento.fullscreenElement ?? documento.webkitFullscreenElement)
}

export function suscribirPantallaCompleta(oyente: () => void): () => void {
  document.addEventListener('fullscreenchange', oyente)
  document.addEventListener('webkitfullscreenchange', oyente)
  return () => {
    document.removeEventListener('fullscreenchange', oyente)
    document.removeEventListener('webkitfullscreenchange', oyente)
  }
}

function alternarPantallaCompleta(): void {
  const documento = document as DocumentoWebkit
  const raiz = document.documentElement as ElementoWebkit
  try {
    const hecho = enPantallaCompleta()
      ? (documento.exitFullscreen ?? documento.webkitExitFullscreen)?.call(documento)
      : raiz.requestFullscreen
        ? raiz.requestFullscreen({ navigationUI: 'hide' })
        : raiz.webkitRequestFullscreen?.()
    void Promise.resolve(hecho).catch(() => undefined)
  } catch {
    // El navegador no la dejó (por ejemplo, sin un gesto del usuario): no pasa nada.
  }
}

let avisoAbierto = false
const oyentesAviso = new Set<() => void>()

const cambiarAviso = (abierto: boolean): void => {
  if (abierto === avisoAbierto) return
  avisoAbierto = abierto
  for (const oyente of oyentesAviso) oyente()
}

/** Si se está mostrando cómo agregar la página a inicio (en el iPhone). */
export const avisoDeInicioAbierto = (): boolean => avisoAbierto

export function cerrarAvisoDeInicio(): void {
  cambiarAviso(false)
}

export function suscribirAvisoDeInicio(oyente: () => void): () => void {
  oyentesAviso.add(oyente)
  return () => {
    oyentesAviso.delete(oyente)
  }
}

/** (En un gesto: el botón.) A pantalla completa y de vuelta o, en el iPhone, cómo agregarla a inicio. */
export function pulsarPantallaCompleta(): void {
  if (modoPantallaCompleta() === 'inicio') cambiarAviso(!avisoAbierto)
  else alternarPantallaCompleta()
}

/** El modo no cambia mientras la página está abierta: no hay nada a lo que suscribirse. */
export const suscribirModo = (): (() => void) => () => undefined
