'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { obtenerProgreso } from '@/features/narrativa/store/progresoScrollStore'
import { DISTANCIA_LIBRE, VISTAS_CAMARA, type VistaCamara } from '../constantes/vistasCamara'
import { useArrastreOrbital } from '../hooks/useArrastreOrbital'
import { useSeguirCursor } from '../hooks/useSeguirCursor'
import { ajuste, consumirZoomPendiente, obtenerVersionVista, obtenerVista } from '../store/vistaCamaraStore'
import { interpolarFotograma } from '../utils/fotogramasCamara'

const POLAR_MINIMO = 0.08
const POLAR_MAXIMO = Math.PI - 0.08
const VELOCIDAD_AUTOGIRO = 0.018
// Tope amplio: la suavización es exponencial (estable con pasos grandes), solo evita
// saltos tras volver de una pestaña en segundo plano.
const PASO_MAXIMO = 0.25
// El azimut sigue al scroll con prontitud; la elevación, la distancia y el encuadre se mueven con
// una constante más lenta (~0.6 s) para que cambiar de vista sea un travelling y no un corte.
const RITMO_AZIMUT = 2.8
const RITMO_VISTA = 1.6
/**
 * Zoom ligado al scroll: la historia empieza con el agujero muy lejos (140 unidades, el anillo
 * de fotones mide un 5 % de la altura) y la cámara se acerca a lo largo de la página hasta la
 * distancia calibrada del encuadre (a dos tercios del scroll), y en el último tramo sigue
 * acercándose un poco más (×0.8). La interpolación es logarítmica: el tamaño aparente del
 * agujero crece a ritmo constante.
 */
const ZOOM_SCROLL = { distanciaInicial: 140, finAcercamiento: 0.65, cierreFinal: 0.2 } as const
/**
 * Seguimiento del cursor: el agujero (con su disco y el campo de polvo lensado) se desplaza en
 * pantalla hacia el ratón hasta un 35 % de la media pantalla, con un retraso de ~0.35 s.
 */
const ALCANCE_CURSOR = 0.35
const RITMO_CURSOR = 2.8

/** Estado completo de cámara: recorrido de scroll + colocación en pantalla de la vista. */
interface EstadoCompleto {
  azimut: number
  polar: number
  distancia: number
  fov: number
  inclinacion: number
  encuadreX: number
  encuadreY: number
}

const limitar = (valor: number, minimo: number, maximo: number): number =>
  Math.min(maximo, Math.max(minimo, valor))

