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
 * visto desde muy lejos (el Sol es una estrella brillante y las órbitas un óvalo diminuto); la
 * cámara se acerca con el scroll hasta verlo entero, rodeándolo despacio y mirándolo cada vez más
 * desde arriba, y al final busca la Tierra y se acerca a ella hasta que llena media pantalla,
 * iluminada de lado por el Sol, con la Luna cerca, mientras el tiempo se frena.
 *
 * Es el movimiento de una cámara real: los tamaños sólo cambian con la distancia. El viaje a la
 * Tierra sale de donde estaba la cámara con el sistema entero a la vista y va en línea recta: gira
 * sólo lo justo para centrar la Tierra (unos grados) y avanza hacia ella. Antes se orientaba hacia
 * un punto de vista fijo de la Tierra y la vista se iba hacia arriba: no respetaba de dónde venía.
 * Al llegar, la Tierra gira hasta que en Cochabamba amanece y la cámara planea sobre ella hasta
 * quedar encima de Bolivia, bajando; allí la reciben las nubes (`NubesDeEntrada`) y el valle.
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
  /** Elevación sobre la eclíptica (°): casi de canto al llegar, más desde arriba al final. */
  elevacion: { desde: 14, hasta: 30 },
  /**
   * Longitud eclíptica desde la que se mira (°). Alrededor de 80° el polo de Saturno (longitud
   * 79.5°, latitud 62°) apunta hacia la cámara y sus anillos se ven abiertos, no de canto.
   */
  azimut: { desde: 55, hasta: 95 },
} as const

/** Al terminar el avance, el radio de la Tierra ocupa este tanto de media pantalla. */
const OCUPACION_TIERRA = 0.72

/**
 * Tramos del viaje a la Tierra (fracciones de su parte del scroll): el giro que la centra, el
 * avance en línea recta y el ajuste del giro de la Tierra para que en Cochabamba amanezca.
 */
const VIAJE_TIERRA = { centrar: [0, 0.35], avance: [0.1, 1], alineacion: [0.35, 0.9] } as const

/**
 * Entrada en la Tierra: altura final sobre Cochabamba (en radios de la Tierra; ahí empiezan las
 * nubes) y cuánto mira la cámara por delante de su camino mientras planea.
 */
const ENTRADA = { alturaFinal: 0.3, adelanto: 0.3 } as const

const suavizar = (borde0: number, borde1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - borde0) / (borde1 - borde0)))
  return t * t * (3 - 2 * t)
}

