'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { obtenerProgreso } from '@/features/narrativa/store/progresoScrollStore'
import { SistemaSolar } from '@/features/sistema-solar/components/SistemaSolar'
import { direccionEcliptica, radioVisible } from '@/features/sistema-solar/datos/planetas'
import { VIAJE } from '../constantes/viajeScroll'

/**
 * Llegada a casa: al salir por la boca del agujero de gusano, delante está nuestro sistema solar,
 * visto desde muy lejos (el Sol es una estrella brillante y las órbitas un óvalo diminuto); la
 * cámara se acerca con el scroll hasta verlo entero, rodeándolo despacio y mirándolo cada vez más
 * desde arriba, y al final busca la Tierra y se acerca a ella hasta que llena media pantalla,
 * iluminada de lado por el Sol, con la Luna cerca, mientras el tiempo se frena.
 *
 * Va dentro del marco del agujero de gusano (`TunelAgujeroGusano`), que sigue a la cámara con
 * retraso: el sistema no se mueve respecto al cielo del otro lado (la Vía Láctea que se ve al
 * salir). "Mover la cámara" es colocar el sistema: el punto al que se mira (el Sol y luego la
 * Tierra) queda en el eje del marco (−Z) a la distancia de la cámara, y el sistema se gira para
 * que la cámara lo vea desde la dirección del recorrido.
 */
const ENCUADRE = {
  /** Radio que tiene que caber en pantalla: la órbita de Neptuno (41.5 u) con algo de margen. */
  radio: 47,
  /** Fracción de la pantalla que ocupa ese radio al verse el sistema entero. */
  ocupacion: 0.9,
  /** Distancia mínima al Sol con el sistema entero (en pantallas anchas cabe de sobra). */
  distanciaMinima: 85,
  /** Al aparecer, el sistema está este múltiplo de veces más lejos que al verlo entero. */
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

/**
 * Plano final de la Tierra: la cámara la ve con un ángulo de fase de 65° (el Sol de lado y algo
 * por detrás de la cámara: dos tercios iluminados, el terminador a un lado con las luces de las
 * ciudades y el reflejo del Sol en el océano) y 20° por encima del plano de su órbita; el radio
 * de la Tierra ocupa el 72 % de media pantalla.
 */
const PLANO_TIERRA = { fase: (65 * Math.PI) / 180, elevacion: (20 * Math.PI) / 180, ocupacion: 0.72 } as const

const suavizar = (borde0: number, borde1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - borde0) / (borde1 - borde0)))
  return t * t * (3 - 2 * t)
}

/** Interpolación esférica entre dos direcciones unitarias. */
const interpolarDireccion = (a: THREE.Vector3, b: THREE.Vector3, t: number, destino: THREE.Vector3): THREE.Vector3 => {
  const coseno = Math.min(1, Math.max(-1, a.dot(b)))
  const angulo = Math.acos(coseno)
  if (angulo < 1e-4) return destino.copy(b)
  const seno = Math.sin(angulo)
  const pesoA = Math.sin((1 - t) * angulo) / seno
  const pesoB = Math.sin(t * angulo) / seno
  return destino.set(a.x * pesoA + b.x * pesoB, a.y * pesoA + b.y * pesoB, a.z * pesoA + b.z * pesoB).normalize()
}

