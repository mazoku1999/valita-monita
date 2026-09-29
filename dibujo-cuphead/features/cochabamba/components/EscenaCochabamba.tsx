'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { CAMARA_AGUJERO } from '@/features/agujero-negro/constantes/parametrosAgujero'
import { CARRIL_VH, VIAJE } from '@/features/agujero-negro/constantes/viajeScroll'
import { obtenerProgreso } from '@/features/narrativa/store/progresoScrollStore'
import { CAMARA_VALLE, CAMPO, CIUDAD, CORAZON, LAGUNA, RECORTE_VALLE, SOL_MANANA, direccionRumbo, direccionSol } from '../constantes/valle'
import { TERRENO_FRAG, TERRENO_VERT } from '../shaders/valle'
import { VALLE_EN_ESCENA } from '../store/valle'
import { crearTerreno } from '../utils/terreno'

/**
 * Interpolación cúbica monótona (Fritsch-Carlson) con pendiente nula en los extremos: pasa por los
 * puntos sin pasarse de ninguno ni detenerse en los intermedios.
 */
const interpolarMonotono = (x: number, xs: readonly number[], ys: readonly number[]): number => {
  const n = xs.length
  if (x <= xs[0]) return ys[0]
  if (x >= xs[n - 1]) return ys[n - 1]
  const pendientes = xs.map((_, i) => {
    if (i === 0 || i === n - 1) return 0
    const antes = (ys[i] - ys[i - 1]) / (xs[i] - xs[i - 1])
    const despues = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i])
    if (antes * despues <= 0) return 0
    return (2 * antes * despues) / (antes + despues)
  })
  let i = 0
  while (x > xs[i + 1]) i += 1
  const h = xs[i + 1] - xs[i]
  const t = (x - xs[i]) / h
  const t2 = t * t
  const t3 = t2 * t
  return (
    (2 * t3 - 3 * t2 + 1) * ys[i] +
    (t3 - 2 * t2 + t) * h * pendientes[i] +
    (-2 * t3 + 3 * t2) * ys[i + 1] +
    (t3 - t2) * h * pendientes[i + 1]
  )
}

/**
 * Recorrido de la cámara por el valle (`CAMARA_VALLE`): la distancia a la pose final se interpola
 * en escala logarítmica (de 3 km a unos centímetros, el acercamiento se ve a ritmo constante) y su
 * dirección con arcos entre las de las poses; el punto al que mira, componente a componente.
 */
const POSES = CAMARA_VALLE.map((pose) => ({
  progreso: pose.vh / CARRIL_VH,
  posicion: new THREE.Vector3(...pose.posicion),
  mira: new THREE.Vector3(...pose.mira),
}))
const FINAL = POSES[POSES.length - 1].posicion
const PROGRESOS = POSES.map((pose) => pose.progreso)
const LOG_DISTANCIAS = POSES.map((pose) => Math.log(Math.max(pose.posicion.distanceTo(FINAL), 0.02)))
const DIRECCIONES = POSES.map((pose, i) =>
  (i < POSES.length - 1 ? pose.posicion.clone().sub(FINAL) : POSES[i - 1].posicion.clone().sub(FINAL)).normalize(),
)
const MIRAS = [0, 1, 2].map((eje) => POSES.map((pose) => pose.mira.getComponent(eje)))

const poseEn = (progreso: number, posicion: THREE.Vector3, mira: THREE.Vector3): void => {
  let i = 0
  while (i < POSES.length - 2 && progreso > PROGRESOS[i + 1]) i += 1
  const t = Math.min(1, Math.max(0, (progreso - PROGRESOS[i]) / (PROGRESOS[i + 1] - PROGRESOS[i])))
  const s = t * t * (3 - 2 * t)
  posicion.copy(DIRECCIONES[i]).lerp(DIRECCIONES[i + 1], s).normalize()
  posicion.multiplyScalar(Math.exp(interpolarMonotono(progreso, PROGRESOS, LOG_DISTANCIAS))).add(FINAL)
  mira.set(
    interpolarMonotono(progreso, PROGRESOS, MIRAS[0]),
    interpolarMonotono(progreso, PROGRESOS, MIRAS[1]),
    interpolarMonotono(progreso, PROGRESOS, MIRAS[2]),
  )
}

const ARRIBA = new THREE.Vector3(0, 1, 0)

