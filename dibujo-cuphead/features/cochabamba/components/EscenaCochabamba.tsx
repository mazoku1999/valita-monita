'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { CAMARA_AGUJERO } from '@/features/agujero-negro/constantes/parametrosAgujero'
import { CARRIL_VH, VIAJE } from '@/features/agujero-negro/constantes/viajeScroll'
import { interpolarMonotono } from '@/features/agujero-negro/utils/interpolarMonotono'
import { obtenerProgreso } from '@/features/narrativa/store/progresoScrollStore'
import { CAMARA_VALLE, CAMPO, CIUDAD, CORAZON, LAGUNA, RECORTE_VALLE, SOL_MANANA, direccionRumbo, direccionSol } from '../constantes/valle'
import { CABEZA_FRAG, CABEZA_VERT, HOJA_FRAG, HOJA_VERT, TALLO_FRAG, TALLO_VERT } from '../shaders/flores'
import { TERRENO_FRAG, TERRENO_VERT } from '../shaders/valle'
import { NIEBLA } from '@/features/dibujo/store/niebla'
import { RECORTE_ENTRADA, VALLE_EN_ESCENA } from '../store/valle'
import { crearQuadInstanciado, generarFlores } from '../utils/flores'
import { NUBE_ENTRADA_VALLE, nieblaEn } from '../utils/nubesDestino'
import { crearTerreno } from '../utils/terreno'
import { type UniformesValle, VidaDelValle } from './VidaDelValle'

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

/** Bolas de la nube de entrada (centro y radio) y la altura de su base, para la niebla. */
const BOLAS_ENTRADA = new Float32Array(NUBE_ENTRADA_VALLE.flatMap(([x, y, z, radio]) => [x, y, z, radio]))
const BASE_ENTRADA = NUBE_ENTRADA_VALLE[0][4]

/**
 * El valle de Cochabamba al final del viaje (ver `constantes/valle.ts`). Va dentro del marco del
 * agujero de gusano, como el sistema solar: "mover la cámara" es colocar el valle para que la
 * cámara lo vea desde la pose del recorrido. Toma el relevo de la Tierra dentro de la nube del
 * corazón (la cámara sale por su base) y mientras se ve la cámara usa planos de recorte de valle
 * (de 30 cm a 60 km).
 */
/** Las tres mallas de las flores: cabezas, tallos y hojas (ver `utils/flores.ts`). */
interface MallasFlores {
  cabezas: THREE.InstancedBufferGeometry
  tallos: THREE.InstancedBufferGeometry
  hojas: THREE.InstancedBufferGeometry
}

const crearMallasFlores = (): MallasFlores => {
  const datos = generarFlores()
  return {
    cabezas: crearQuadInstanciado({ aBase: [datos.cabezaBase, 4], aForma: [datos.cabezaForma, 4], aCara: [datos.cabezaCara, 2] }, datos.cabezas),
    tallos: crearQuadInstanciado({ aBase: [datos.talloBase, 4], aForma: [datos.talloForma, 3] }, datos.cabezas),
    hojas: crearQuadInstanciado({ aBase: [datos.hojaBase, 4], aForma: [datos.hojaForma, 4] }, datos.hojas),
  }
}

