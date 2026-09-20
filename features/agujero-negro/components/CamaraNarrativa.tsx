'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { obtenerProgreso } from '@/features/narrativa/store/progresoScrollStore'
import { DISTANCIA_LIBRE, VISTAS_CAMARA, type VistaCamara } from '../constantes/vistasCamara'
import { useArrastreOrbital } from '../hooks/useArrastreOrbital'
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

const objetivoDeVista = (vista: VistaCamara, progreso: number): EstadoCompleto => {
  const fotograma = interpolarFotograma(progreso, vista.fotogramas)
  return {
    azimut: fotograma.azimut,
    polar: ajuste('polar', fotograma.polar),
    distancia: ajuste('distancia', fotograma.distancia),
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
      camera.rotateY(Math.atan(actual.encuadreX * tanMitadFov * camera.aspect))
      camera.rotateX(-Math.atan(actual.encuadreY * tanMitadFov))
    }
  })

  return null
}