/** Interpolación esférica entre dos direcciones unitarias. */
const interpolarDireccion = (a: THREE.Vector3, b: THREE.Vector3, t: number, destino: THREE.Vector3): THREE.Vector3 => {
  const coseno = Math.min(1, Math.max(-1, a.dot(b)))
  const angulo = Math.acos(coseno)
  if (angulo < 1e-4) return destino.copy(b)
  // Casi opuestas: el arco pasa por una perpendicular cualquiera (el norte, o el eje X si no vale).
  if (angulo > Math.PI - 1e-3) {
    const eje = Math.abs(a.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
    const perpendicular = eje.addScaledVector(a, -eje.dot(a)).normalize()
    const giro = t * angulo
    return destino.copy(a).multiplyScalar(Math.cos(giro)).addScaledVector(perpendicular, Math.sin(giro)).normalize()
  }
  const seno = Math.sin(angulo)
  const pesoA = Math.sin((1 - t) * angulo) / seno
  const pesoB = Math.sin(t * angulo) / seno
  return destino.set(a.x * pesoA + b.x * pesoB, a.y * pesoA + b.y * pesoB, a.z * pesoA + b.z * pesoB).normalize()
}

export function EscenaSistemaSolar() {
  const colocacion = useRef<THREE.Group>(null)
  const aparicion = useRef(0)
  const ritmo = useRef(1)
  const guias = useRef(1)
  const luna = useRef(0)
  const alineacionTierra = useRef(0)
  const tierra = useRef<THREE.Object3D | null>(null)
  const cochabamba = useRef(new THREE.Vector3(0, 1, 0))
  const [movimientoReducido, setMovimientoReducido] = useState(false)
  const auxiliares = useRef({
    matriz: new THREE.Matrix4(),
    vista: new THREE.Vector3(),
    vistaSistema: new THREE.Vector3(),
    origenViaje: new THREE.Vector3(),
    haciaCamara: new THREE.Vector3(),
    camaraSistema: new THREE.Vector3(),
    direccionEntrada: new THREE.Vector3(),
    direccionMirada: new THREE.Vector3(),
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
    // Tras las nubes, el valle toma el relevo: el sistema desaparece.
    aparicion.current = progreso < VIAJE.nubesPleno ? suavizar(VIAJE.sistemaInicio, VIAJE.sistemaPleno, progreso) : 0
    grupo.visible = aparicion.current > 0.002
    if (!grupo.visible) return

    const {
      matriz,
      vista,
      vistaSistema,
      origenViaje,
      haciaCamara,
      camaraSistema,
      direccionEntrada,
      direccionMirada,
      objetivo,
      origen,
      arriba,
    } = auxiliares.current
    const avance = suavizar(VIAJE.sistemaInicio, VIAJE.sistemaEntero, progreso)
    const tramoTierra = Math.min(1, Math.max(0, (progreso - VIAJE.tierraInicio) / (VIAJE.tierraFin - VIAJE.tierraInicio)))
    const tramoEntrada = Math.min(1, Math.max(0, (progreso - VIAJE.tierraFin) / (VIAJE.entradaFin - VIAJE.tierraFin)))
    // Camino de la Tierra: la cámara la centra y avanza hacia ella; las órbitas se apagan, la Luna
    // aparece, el reloj de las órbitas casi se detiene y la Tierra gira hasta que en Cochabamba
    // amanece.
    const centrar = suavizar(VIAJE_TIERRA.centrar[0], VIAJE_TIERRA.centrar[1], tramoTierra)
    const acercar = suavizar(VIAJE_TIERRA.avance[0], VIAJE_TIERRA.avance[1], tramoTierra)
    ritmo.current = 1 - 0.97 * suavizar(0, 0.6, tramoTierra)
    guias.current = 1 - suavizar(0.05, 0.5, tramoTierra)
    luna.current = suavizar(0.35, 0.8, tramoTierra)
    alineacionTierra.current = suavizar(VIAJE_TIERRA.alineacion[0], VIAJE_TIERRA.alineacion[1], tramoTierra)

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
      // En el marco del sistema: la cámara estaba en `origenViaje` mirando al Sol; avanza en línea
      // recta hacia la Tierra (distancia en escala logarítmica: el tamaño aparente crece a ritmo
      // constante) mientras el punto al que mira pasa del Sol a la Tierra.
      origenViaje.copy(vistaSistema).multiplyScalar(distanciaSistema)
      haciaCamara.copy(origenViaje).sub(malla.position)
      const lejos = haciaCamara.length()
      haciaCamara.normalize()
      const radioTierra = malla.scale.x
      // Al final del avance la Tierra ocupa `OCUPACION_TIERRA` de media pantalla (a lo alto o, en
      // pantallas estrechas, a lo ancho).
      const cerca = radioTierra / Math.sin(OCUPACION_TIERRA * Math.min(mitadFov, Math.atan(tanHorizontal)))
      const recorrido = Math.exp(Math.log(lejos) + (Math.log(cerca) - Math.log(lejos)) * acercar)
      camaraSistema.copy(malla.position).addScaledVector(haciaCamara, recorrido)
      objetivo.copy(malla.position).multiplyScalar(centrar)
      if (tramoEntrada > 0) {
        // Entrada: la cámara planea sobre la Tierra desde donde llegó hasta la vertical de
        // Cochabamba, bajando, y pasa de mirar al centro de la Tierra a mirar el suelo por delante.
        const e = suavizar(0, 1, tramoEntrada)
        interpolarDireccion(haciaCamara, cochabamba.current, e, direccionEntrada)
        const alturaInicial = cerca - radioTierra
        const alturaFinal = ENTRADA.alturaFinal * radioTierra
        const altura = Math.exp(Math.log(alturaInicial) + (Math.log(alturaFinal) - Math.log(alturaInicial)) * e)
        camaraSistema.copy(malla.position).addScaledVector(direccionEntrada, radioTierra + altura)
        interpolarDireccion(direccionEntrada, cochabamba.current, ENTRADA.adelanto * (1 - e), direccionMirada)
        objetivo.copy(malla.position).addScaledVector(direccionMirada, radioTierra * e)
      }
      vista.copy(camaraSistema).sub(objetivo)
      distancia = vista.length()
      vista.normalize()
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
        quieto={movimientoReducido}
        ritmo={ritmo}
        guias={guias}
        luna={luna}
        tierra={tierra}
        alineacionTierra={alineacionTierra}
        cochabamba={cochabamba}
      />
    </group>
  )
}