export function EscenaCochabamba() {
  const grupo = useRef<THREE.Group>(null)
  const [terreno, setTerreno] = useState<THREE.BufferGeometry | null>(null)
  const [flores, setFlores] = useState<MallasFlores | null>(null)
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

  // Uniformes de las flores (compartidos por sus tres mallas y por la vida del valle).
  const uniformesFlores = useMemo<UniformesValle>(
    () => ({
      uCamara: { value: new THREE.Vector3() },
      uSol: { value: new THREE.Vector3(...direccionSol(SOL_MANANA.rumbo, SOL_MANANA.elevacion)) },
      uTiempo: { value: 0 },
      uPixelesPorRadian: { value: 800 },
      uEscalaPantalla: { value: 1 },
    }),
    [],
  )
  const materialesFlores = useMemo(
    () => ({
      cabezas: new THREE.ShaderMaterial({ vertexShader: CABEZA_VERT, fragmentShader: CABEZA_FRAG, uniforms: uniformesFlores, side: THREE.DoubleSide }),
      tallos: new THREE.ShaderMaterial({ vertexShader: TALLO_VERT, fragmentShader: TALLO_FRAG, uniforms: uniformesFlores, side: THREE.DoubleSide }),
      hojas: new THREE.ShaderMaterial({ vertexShader: HOJA_VERT, fragmentShader: HOJA_FRAG, uniforms: uniformesFlores, side: THREE.DoubleSide }),
    }),
    [uniformesFlores],
  )

  // El relieve (unas decenas de miles de vértices) y las flores (decenas de miles de plantas) se
  // calculan después de cargar la página.
  useEffect(() => {
    const espera = window.setTimeout(() => setTerreno(crearTerreno()), 2500)
    const esperaFlores = window.setTimeout(() => setFlores(crearMallasFlores()), 3500)
    return () => {
      window.clearTimeout(espera)
      window.clearTimeout(esperaFlores)
    }
  }, [])

  useEffect(
    () => () => {
      material.dispose()
      materialesFlores.cabezas.dispose()
      materialesFlores.tallos.dispose()
      materialesFlores.hojas.dispose()
      VALLE_EN_ESCENA.dia = 0
    },
    [material, materialesFlores],
  )
  useEffect(() => () => terreno?.dispose(), [terreno])
  useEffect(
    () => () => {
      flores?.cabezas.dispose()
      flores?.tallos.dispose()
      flores?.hojas.dispose()
    },
    [flores],
  )

  useFrame(({ camera, clock, gl }) => {
    const nodo = grupo.current
    if (!nodo) return
    const progreso = obtenerProgreso()
    const visible = progreso >= VIAJE.valleInicio && terreno !== null
    nodo.visible = visible
    VALLE_EN_ESCENA.dia = visible ? 1 : 0
    if (!visible) NIEBLA.valle = 0

    // Planos de recorte: los del valle mientras se ve; si no, los del viaje por el espacio (con el
    // cercano que pida la bajada hacia la Tierra).
    if (camera instanceof THREE.PerspectiveCamera) {
      const cerca = visible ? RECORTE_VALLE.cerca : Math.min(CAMARA_AGUJERO.cerca, RECORTE_ENTRADA.cerca)
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
    // Dentro de la nube de entrada, niebla (el pase la pinta).
    NIEBLA.valle = nieblaEn(posicion, BOLAS_ENTRADA, (punto) => punto.y, BASE_ENTRADA, -220, 30)
    matriz.lookAt(posicion, mira, ARRIBA)
    orientacion.setFromRotationMatrix(matriz)
    inversa.copy(orientacion).invert()
    nodo.quaternion.copy(inversa)
    nodo.position.copy(posicion).applyQuaternion(inversa).multiplyScalar(-1)
    ;(material.uniforms.uCamara.value as THREE.Vector3).copy(posicion)
    uniformesFlores.uCamara.value.copy(posicion)
    uniformesFlores.uTiempo.value = clock.getElapsedTime()
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 45
    uniformesFlores.uPixelesPorRadian.value = gl.domElement.height / 2 / Math.tan(THREE.MathUtils.degToRad(fov) / 2)
    uniformesFlores.uEscalaPantalla.value = gl.domElement.height / 720

    // Para el cielo del pase: de las direcciones del mundo a las del valle, y el Sol en el valle.
    nodo.updateWorldMatrix(true, false)
    nodo.getWorldQuaternion(mundo).invert()
    VALLE_EN_ESCENA.rotacion.setFromMatrix4(rotacion.makeRotationFromQuaternion(mundo))
    VALLE_EN_ESCENA.sol.copy(material.uniforms.uSol.value as THREE.Vector3)
  })

  return (
    <group ref={grupo} visible={false}>
      {terreno && <mesh geometry={terreno} material={material} frustumCulled={false} />}
      {flores && (
        <>
          <mesh geometry={flores.tallos} material={materialesFlores.tallos} frustumCulled={false} />
          <mesh geometry={flores.hojas} material={materialesFlores.hojas} frustumCulled={false} />
          <mesh geometry={flores.cabezas} material={materialesFlores.cabezas} frustumCulled={false} />
        </>
      )}
      <VidaDelValle uniformes={uniformesFlores} />
    </group>
  )
}
