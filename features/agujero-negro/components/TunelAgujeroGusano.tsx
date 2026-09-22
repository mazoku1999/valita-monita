'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { obtenerProgreso } from '@/features/narrativa/store/progresoScrollStore'
import { VIAJE } from '../constantes/viajeScroll'
import { DESTELLO_FRAG, SALIDA_FRAG, TUNEL_FRAG, TUNEL_VERT } from '../shaders/tunelAgujeroGusano'

/** Geometría y ritmo del túnel (unidades de la escena; la cámara va en el origen del grupo). */
const TUNEL = {
  radioInterior: 1.0,
  radioExterior: 1.8,
  /** Longitud por delante de la cámara y tramo que queda detrás. */
  largo: 70,
  detras: 4,
  /** Unidades que recorre el paisaje a lo largo de toda la fase del túnel (lo que avanza con el scroll). */
  recorrido: 420,
  /** Deriva en unidades por segundo cuando no se hace scroll: el túnel sigue vivo. */
  deriva: 1.5,
  /** Suavizado del avance ligado al scroll (los pasos de la rueda no dan tirones). */
  ritmoAvance: 4,
  /** Seguimiento de la orientación de la cámara: a corto plazo el túnel queda fijo en el mundo (~0.8 s). */
  ritmoGiro: 1.2,
  /** Luz de la salida: distancia delante de la cámara, escala máxima y resplandor tenue permanente en el punto de fuga. */
  salidaDistancia: 12,
  salidaEscala: 6,
  salidaMinima: 0.06,
  /** Progreso (antes de `tunelFin`) en que la luz de la salida empieza a crecer y en que arranca el destello. */
  salidaAntes: 0.06,
  destelloAntes: 0.015,
  /** Fracción de la fase del túnel en que el color pasa del naranja de la entrada al azul. */
  enfriamiento: 0.25,
  /** Cruce del horizonte: el túnel aparece mientras la distancia al centro baja de 1.1 a 0.75. */
  entradaDesde: 1.1,
  entradaHasta: 0.75,
} as const

const limitar = (valor: number, minimo: number, maximo: number): number =>
  Math.min(maximo, Math.max(minimo, valor))

