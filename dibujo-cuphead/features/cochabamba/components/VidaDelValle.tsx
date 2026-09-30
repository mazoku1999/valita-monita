'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { NUBE_BOLA_FRAG, NUBE_BOLA_VERT } from '../shaders/nubesBolas'
import { ARBOL_FRAG, ARBOL_VERT, MARIPOSA_FRAG, MARIPOSA_VERT, NUBE_VALLE_FRAG, NUBE_VALLE_VERT, PETALO_FRAG, PETALO_VERT } from '../shaders/vida'
import { PASEO } from '../store/paseo'
import { crearQuadInstanciado } from '../utils/flores'
import { crearBolasInstanciadas, generarCumulos, nubesEnValle } from '../utils/nubesDestino'
import { CAJA_PETALOS, MARCO_FINAL, crearAlasInstanciadas, generarVida } from '../utils/vida'

/** Uniformes que comparte con las flores (los actualiza `EscenaCochabamba` en cada fotograma). */
export interface UniformesValle {
  uCamara: { value: THREE.Vector3 }
  uSol: { value: THREE.Vector3 }
  uTiempo: { value: number }
  uPixelesPorRadian: { value: number }
  /** Alto del lienzo en píxeles de dispositivo sobre 720 (para medir en píxeles de referencia). */
  uEscalaPantalla: { value: number }
  [nombre: string]: THREE.IUniform
}

interface MallasVida {
  mariposas: THREE.InstancedBufferGeometry
  petalos: THREE.InstancedBufferGeometry
  nubes: THREE.InstancedBufferGeometry
  arboles: THREE.InstancedBufferGeometry
  nubesEntrada: THREE.InstancedBufferGeometry
}

const crearMallasVida = (): MallasVida => {
  const datos = generarVida()
  return {
    mariposas: crearAlasInstanciadas(datos.mariposaAncla, datos.mariposaAzar, datos.mariposas),
    petalos: crearQuadInstanciado({ aAzar: [datos.petaloAzar, 4], aAzar2: [datos.petaloAzar2, 4] }, datos.petalos),
    nubes: crearQuadInstanciado({ aCentro: [datos.nubeCentro, 4], aAzar: [datos.nubeAzar, 4] }, datos.nubes),
    arboles: crearQuadInstanciado({ aBase: [datos.arbolBase, 4], aAzar: [datos.arbolAzar, 4] }, datos.arboles),
    nubesEntrada: crearBolasInstanciadas(nubesEnValle(generarCumulos())),
  }
}

/**
 * La vida del valle al final del viaje (ver `utils/vida.ts`): eucaliptos, nubes de la mañana,
 * mariposas y pétalos al viento, y las nubes de bolas de la llegada (ver `utils/nubesDestino.ts`).
 * Va dentro del grupo del valle, en sus coordenadas.
 */
export function VidaDelValle({ uniformes }: { uniformes: UniformesValle }) {
  const [mallas, setMallas] = useState<MallasVida | null>(null)

  const materiales = useMemo(() => {
    const { posicion, adelante, derecha } = MARCO_FINAL
    return {
      // Mariposas y pétalos, sin profundidad: el pase no los toma por siluetas contra el cielo (les
      // ponía un aro negro; una mariposa de canto parecía un pájaro).
      mariposas: new THREE.ShaderMaterial({ vertexShader: MARIPOSA_VERT, fragmentShader: MARIPOSA_FRAG, uniforms: uniformes, side: THREE.DoubleSide, depthWrite: false }),
      petalos: new THREE.ShaderMaterial({
        vertexShader: PETALO_VERT,
        fragmentShader: PETALO_FRAG,
        uniforms: {
          ...uniformes,
          uCajaOrigen: { value: new THREE.Vector3(posicion[0], 0, posicion[2]) },
          uCajaMarco: { value: new THREE.Vector4(adelante[0], adelante[1], derecha[0], derecha[1]) },
          uCajaDesde: { value: new THREE.Vector3(...CAJA_PETALOS.desde) },
          uCajaLado: { value: new THREE.Vector3(...CAJA_PETALOS.lado) },
          uViento: { value: new THREE.Vector3(...CAJA_PETALOS.viento) },
          uCajaPaseo: { value: new THREE.Vector3() },
        },
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      nubes: new THREE.ShaderMaterial({ vertexShader: NUBE_VALLE_VERT, fragmentShader: NUBE_VALLE_FRAG, uniforms: uniformes, side: THREE.DoubleSide }),
      arboles: new THREE.ShaderMaterial({ vertexShader: ARBOL_VERT, fragmentShader: ARBOL_FRAG, uniforms: uniformes, side: THREE.DoubleSide }),
      // La nube de entrada (la base de la del corazón) y cúmulos junto al camino: bolas en el
      // espacio, con la bruma del valle.
      nubesEntrada: new THREE.ShaderMaterial({
        vertexShader: NUBE_BOLA_VERT,
        fragmentShader: NUBE_BOLA_FRAG,
        uniforms: { ...uniformes, uEscalaVista: { value: 1 }, uBruma: { value: new THREE.Vector2(17000, 0.9) }, uCrecer: { value: 1 } },
        side: THREE.DoubleSide,
      }),
    }
  }, [uniformes])

  // Los pétalos al viento acompañan a quien pasea por el corazón (ver `store/paseo.ts`): el
  // desplazamiento, en el marco de su caja.
  useFrame(() => {
    const { adelante, derecha } = MARCO_FINAL
    ;(materiales.petalos.uniforms.uCajaPaseo.value as THREE.Vector3).set(
      PASEO.x * derecha[0] + PASEO.z * derecha[1],
      0,
      PASEO.x * adelante[0] + PASEO.z * adelante[1],
    )
  })

  useEffect(() => {
    const espera = window.setTimeout(() => setMallas(crearMallasVida()), 4200)
    return () => window.clearTimeout(espera)
  }, [])
  useEffect(
    () => () => {
      for (const material of Object.values(materiales)) material.dispose()
    },
    [materiales],
  )
  useEffect(
    () => () => {
      if (mallas) for (const geometria of Object.values(mallas)) geometria.dispose()
    },
    [mallas],
  )

  if (!mallas) return null
  return (
    <>
      <mesh geometry={mallas.arboles} material={materiales.arboles} frustumCulled={false} />
      <mesh geometry={mallas.nubesEntrada} material={materiales.nubesEntrada} frustumCulled={false} />
      {/* Después del suelo, en su orden (las del cielo comparten profundidad). */}
      <mesh geometry={mallas.nubes} material={materiales.nubes} frustumCulled={false} renderOrder={1} />
      <mesh geometry={mallas.mariposas} material={materiales.mariposas} frustumCulled={false} renderOrder={2} />
      <mesh geometry={mallas.petalos} material={materiales.petalos} frustumCulled={false} renderOrder={2} />
    </>
  )
}
