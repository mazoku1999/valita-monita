'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { PARAMETROS_AGUJERO } from '../constantes/parametrosAgujero'
import { obtenerProgreso } from '@/features/narrativa/store/progresoScrollStore'
import { POLVO_ESTELAR_FRAG, POLVO_ESTELAR_VERT } from '../shaders/polvoEstelar'
import { ajuste } from '../store/vistaCamaraStore'
import { ASPECTO_CANTO, aspectoEnCamara } from '../utils/campoAspecto'
import { generarPolvoEstelar } from '../utils/generarPolvoEstelar'

/**
 * Ganancia del polvo de canto (0.9): conserva el perfil del haz calibrado. Fuera del plano manda
 * el `aspecto` de cada vista, interpolado por la cámara real (ver `utils/campoAspecto.ts`).
 */
const EXPOSICION_CANTO = ASPECTO_CANTO.polvoExposicion

type UniformesPolvo = {
  uTiempo: THREE.IUniform<number>
  uEscalaPuntos: THREE.IUniform<number>
  uPixelRatio: THREE.IUniform<number>
  uFoco: THREE.IUniform<number>
  uApertura: THREE.IUniform<number>
  uBrilloPolvo: THREE.IUniform<number>
  uRadioSombra: THREE.IUniform<number>
  uElevada: THREE.IUniform<number>
  uCenital: THREE.IUniform<number>
  uPolvoLejano: THREE.IUniform<number>
  uTamMax: THREE.IUniform<number>
  uDobladillo: THREE.IUniform<number>
}

export function CampoPolvoEstelar() {
  const { gl, size } = useThree()

  const { geometria, material, uniformes } = useMemo(() => {
    const datos = generarPolvoEstelar()
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(datos.posiciones, 3))
    geo.setAttribute('aTamano', new THREE.BufferAttribute(datos.tamanos, 1))
    geo.setAttribute('aTono', new THREE.BufferAttribute(datos.tonos, 1))
    geo.setAttribute('aBrillo', new THREE.BufferAttribute(datos.brillos, 1))
    geo.setAttribute('aFase', new THREE.BufferAttribute(datos.fases, 1))
    geo.setAttribute('aOrbita', new THREE.BufferAttribute(datos.orbitas, 1))

    const uniformesIniciales: UniformesPolvo = {
      uTiempo: { value: 0 },
      uEscalaPuntos: { value: 60 },
      uPixelRatio: { value: 1 },
      uFoco: { value: 60 },
      uApertura: { value: 16 },
      // Con un 30 % más de granos que antes, la ganancia baja para conservar el perfil del haz
      // calibrado (±250 px ≈ 84, ±300 px ≈ 50 sRGB).
      uBrilloPolvo: { value: EXPOSICION_CANTO },
      uRadioSombra: { value: PARAMETROS_AGUJERO.radioSombra },
      uElevada: { value: 0 },
      uCenital: { value: 0 },
      uPolvoLejano: { value: 0.5 },
      uTamMax: { value: 30 },
      uDobladillo: { value: 1 },
    }

    const mat = new THREE.ShaderMaterial({
      vertexShader: POLVO_ESTELAR_VERT,
      fragmentShader: POLVO_ESTELAR_FRAG,
      uniforms: uniformesIniciales,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    })

    return { geometria: geo, material: mat, uniformes: uniformesIniciales }
  }, [])

  useEffect(() => {
    return () => {
      geometria.dispose()
      material.dispose()
    }
  }, [geometria, material])

  useFrame(({ clock, camera }) => {
    const escalaVista = size.height / 900
    uniformes.uTiempo.value = clock.getElapsedTime()
    uniformes.uPixelRatio.value = gl.getPixelRatio()
    // Escala base de los granos: más fina que la original (50) para que el campo se lea como
    // chispas y no como motas.
    uniformes.uEscalaPuntos.value = 40 * escalaVista
    // El plano de enfoque sigue al agujero: lo que la cámara atraviesa se desenfoca en bokeh.
    uniformes.uFoco.value = camera.position.length()
    const aspecto = aspectoEnCamara(camera, obtenerProgreso())
    uniformes.uElevada.value = aspecto.elevada
    uniformes.uCenital.value = aspecto.cenital
    uniformes.uBrilloPolvo.value = ajuste('polvoExposicion', aspecto.polvoExposicion)
    uniformes.uPolvoLejano.value = aspecto.polvoLejano
    uniformes.uApertura.value = 6 * escalaVista * aspecto.apertura
    uniformes.uTamMax.value = aspecto.tamanoMaximo * gl.getPixelRatio()
    uniformes.uDobladillo.value = aspecto.dobladillo
  })

  return <points geometry={geometria} material={material} frustumCulled={false} />
}