const suavizar = (borde0: number, borde1: number, x: number): number => {
  const t = limitar((x - borde0) / (borde1 - borde0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Material HDR aditivo (uno + uno): las capas se suman y el bloom enciende lo más brillante. */
const materialAditivo = (
  vertexShader: string,
  fragmentShader: string,
  uniforms: Record<string, THREE.IUniform>,
  side: THREE.Side = THREE.FrontSide,
): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    side,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  })

const geometriaTubo = (radio: number): THREE.CylinderGeometry => {
  const geometria = new THREE.CylinderGeometry(radio, radio, TUNEL.largo + TUNEL.detras, 128, 1, true)
  // El eje del cilindro pasa a Z (la cámara mira hacia -Z) y el tubo va de -largo a +detras.
  geometria.rotateX(Math.PI / 2)
  geometria.translate(0, 0, (TUNEL.detras - TUNEL.largo) / 2)
  return geometria
}

const DESTELLO_VERT = /* glsl */ `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/**
 * Viaje por el interior del agujero, estilo Interstellar: al cruzar el horizonte (todo negro) la
 * cámara entra en un túnel de estelas de luz que avanza con el scroll durante la fase larga del
 * viaje (ver `constantes/viajeScroll.ts`); al final, la luz de la salida crece hasta un destello
 * blanco del que sale el anillo de papel (`EscenaAnilloFinal`). El túnel se ancla a la posición
 * de la cámara y sigue su orientación con retraso, de modo que el arrastre y el seguimiento del
 * cursor mueven el punto de fuga como si el túnel estuviera fijo en el mundo.
 */
export function TunelAgujeroGusano() {
  const ancla = useRef<THREE.Group>(null)
  const [movimientoReducido, setMovimientoReducido] = useState(false)
  const iniciado = useRef(false)
  const tiempo = useRef(0)
  const avanceSuave = useRef(0)

  const recursos = useMemo(() => {
    const crearTubo = (radio: number, semilla: number, brillo: number) => {
      const uniforms = {
        uAvance: { value: 0 },
        uTiempo: { value: 0 },
        uOpacidad: { value: 0 },
        uCalor: { value: 1 },
        uSemilla: { value: semilla },
        uBrillo: { value: brillo },
      }
      const geometria = geometriaTubo(radio)
      const material = materialAditivo(TUNEL_VERT, TUNEL_FRAG, uniforms, THREE.BackSide)
      const malla = new THREE.Mesh(geometria, material)
      malla.frustumCulled = false
      return { uniforms, geometria, material, malla }
    }
    const interior = crearTubo(TUNEL.radioInterior, 3, 1)
    const exterior = crearTubo(TUNEL.radioExterior, 29, 0.5)

    const uniformsSalida = { uSalida: { value: 0 } }
    const geometriaSalida = new THREE.CircleGeometry(1, 64)
    const materialSalida = materialAditivo(TUNEL_VERT, SALIDA_FRAG, uniformsSalida, THREE.DoubleSide)
    const salida = new THREE.Mesh(geometriaSalida, materialSalida)
    salida.position.set(0, 0, -TUNEL.salidaDistancia)
    salida.frustumCulled = false

    const uniformsDestello = { uDestello: { value: 0 } }
    const geometriaDestello = new THREE.PlaneGeometry(2, 2)
    const materialDestello = materialAditivo(DESTELLO_VERT, DESTELLO_FRAG, uniformsDestello, THREE.DoubleSide)
    const destello = new THREE.Mesh(geometriaDestello, materialDestello)
    destello.position.set(0, 0, -0.3)
    destello.scale.setScalar(4)
    destello.frustumCulled = false
    destello.renderOrder = 1000

    return {
      interior,
      exterior,
      salida,
      uniformsSalida,
      destello,
      uniformsDestello,
      liberar: () => {
        interior.geometria.dispose()
        interior.material.dispose()
        exterior.geometria.dispose()
        exterior.material.dispose()
        geometriaSalida.dispose()
        materialSalida.dispose()
        geometriaDestello.dispose()
        materialDestello.dispose()
      },
    }
  }, [])

  useEffect(() => () => recursos.liberar(), [recursos])

  useEffect(() => {
    const consulta = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sincronizar = (): void => setMovimientoReducido(consulta.matches)
    sincronizar()
    consulta.addEventListener('change', sincronizar)
    return () => consulta.removeEventListener('change', sincronizar)
  }, [])

  useFrame(({ camera }, delta) => {
    const grupo = ancla.current
    if (!grupo) return
    const paso = Math.min(delta, 0.25)
    const progreso = obtenerProgreso()
    const distancia = camera.position.length()

    // El túnel aparece al cruzar el horizonte y se apaga justo tras el destello de salida.
    const entrada = suavizar(TUNEL.entradaDesde, TUNEL.entradaHasta, distancia)
    const apagado = 1 - suavizar(VIAJE.tunelFin, VIAJE.tunelFin + 0.015, progreso)
    const opacidad = entrada * apagado
    const salida = suavizar(VIAJE.tunelFin - TUNEL.salidaAntes, VIAJE.tunelFin, progreso)
    const destello =
      suavizar(VIAJE.tunelFin - TUNEL.destelloAntes, VIAJE.tunelFin, progreso) *
      (1 - suavizar(VIAJE.tunelFin, VIAJE.destelloFin, progreso))
    grupo.visible = opacidad > 0.002 || destello > 0.001
    if (!grupo.visible) {
      iniciado.current = false
      return
    }

    // Anclado a la cámara; la orientación la sigue con retraso (paralaje del punto de fuga).
    grupo.position.copy(camera.position)
    if (!iniciado.current) {
      grupo.quaternion.copy(camera.quaternion)
      iniciado.current = true
    } else {
      grupo.quaternion.slerp(camera.quaternion, 1 - Math.exp(-paso * TUNEL.ritmoGiro))
    }

    if (!movimientoReducido) tiempo.current += paso
    const fraccionTunel = limitar((progreso - VIAJE.caidaFin) / (VIAJE.tunelFin - VIAJE.caidaFin), 0, 1)
    const avanceObjetivo = fraccionTunel * TUNEL.recorrido
    avanceSuave.current += (avanceObjetivo - avanceSuave.current) * (1 - Math.exp(-paso * TUNEL.ritmoAvance))
    const avance = avanceSuave.current + tiempo.current * TUNEL.deriva
    const calor = 1 - suavizar(0, TUNEL.enfriamiento, fraccionTunel)

    for (const tubo of [recursos.interior, recursos.exterior]) {
      tubo.uniforms.uAvance.value = avance
      tubo.uniforms.uTiempo.value = tiempo.current
      tubo.uniforms.uOpacidad.value = opacidad
      tubo.uniforms.uCalor.value = calor
    }
    // La salida: un resplandor tenue en el punto de fuga durante todo el viaje que, al final,
    // crece deprisa (cúbico) hasta ser un sol; el destello blanco remata la salida.
    recursos.uniformsSalida.uSalida.value = (TUNEL.salidaMinima + (1 - TUNEL.salidaMinima) * salida) * opacidad
    recursos.salida.visible = opacidad > 0.002
    recursos.salida.scale.setScalar(TUNEL.salidaEscala * (0.12 + 0.88 * salida * salida * salida))
    recursos.uniformsDestello.uDestello.value = destello * destello
    recursos.destello.visible = destello > 0.001
  })

  return (
    <group ref={ancla} visible={false}>
      <primitive object={recursos.exterior.malla} />
      <primitive object={recursos.interior.malla} />
      <primitive object={recursos.salida} />
      <primitive object={recursos.destello} />
    </group>
  )
}
