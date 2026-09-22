'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { obtenerProgreso } from '@/features/narrativa/store/progresoScrollStore'
import { VIAJE } from '../constantes/viajeScroll'
import { ajuste } from '../store/vistaCamaraStore'
import { AGUJERO_GUSANO_FRAG, AGUJERO_GUSANO_VERT, DESTELLO_FRAG, PLANO_VERT } from '../shaders/agujeroGusano'

/** Recorrido de la cámara por el agujero de gusano (ver el shader: garganta de radio 1 y longitud 3). */
const GUSANO = {
  /** l al empezar (fuera de la boca de este lado) y al terminar (fuera de la boca del otro lado). */
  lInicio: -5.5,
  lFin: 5.5,
  /** Suavizado del avance ligado al scroll (los pasos de la rueda no dan tirones). */
  ritmoAvance: 4,
  /** Balanceo lento de la posición cuando no se hace scroll (amplitud en l y frecuencia en rad/s). */
  balanceo: 0.12,
  balanceoRitmo: 0.4,
  /** Desenfoque de movimiento: una muestra más por cada tanto de l recorrido en el fotograma (máximo 3). */
  lPorMuestra: 0.03,
  /** Seguimiento de la orientación de la cámara: a corto plazo el eje queda fijo en el mundo (~0.8 s). */
  ritmoGiro: 1.2,
  /** Cruce del horizonte: el paso aparece mientras la distancia al centro baja de 1.1 a 0.75. */
  entradaDesde: 1.1,
  entradaHasta: 0.75,
  /** Progreso (antes de `tunelFin`) en que arranca el destello de salida. */
  destelloAntes: 0.015,
} as const

const limitar = (valor: number, minimo: number, maximo: number): number =>
  Math.min(maximo, Math.max(minimo, valor))