const suavizar = (borde0: number, borde1: number, x: number): number => {
  const t = limitar((x - borde0) / (borde1 - borde0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Distancia de cámara según el scroll (ver ZOOM_SCROLL); una distancia fijada en la URL la anula. */
const distanciaConScroll = (distanciaFotograma: number, progreso: number): number => {
  const fijada = ajuste('distancia', Number.NaN)
  if (Number.isFinite(fijada)) return fijada
  const acercamiento = suavizar(0, ZOOM_SCROLL.finAcercamiento, progreso)
  const cierre = 1 - ZOOM_SCROLL.cierreFinal * suavizar(ZOOM_SCROLL.finAcercamiento, 1, progreso)
  const lnInicio = Math.log(ZOOM_SCROLL.distanciaInicial)
  const lnDestino = Math.log(distanciaFotograma * cierre)
  return Math.exp(lnInicio + (lnDestino - lnInicio) * acercamiento)
}

const objetivoDeVista = (vista: VistaCamara, progreso: number): EstadoCompleto => {
  const fotograma = interpolarFotograma(progreso, vista.fotogramas)
  return {
    azimut: fotograma.azimut,
    polar: ajuste('polar', fotograma.polar),
    distancia: distanciaConScroll(fotograma.distancia, progreso),
    fov: ajuste('fov', fotograma.fov),
    inclinacion: ajuste('inclinacion', vista.inclinacion),
    encuadreX: ajuste('encuadreX', vista.encuadre.x),
    encuadreY: ajuste('encuadreY', vista.encuadre.y),
  }
}

export function CamaraNarrativa() {
  const { camera, gl } = useThree()
  const { estado: arrastre, actualizar: actualizarArrastre, sumarZoom, volverAlEncuadre } = useArrastreOrbital(
    gl.domElement,
  )
  const cursor = useSeguirCursor()
  const desplazamientoCursor = useRef({ x: 0, y: 0 })
  const estadoActual = useRef<EstadoCompleto>(objetivoDeVista(VISTAS_CAMARA[obtenerVista()], 0))
  const versionVista = useRef(obtenerVersionVista())
  const giroAcumulado = useRef(0)
  const [movimientoReducido, setMovimientoReducido] = useState(false)

  useEffect(() => {
    const consulta = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sincronizar = (): void => setMovimientoReducido(consulta.matches)
    sincronizar()
    consulta.addEventListener('change', sincronizar)
    return () => consulta.removeEventListener('change', sincronizar)
  }, [])

  useFrame((_, delta) => {
    const paso = Math.min(delta, PASO_MAXIMO)
    const objetivo = objetivoDeVista(VISTAS_CAMARA[obtenerVista()], obtenerProgreso())
    const actual = estadoActual.current
    const kAzimut = 1 - Math.exp(-paso * RITMO_AZIMUT)
    const kVista = 1 - Math.exp(-paso * RITMO_VISTA)

    // Elegir un encuadre (aunque sea el activo) devuelve la cámara a él desde el modo libre.
    const version = obtenerVersionVista()
    if (version !== versionVista.current) {
      versionVista.current = version
      volverAlEncuadre()
    }
    sumarZoom(consumirZoomPendiente())

    actual.azimut += (objetivo.azimut - actual.azimut) * kAzimut
    actual.polar += (objetivo.polar - actual.polar) * kVista
    actual.distancia += (objetivo.distancia - actual.distancia) * kVista
    actual.fov += (objetivo.fov - actual.fov) * kVista
    actual.inclinacion += (objetivo.inclinacion - actual.inclinacion) * kVista
    actual.encuadreX += (objetivo.encuadreX - actual.encuadreX) * kVista
    actual.encuadreY += (objetivo.encuadreY - actual.encuadreY) * kVista

    actualizarArrastre(paso)
    if (!movimientoReducido) giroAcumulado.current += paso * VELOCIDAD_AUTOGIRO

    // El agujero sigue al cursor: se desplaza en pantalla hacia el ratón (con su disco y el campo
    // de polvo lensado, que van en la misma cámara) con un retraso suave; vuelve al centro cuando
    // el ratón sale de la ventana y se queda quieto mientras se arrastra para orbitar.
    const puntero = cursor.current
    if (!arrastre.current.arrastrando) {
      const seguir = puntero.activo && !movimientoReducido
      const objetivoX = seguir ? puntero.x * ALCANCE_CURSOR : 0
      const objetivoY = seguir ? puntero.y * ALCANCE_CURSOR : 0
      const kCursor = 1 - Math.exp(-paso * RITMO_CURSOR)
      desplazamientoCursor.current.x += (objetivoX - desplazamientoCursor.current.x) * kCursor
      desplazamientoCursor.current.y += (objetivoY - desplazamientoCursor.current.y) * kCursor
    }

    const azimut = actual.azimut + arrastre.current.azimut + giroAcumulado.current
    const polar = limitar(actual.polar + arrastre.current.polar, POLAR_MINIMO, POLAR_MAXIMO)
    // El zoom libre multiplica la distancia del encuadre y se acota: ni dentro del gas ni perdido.
    const distancia = limitar(
      actual.distancia * Math.exp(-arrastre.current.zoom),
      DISTANCIA_LIBRE.minima,
      DISTANCIA_LIBRE.maxima,
    )
    const seno = Math.sin(polar)

    camera.position.set(
      distancia * seno * Math.sin(azimut),
      distancia * Math.cos(polar),
      distancia * seno * Math.cos(azimut),
    )
    camera.up.set(0, 1, 0)
    camera.lookAt(0, 0, 0)
    // Roll negativo: la cámara gira en sentido horario y el disco asciende hacia la derecha.
    camera.rotateZ(-actual.inclinacion)

    if (camera instanceof THREE.PerspectiveCamera) {
      if (Math.abs(camera.fov - actual.fov) > 0.01) {
        camera.fov = actual.fov
        camera.updateProjectionMatrix()
      }
      // Encuadre descentrado: tras el roll, los ejes locales coinciden con los de pantalla,
      // así que un giro pequeño en yaw/pitch desplaza el agujero a la posición de la referencia.
      const tanMitadFov = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
      const encuadreX = actual.encuadreX + desplazamientoCursor.current.x
      const encuadreY = actual.encuadreY + desplazamientoCursor.current.y
      camera.rotateY(Math.atan(encuadreX * tanMitadFov * camera.aspect))
      camera.rotateX(-Math.atan(encuadreY * tanMitadFov))
    }
  })

  return null
}