/**
 * El valle de Cochabamba al final del viaje (ver `constantes/valle.ts`). Va dentro del marco del
 * agujero de gusano, como el sistema solar: "mover la cámara" es colocar el valle para que la
 * cámara lo vea desde la pose del recorrido. Aparece bajo las nubes (`NubesDeEntrada`), cuando la
 * Tierra se va, y mientras se ve la cámara usa planos de recorte de valle (de 30 cm a 60 km).
 */
export function EscenaCochabamba() {
  const grupo = useRef<THREE.Group>(null)
  const [terreno, setTerreno] = useState<THREE.BufferGeometry | null>(null)
  const auxiliares = useRef({
    posicion: new THREE.Vector3(),
    mira: new THREE.Vector3(),
    matriz: new THREE.Matrix4(),
    orientacion: new THREE.Quaternion(),
    inversa: new THREE.Quaternion(),
    mundo: new THREE.Quaternion(),
    rotacion: new THREE.Matrix4(),
  })

  const material = useMemo(() => {
    const [ejeX, ejeZ] = direccionRumbo(CORAZON.rumbo)
    return new THREE.ShaderMaterial({
      vertexShader: TERRENO_VERT,
      fragmentShader: TERRENO_FRAG,
      uniforms: {
        uCamara: { value: new THREE.Vector3() },
        uSol: { value: new THREE.Vector3(...direccionSol(SOL_MANANA.rumbo, SOL_MANANA.elevacion)) },
        uCorazon: { value: new THREE.Vector4(CORAZON.escala, ejeX, ejeZ, CORAZON.ribete) },
        uCampo: { value: CAMPO.semiLado },
        uCiudad: { value: new THREE.Vector3(CIUDAD.centro[0], CIUDAD.centro[1], CIUDAD.radio) },
        uLaguna: { value: new THREE.Vector4(LAGUNA.centro[0], LAGUNA.centro[1], LAGUNA.semiejes[0], LAGUNA.semiejes[1]) },
      },
      side: THREE.DoubleSide,
    })
  }, [])

  // El relieve (unas decenas de miles de vértices) se calcula después de cargar la página.
  useEffect(() => {
    const espera = window.setTimeout(() => setTerreno(crearTerreno()), 2500)
    return () => window.clearTimeout(espera)
  }, [])

  useEffect(
    () => () => {
      material.dispose()
      VALLE_EN_ESCENA.dia = 0
    },
    [material],
  )
  useEffect(() => () => terreno?.dispose(), [terreno])

  useFrame(({ camera }) => {
    const nodo = grupo.current
    if (!nodo) return
    const progreso = obtenerProgreso()
    const visible = progreso >= VIAJE.valleInicio && terreno !== null
    nodo.visible = visible
    VALLE_EN_ESCENA.dia = visible ? 1 : 0

    // Planos de recorte: los del valle mientras se ve, los del viaje por el espacio si no.
    if (camera instanceof THREE.PerspectiveCamera) {
      const cerca = visible ? RECORTE_VALLE.cerca : CAMARA_AGUJERO.cerca
      const lejos = visible ? RECORTE_VALLE.lejos : CAMARA_AGUJERO.lejos
      if (camera.near !== cerca || camera.far !== lejos) {
        camera.near = cerca
        camera.far = lejos
        camera.updateProjectionMatrix()
      }
    }
    if (!visible) return

    const { posicion, mira, matriz, orientacion, inversa, mundo, rotacion } = auxiliares.current
    poseEn(progreso, posicion, mira)
    matriz.lookAt(posicion, mira, ARRIBA)
    orientacion.setFromRotationMatrix(matriz)
    inversa.copy(orientacion).invert()
    nodo.quaternion.copy(inversa)
    nodo.position.copy(posicion).applyQuaternion(inversa).multiplyScalar(-1)
    ;(material.uniforms.uCamara.value as THREE.Vector3).copy(posicion)

    // Para el cielo del pase: de las direcciones del mundo a las del valle, y el Sol en el valle.
    nodo.updateWorldMatrix(true, false)
    nodo.getWorldQuaternion(mundo).invert()
    VALLE_EN_ESCENA.rotacion.setFromMatrix4(rotacion.makeRotationFromQuaternion(mundo))
    VALLE_EN_ESCENA.sol.copy(material.uniforms.uSol.value as THREE.Vector3)
  })

  return (
    <group ref={grupo} visible={false}>
      {terreno && <mesh geometry={terreno} material={material} frustumCulled={false} />}
    </group>
  )
}