export function EscenaSistemaSolar() {
  const colocacion = useRef<THREE.Group>(null)
  const aparicion = useRef(0)
  const escalaPlanetas = useRef<number>(ENCUADRE.planetasDeLejos)
  const ritmo = useRef(1)
  const guias = useRef(1)
  const luna = useRef(0)
  const lejanos = useRef(1)
  const tierra = useRef<THREE.Object3D | null>(null)
  const [movimientoReducido, setMovimientoReducido] = useState(false)
  const auxiliares = useRef({
    matriz: new THREE.Matrix4(),
    vista: new THREE.Vector3(),
    vistaSistema: new THREE.Vector3(),
    vistaTierra: new THREE.Vector3(),
    haciaSol: new THREE.Vector3(),
    avanceOrbital: new THREE.Vector3(),
    objetivo: new THREE.Vector3(),
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

    const { matriz, vista, vistaSistema, vistaTierra, haciaSol, avanceOrbital, objetivo, origen, arriba } = auxiliares.current
    const avance = suavizar(VIAJE.sistemaInicio, VIAJE.sistemaEntero, progreso)
    const tramoTierra = Math.min(1, Math.max(0, (progreso - VIAJE.tierraInicio) / (VIAJE.tierraFin - VIAJE.tierraInicio)))
    // La cámara primero se vuelve hacia la Tierra y después se acerca; las órbitas y los
    // cinturones se apagan, la Luna aparece y el reloj de las órbitas casi se detiene.
    const apuntar = suavizar(0, 0.55, tramoTierra)
    const acercar = suavizar(0.1, 1, tramoTierra)
    ritmo.current = 1 - 0.97 * suavizar(0, 0.6, tramoTierra)
    guias.current = 1 - suavizar(0.05, 0.5, tramoTierra)
    luna.current = suavizar(0.35, 0.8, tramoTierra)
    lejanos.current = 1 - suavizar(0.08, 0.6, tramoTierra)
    escalaPlanetas.current = ENCUADRE.planetasDeLejos + (1 - ENCUADRE.planetasDeLejos) * avance

    const elevacion = ENCUADRE.elevacion.desde + (ENCUADRE.elevacion.hasta - ENCUADRE.elevacion.desde) * avance
    const azimut = ENCUADRE.azimut.desde + (ENCUADRE.azimut.hasta - ENCUADRE.azimut.desde) * avance

    // Distancia con el sistema entero: la órbita de Neptuno cabe a lo ancho y, vista desde la
    // elevación final, a lo alto (en vertical ocupa radio·sen(elevación)).
    const perspectiva = camera instanceof THREE.PerspectiveCamera ? camera : null
    const mitadFov = THREE.MathUtils.degToRad((perspectiva?.fov ?? 42) / 2)
    const tanVertical = Math.tan(mitadFov)
    const tanHorizontal = tanVertical * (perspectiva?.aspect ?? 16 / 9)
    const senoFinal = Math.sin(THREE.MathUtils.degToRad(ENCUADRE.elevacion.hasta))
    const distanciaSistema = Math.max(
      ENCUADRE.distanciaMinima,
      ENCUADRE.radio / (ENCUADRE.ocupacion * tanHorizontal),
      (ENCUADRE.radio * senoFinal) / (ENCUADRE.ocupacion * tanVertical),
    )
    let distancia = distanciaSistema * Math.pow(ENCUADRE.alejamiento, 1 - avance)
    direccionEcliptica(azimut, elevacion, vistaSistema)
    vista.copy(vistaSistema)
    objetivo.set(0, 0, 0)

    const malla = tierra.current
    if (malla && tramoTierra > 0) {
      // Dirección desde la Tierra hacia la cámara en el plano final: a `fase` del Sol, hacia el
      // lado al que avanza en su órbita, y algo por encima de ella.
      haciaSol.copy(malla.position).multiplyScalar(-1).normalize()
      avanceOrbital.crossVectors(arriba, malla.position).normalize()
      vistaTierra
        .copy(avanceOrbital)
        .multiplyScalar(Math.cos(PLANO_TIERRA.elevacion))
        .addScaledVector(arriba, Math.sin(PLANO_TIERRA.elevacion))
        .normalize()
        .multiplyScalar(Math.sin(PLANO_TIERRA.fase))
        .addScaledVector(haciaSol, Math.cos(PLANO_TIERRA.fase))
        .normalize()
      interpolarDireccion(vistaSistema, vistaTierra, apuntar, vista)
      objetivo.copy(malla.position).multiplyScalar(apuntar)
      // Distancia final: la Tierra ocupa `ocupacion` de media pantalla (a lo alto o, en pantallas
      // estrechas, a lo ancho).
      const angularTierra = PLANO_TIERRA.ocupacion * Math.min(mitadFov, Math.atan(tanHorizontal))
      const distanciaTierra = radioVisible(1) / Math.sin(angularTierra)
      distancia = Math.exp(Math.log(distanciaSistema) + (Math.log(distanciaTierra) - Math.log(distanciaSistema)) * acercar)
    }

    // El sistema se gira para que la cámara lo vea desde `vista` con el norte de la eclíptica
    // hacia arriba, y se coloca para que el objetivo quede en el eje, delante, a `distancia`.
    matriz.lookAt(vista, origen, arriba)
    grupo.quaternion.setFromRotationMatrix(matriz).invert()
    grupo.position.copy(objetivo).applyQuaternion(grupo.quaternion).multiplyScalar(-1)
    grupo.position.z -= distancia
  })

  return (
    <group ref={colocacion} visible={false}>
      <SistemaSolar
        aparicion={aparicion}
        escalaPlanetas={escalaPlanetas}
        distanciaReferencia={ENCUADRE.distanciaMinima}
        quieto={movimientoReducido}
        ritmo={ritmo}
        guias={guias}
        luna={luna}
        tierra={tierra}
        lejanos={lejanos}
      />
    </group>
  )
}
