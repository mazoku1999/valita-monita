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
 * Zoom ligado al scroll: la cámara empieza lejos y se va acercando al agujero a lo largo de la
 * historia (factor sobre la distancia de cada encuadre).
 */
const ZOOM_SCROLL = { inicio: 1.35, fin: 0.75 } as const
/** Giro ligado al scroll en el recorrido de canto: el disco se alza hasta ~12.6° a mitad de página y vuelve a cerrarse. */
const BARRIDO_ELEVACION = 0.22
/** El disco inclina su línea hacia el cursor: velocidad del seguimiento y zona muerta central. */
const RITMO_CURSOR = 3.5
const ZONA_MUERTA_CURSOR = 0.08
const ALCANCE_CURSOR = 0.4

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


const objetivoDeVista = (vista: VistaCamara, progreso: number): EstadoCompleto => {
  const fotograma = interpolarFotograma(progreso, vista.fotogramas)
  const zoom = ZOOM_SCROLL.inicio + (ZOOM_SCROLL.fin - ZOOM_SCROLL.inicio) * suavizar(0, 1, progreso)
  // El giro con el scroll sólo en el recorrido de canto: los demás encuadres son ángulos que el
  // usuario ha elegido y se respetan.
  const barrido = vista.id === 'canto' ? -BARRIDO_ELEVACION * Math.sin(Math.PI * progreso) : 0
  return {
    azimut: fotograma.azimut,
    polar: ajuste('polar', fotograma.polar) + barrido,
    distancia: ajuste('distancia', fotograma.distancia) * zoom,
    fov: ajuste('fov', fotograma.fov),
    inclinacion: ajuste('inclinacion', vista.inclinacion),
    encuadreX: ajuste('encuadreX', vista.encuadre.x),
    encuadreY: ajuste('encuadreY', vista.encuadre.y),
  }
}

export function CamaraNarrativa() {
  const { camera, gl, size } = useThree()
  const { estado: arrastre, actualizar: actualizarArrastre, sumarZoom, volverAlEncuadre } = useArrastreOrbital(
    gl.domElement,
  )
  const cursor = useSeguirCursor()
  const rollCursor = useRef(0)
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

    // La línea del disco apunta hacia el cursor: horizontal con el ratón en el centro (o fuera
    // de la ventana), diagonal hacia abajo a la derecha si el ratón está abajo a la derecha, y
    // así con cualquier posición. El ángulo de una línea es módulo 180°, así que se elige la
    // vuelta más cercana al roll actual para que nunca dé un salto, y se sigue con una suavidad
    // de ~0.3 s.
    const puntero = cursor.current
    let objetivoRoll = 0
    if (puntero.activo && !movimientoReducido) {
      const dx = puntero.x * (size.width / Math.max(size.height, 1))
      const dy = puntero.y
      const radio = Math.hypot(dx, dy)
      let angulo = Math.atan2(dy, dx)
      if (angulo > Math.PI / 2) angulo -= Math.PI
      if (angulo < -Math.PI / 2) angulo += Math.PI
      objetivoRoll = angulo * suavizar(ZONA_MUERTA_CURSOR, ALCANCE_CURSOR, radio)
    }
    while (objetivoRoll - rollCursor.current > Math.PI / 2) objetivoRoll -= Math.PI
    while (objetivoRoll - rollCursor.current < -Math.PI / 2) objetivoRoll += Math.PI
    rollCursor.current += (objetivoRoll - rollCursor.current) * (1 - Math.exp(-paso * RITMO_CURSOR))

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
    camera.rotateZ(-(actual.inclinacion + rollCursor.current))

    if (camera instanceof THREE.PerspectiveCamera) {
      if (Math.abs(camera.fov - actual.fov) > 0.01) {
        camera.fov = actual.fov
        camera.updateProjectionMatrix()
      }
      // Encuadre descentrado: tras el roll, los ejes locales coinciden con los de pantalla,
      // así que un giro pequeño en yaw/pitch desplaza el agujero a la posición de la referencia.
      const tanMitadFov = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
      camera.rotateY(Math.atan(actual.encuadreX * tanMitadFov * camera.aspect))
      camera.rotateX(-Math.atan(actual.encuadreY * tanMitadFov))
    }
  })

  return null
}
