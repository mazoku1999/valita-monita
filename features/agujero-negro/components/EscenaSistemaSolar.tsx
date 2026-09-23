'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { obtenerProgreso } from '@/features/narrativa/store/progresoScrollStore'
import { SistemaSolar } from '@/features/sistema-solar/components/SistemaSolar'
import { direccionEcliptica } from '@/features/sistema-solar/datos/planetas'
import { VIAJE } from '../constantes/viajeScroll'

/**
 * Llegada a casa: al salir por la boca del agujero de gusano, delante está nuestro sistema solar,
 * visto desde muy lejos (el Sol es una estrella brillante y las órbitas un óvalo diminuto) y la
 * cámara se acerca con el scroll hasta que entero llena la pantalla, mientras lo rodea despacio
 * y lo mira cada vez más desde arriba. Después aparece el anillo de papel delante.
 *
 * Va dentro del marco del agujero de gusano (`TunelAgujeroGusano`), que sigue a la cámara con
 * retraso: el Sol queda delante, en el eje por el que se sale, y el sistema no se mueve respecto
 * al cielo del otro lado (el de la Vía Láctea que se ve al salir).
 */
const ENCUADRE = {
  /** Radio que tiene que caber en pantalla: la órbita de Neptuno (41.5 u) con algo de margen. */
  radio: 47,
  /** Fracción de la pantalla que ocupa ese radio al final del acercamiento. */
  ocupacion: 0.9,
  /** Distancia mínima al Sol al final (en pantallas anchas la órbita de Neptuno cabe de sobra). */
  distanciaMinima: 85,
  /** Al aparecer, el sistema está este múltiplo de veces más lejos que al final. */
  alejamiento: 4,
  /**
   * Tamaño de los planetas al aparecer (fracción del final): desde tan lejos, a escala real, no
   * serían más que puntos; crecen hasta su tamaño visible mientras la cámara se acerca.
   */
  planetasDeLejos: 0.45,
  /** Elevación sobre la eclíptica (°): casi de canto al llegar, más desde arriba al final. */
  elevacion: { desde: 14, hasta: 30 },
  /**
   * Longitud eclíptica desde la que se mira (°). Alrededor de 80° el polo de Saturno (longitud
   * 79.5°, latitud 62°) apunta hacia la cámara y sus anillos se ven abiertos, no de canto.
   */
  azimut: { desde: 55, hasta: 95 },
} as const

const suavizar = (borde0: number, borde1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - borde0) / (borde1 - borde0)))
  return t * t * (3 - 2 * t)
}

export function EscenaSistemaSolar() {
  const colocacion = useRef<THREE.Group>(null)
  const aparicion = useRef(0)
  const escalaPlanetas = useRef<number>(ENCUADRE.planetasDeLejos)
  const [movimientoReducido, setMovimientoReducido] = useState(false)
  const auxiliares = useRef({
    matriz: new THREE.Matrix4(),
    direccion: new THREE.Vector3(),
    origen: new THREE.Vector3(),
    arriba: new THREE.Vector3(0, 1, 0),
  })

  useEffect(() => {
    const consulta = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sincronizar = (): void => setMovimientoReducido(consulta.matches)
    sincronizar()
    consulta.addEventListener('change', sincronizar)
    return () => consulta.removeEventListener('change', sincronizar)
  }, [])

  useFrame(({ camera }) => {
    const grupo = colocacion.current
    if (!grupo) return
    const progreso = obtenerProgreso()
    aparicion.current = suavizar(VIAJE.sistemaInicio, VIAJE.sistemaPleno, progreso)
    grupo.visible = aparicion.current > 0.002
    if (!grupo.visible) return

    const avance = suavizar(VIAJE.sistemaInicio, VIAJE.anilloInicio, progreso)
    escalaPlanetas.current = ENCUADRE.planetasDeLejos + (1 - ENCUADRE.planetasDeLejos) * avance
    const elevacion = ENCUADRE.elevacion.desde + (ENCUADRE.elevacion.hasta - ENCUADRE.elevacion.desde) * avance
    const azimut = ENCUADRE.azimut.desde + (ENCUADRE.azimut.hasta - ENCUADRE.azimut.desde) * avance

    // Distancia final: la órbita de Neptuno cabe a lo ancho y, vista desde la elevación final, a
    // lo alto (en vertical ocupa radio·sen(elevación)).
    const perspectiva = camera instanceof THREE.PerspectiveCamera ? camera : null
    const tanVertical = Math.tan(THREE.MathUtils.degToRad((perspectiva?.fov ?? 42) / 2))
    const tanHorizontal = tanVertical * (perspectiva?.aspect ?? 16 / 9)
    const senoFinal = Math.sin(THREE.MathUtils.degToRad(ENCUADRE.elevacion.hasta))
    const distanciaFinal = Math.max(
      ENCUADRE.distanciaMinima,
      ENCUADRE.radio / (ENCUADRE.ocupacion * tanHorizontal),
      (ENCUADRE.radio * senoFinal) / (ENCUADRE.ocupacion * tanVertical),
    )
    const distancia = distanciaFinal * Math.pow(ENCUADRE.alejamiento, 1 - avance)

    // El Sol delante, en el eje del marco (−Z); el sistema girado para que la cámara lo vea desde
    // (azimut, elevación) con el norte de la eclíptica hacia arriba.
    const { matriz, direccion, origen, arriba } = auxiliares.current
    direccionEcliptica(azimut, elevacion, direccion)
    matriz.lookAt(direccion, origen, arriba)
    grupo.quaternion.setFromRotationMatrix(matriz).invert()
    grupo.position.set(0, 0, -distancia)
  })

  return (
    <group ref={colocacion} visible={false}>
      <SistemaSolar
        aparicion={aparicion}
        escalaPlanetas={escalaPlanetas}
        distanciaReferencia={ENCUADRE.distanciaMinima}
        quieto={movimientoReducido}
      />
    </group>
  )
}
