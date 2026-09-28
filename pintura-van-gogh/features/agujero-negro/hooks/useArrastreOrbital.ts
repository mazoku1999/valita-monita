'use client'

import { useCallback, useEffect, useRef } from 'react'
import { marcarModoLibre } from '../store/vistaCamaraStore'

/**
 * Desplazamientos que el usuario suma al encuadre activo. Persisten hasta que se elige otro
 * encuadre: orbitar a mano lleva a cualquier ángulo y la cámara se queda ahí.
 */
export interface DesplazamientoOrbital {
  azimut: number
  polar: number
  /** Zoom en escala logarítmica: la distancia del encuadre se multiplica por exp(zoom). */
  zoom: number
  velocidadAzimut: number
  velocidadPolar: number
  arrastrando: boolean
  /** Al elegir un encuadre, los desplazamientos vuelven a cero con un travelling suave. */
  volviendo: boolean
}

const SENSIBILIDAD = (Math.PI * 2) / 1400
const VELOCIDAD_MAXIMA = 3.5
/** Rueda con Ctrl (pellizco en trackpad) y pellizco táctil: zoom por píxel de desplazamiento. */
const ZOOM_POR_PIXEL = 0.0035
const ZOOM_POR_TECLA = 0.18

export function useArrastreOrbital(elemento: HTMLElement | null) {
  const estado = useRef<DesplazamientoOrbital>({
    azimut: 0,
    polar: 0,
    zoom: 0,
    velocidadAzimut: 0,
    velocidadPolar: 0,
    arrastrando: false,
    volviendo: false,
  })

  useEffect(() => {
    if (!elemento) return

    const punteros = new Map<number, { x: number; y: number }>()
    let ultimoX = 0
    let ultimoY = 0
    let ultimoTiempo = 0
    let idPuntero: number | null = null
    let separacionPellizco = 0

    const tocar = (): void => {
      estado.current.volviendo = false
      marcarModoLibre()
    }

    const separacion = (): number => {
      const [a, b] = Array.from(punteros.values())
      return Math.hypot(a.x - b.x, a.y - b.y)
    }

    const alBajar = (evento: PointerEvent): void => {
      if (evento.pointerType === 'mouse' && evento.button !== 0) return
      punteros.set(evento.pointerId, { x: evento.clientX, y: evento.clientY })
      elemento.setPointerCapture(evento.pointerId)
      if (punteros.size === 2) {
        // Segundo dedo: pasa de orbitar a pellizcar.
        idPuntero = null
        estado.current.arrastrando = false
        separacionPellizco = separacion()
        return
      }
      idPuntero = evento.pointerId
      ultimoX = evento.clientX
      ultimoY = evento.clientY
      ultimoTiempo = evento.timeStamp
      estado.current.arrastrando = true
      estado.current.velocidadAzimut = 0
      estado.current.velocidadPolar = 0
      elemento.style.cursor = 'grabbing'
    }

    const alMover = (evento: PointerEvent): void => {
      if (punteros.has(evento.pointerId)) punteros.set(evento.pointerId, { x: evento.clientX, y: evento.clientY })
      if (punteros.size === 2) {
        const nueva = separacion()
        if (separacionPellizco > 0) {
          estado.current.zoom += (nueva - separacionPellizco) * ZOOM_POR_PIXEL
          tocar()
        }
        separacionPellizco = nueva
        return
      }
      if (!estado.current.arrastrando || evento.pointerId !== idPuntero) return
      const dx = evento.clientX - ultimoX
      const dy = evento.clientY - ultimoY
      const dt = Math.max((evento.timeStamp - ultimoTiempo) / 1000, 1 / 240)
      const deltaAzimut = -dx * SENSIBILIDAD
      const deltaPolar = -dy * SENSIBILIDAD

      estado.current.azimut += deltaAzimut
      estado.current.polar += deltaPolar
      estado.current.velocidadAzimut = Math.max(-VELOCIDAD_MAXIMA, Math.min(VELOCIDAD_MAXIMA, deltaAzimut / dt))
      estado.current.velocidadPolar = Math.max(-VELOCIDAD_MAXIMA, Math.min(VELOCIDAD_MAXIMA, deltaPolar / dt))
      if (dx !== 0 || dy !== 0) tocar()

      ultimoX = evento.clientX
      ultimoY = evento.clientY
      ultimoTiempo = evento.timeStamp
    }

    const alSoltar = (evento: PointerEvent): void => {
      punteros.delete(evento.pointerId)
      if (evento.pointerId === idPuntero) {
        idPuntero = null
        estado.current.arrastrando = false
        elemento.style.cursor = 'grab'
      }
      if (punteros.size < 2) separacionPellizco = 0
    }

    // Rueda con Ctrl o Cmd (así llega el pellizco del trackpad): zoom. La rueda sola sigue
    // siendo el scroll de la narrativa.
    const alRueda = (evento: WheelEvent): void => {
      if (!evento.ctrlKey && !evento.metaKey) return
      evento.preventDefault()
      estado.current.zoom -= evento.deltaY * ZOOM_POR_PIXEL
      tocar()
    }

    const alTecla = (evento: KeyboardEvent): void => {
      if (evento.metaKey || evento.ctrlKey || evento.altKey) return
      if (evento.key === '+' || evento.key === '=') estado.current.zoom += ZOOM_POR_TECLA
      else if (evento.key === '-' || evento.key === '_') estado.current.zoom -= ZOOM_POR_TECLA
      else return
      tocar()
    }

    elemento.style.touchAction = 'pan-y'
    elemento.style.cursor = 'grab'
    elemento.addEventListener('pointerdown', alBajar)
    elemento.addEventListener('pointermove', alMover)
    elemento.addEventListener('pointerup', alSoltar)
    elemento.addEventListener('pointercancel', alSoltar)
    elemento.addEventListener('wheel', alRueda, { passive: false })
    window.addEventListener('keydown', alTecla)

    return () => {
      elemento.removeEventListener('pointerdown', alBajar)
      elemento.removeEventListener('pointermove', alMover)
      elemento.removeEventListener('pointerup', alSoltar)
      elemento.removeEventListener('pointercancel', alSoltar)
      elemento.removeEventListener('wheel', alRueda)
      window.removeEventListener('keydown', alTecla)
    }
  }, [elemento])

  /** Zoom sumado desde fuera (botones de la interfaz o teclado): pasos positivos acercan. */
  const sumarZoom = useCallback((pasos: number): void => {
    if (pasos === 0) return
    estado.current.zoom += pasos * ZOOM_POR_TECLA
    estado.current.volviendo = false
    marcarModoLibre()
  }, [])

  /** Vuelve al encuadre elegido: los desplazamientos se funden a cero en el siguiente segundo. */
  const volverAlEncuadre = useCallback((): void => {
    estado.current.volviendo = true
    estado.current.velocidadAzimut = 0
    estado.current.velocidadPolar = 0
  }, [])

  const actualizar = useCallback((delta: number): void => {
    const actual = estado.current
    if (actual.volviendo) {
      const k = Math.exp(-delta * 3.2)
      actual.azimut *= k
      actual.polar *= k
      actual.zoom *= k
      if (Math.abs(actual.azimut) + Math.abs(actual.polar) + Math.abs(actual.zoom) < 1e-3) {
        actual.azimut = 0
        actual.polar = 0
        actual.zoom = 0
        actual.volviendo = false
      }
      return
    }
    if (actual.arrastrando) return

    // Inercia tras soltar: la órbita sigue un poco y se frena; la elevación se queda donde está.
    const friccion = Math.exp(-delta * 2.6)
    actual.azimut += actual.velocidadAzimut * delta
    actual.polar += actual.velocidadPolar * delta
    actual.velocidadAzimut *= friccion
    actual.velocidadPolar *= friccion
  }, [])

  return { estado, actualizar, sumarZoom, volverAlEncuadre }
}