const suavizar = (borde0: number, borde1: number, x: number): number => {
  const t = limitar((x - borde0) / (borde1 - borde0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Material HDR aditivo (uno + uno) sin profundidad: se suma sobre el negro del interior. */
const materialAditivo = (
  vertexShader: string,
  fragmentShader: string,
  uniforms: Record<string, THREE.IUniform>,
  glsl3: boolean,
): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    glslVersion: glsl3 ? THREE.GLSL3 : null,
    vertexShader,
    fragmentShader,
    uniforms,
    side: THREE.DoubleSide,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  })

/**
 * Viaje por el interior del agujero, estilo Interstellar: al cruzar el horizonte (todo negro) la
 * cámara recorre un agujero de gusano trazado por píxel (`shaders/agujeroGusano.ts`) durante la
 * fase del túnel (ver `constantes/viajeScroll.ts`): la boca del otro lado se ve delante como una
 * esfera de cielo lensado que crece hasta rodearnos, dentro los cielos se enrollan por las
 * paredes y se retuercen al avanzar, y al salir el cielo del otro lado se abre; un destello blanco
 * remata la salida y de él sale el anillo de papel (`EscenaAnilloFinal`). El eje del agujero de
 * gusano sigue la orientación de la cámara con retraso, de modo que el arrastre y el cursor
 * mueven la vista como si el eje estuviera fijo en el mundo.
 */
export function TunelAgujeroGusano() {
  const { size } = useThree()
  const ancla = useRef<THREE.Group>(null)
  const [movimientoReducido, setMovimientoReducido] = useState(false)
  const iniciado = useRef(false)
  const tiempo = useRef(0)
  const lSuave = useRef<number>(GUSANO.lInicio)
  const lPrevio = useRef<number>(GUSANO.lInicio)
  const rotacion = useRef(new THREE.Matrix4())
  const inversa = useRef(new THREE.Quaternion())

  const recursos = useMemo(() => {
    const uniformsGusano = {
      uProyInversa: { value: new THREE.Matrix4() },
      uCamaraMundo: { value: new THREE.Matrix4() },
      uMarcoInverso: { value: new THREE.Matrix3() },
      uL: { value: GUSANO.lInicio as number },
      uDeltaL: { value: 0 },
      uMuestras: { value: 1 },
      uTiempo: { value: 0 },
      uOpacidad: { value: 0 },
      uAnguloPixel: { value: 0.001 },
    }
    const geometriaPantalla = new THREE.PlaneGeometry(2, 2)
    const materialGusano = materialAditivo(AGUJERO_GUSANO_VERT, AGUJERO_GUSANO_FRAG, uniformsGusano, true)
    const gusano = new THREE.Mesh(geometriaPantalla, materialGusano)
    gusano.frustumCulled = false
    gusano.renderOrder = -5

    const uniformsDestello = { uDestello: { value: 0 } }
    const geometriaDestello = new THREE.PlaneGeometry(2, 2)
    const materialDestello = materialAditivo(PLANO_VERT, DESTELLO_FRAG, uniformsDestello, false)
    const destello = new THREE.Mesh(geometriaDestello, materialDestello)
    destello.position.set(0, 0, -0.3)
    destello.scale.setScalar(4)
    destello.frustumCulled = false
    destello.renderOrder = 1000

    return {
      gusano,
      uniformsGusano,
      destello,
      uniformsDestello,
      liberar: () => {
        geometriaPantalla.dispose()
        materialGusano.dispose()
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

    // El paso aparece al cruzar el horizonte y se apaga justo tras el destello de salida.
    const entrada = suavizar(GUSANO.entradaDesde, GUSANO.entradaHasta, distancia)
    const apagado = 1 - suavizar(VIAJE.tunelFin, VIAJE.tunelFin + 0.015, progreso)
    const opacidad = entrada * apagado
    const destello =
      suavizar(VIAJE.tunelFin - GUSANO.destelloAntes, VIAJE.tunelFin, progreso) *
      (1 - suavizar(VIAJE.tunelFin, VIAJE.destelloFin, progreso))
    grupo.visible = opacidad > 0.002 || destello > 0.001
    if (!grupo.visible) {
      iniciado.current = false
      return
    }

    // Anclado a la cámara; la orientación del eje la sigue con retraso (paralaje).
    grupo.position.copy(camera.position)
    if (!iniciado.current) {
      grupo.quaternion.copy(camera.quaternion)
      iniciado.current = true
      lSuave.current = GUSANO.lInicio
      lPrevio.current = GUSANO.lInicio
    } else {
      grupo.quaternion.slerp(camera.quaternion, 1 - Math.exp(-paso * GUSANO.ritmoGiro))
    }

    if (!movimientoReducido) tiempo.current += paso
    const fraccion = limitar((progreso - VIAJE.caidaFin) / (VIAJE.tunelFin - VIAJE.caidaFin), 0, 1)
    const lObjetivo = GUSANO.lInicio + (GUSANO.lFin - GUSANO.lInicio) * fraccion
    lSuave.current += (lObjetivo - lSuave.current) * (1 - Math.exp(-paso * GUSANO.ritmoAvance))
    const balanceo = movimientoReducido ? 0 : GUSANO.balanceo * Math.sin(tiempo.current * GUSANO.balanceoRitmo)
    const l = lSuave.current + balanceo
    const deltaL = l - lPrevio.current
    lPrevio.current = l

    const u = recursos.uniformsGusano
    camera.updateMatrixWorld()
    u.uProyInversa.value.copy(camera.projectionMatrixInverse)
    u.uCamaraMundo.value.copy(camera.matrixWorld)
    inversa.current.copy(grupo.quaternion).invert()
    rotacion.current.makeRotationFromQuaternion(inversa.current)
    u.uMarcoInverso.value.setFromMatrix4(rotacion.current)
    u.uL.value = l
    u.uDeltaL.value = deltaL
    // Muestras del desenfoque según lo recorrido en el fotograma; `?gusanoMuestras=1` lo desactiva
    // en desarrollo (capturas de calibración sin estelas).
    const maximoMuestras = Math.round(ajuste('gusanoMuestras', 3))
    u.uMuestras.value = Math.min(maximoMuestras, 1 + Math.min(2, Math.floor(Math.abs(deltaL) / GUSANO.lPorMuestra)))
    u.uTiempo.value = tiempo.current
    u.uOpacidad.value = opacidad
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 45
    u.uAnguloPixel.value = THREE.MathUtils.degToRad(fov) / Math.max(size.height, 1)
    recursos.gusano.visible = opacidad > 0.002

    recursos.uniformsDestello.uDestello.value = destello * destello
    recursos.destello.visible = destello > 0.001
  })

  return (
    <group ref={ancla} visible={false}>
      <primitive object={recursos.gusano} />
      <primitive object={recursos.destello} />
    </group>
  )
}
