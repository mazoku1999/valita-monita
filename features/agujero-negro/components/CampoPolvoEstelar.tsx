'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { PARAMETROS_AGUJERO } from '../constantes/parametrosAgujero'
import { POLVO_ESTELAR_FRAG, POLVO_ESTELAR_VERT } from '../shaders/polvoEstelar'
import { ajuste } from '../store/vistaCamaraStore'
import { generarPolvoEstelar } from '../utils/generarPolvoEstelar'

/**
 * Exposición única del polvo. Cada grano emite la energía de su tamaño real en pantalla (ley
 * 1/d²), así que una sola exposición vale para todas las distancias; antes hacía falta una por
 * vista (0.9 a 38 unidades, 3.5 a 19.5, 0.5 a 60) porque los granos subpíxel tenían un suelo
 * de energía de 1 px.
 */
const EXPOSICION_POLVO = 4.5
/** Factor de apertura de la profundidad de campo (1 = la original) y tamaño máximo de grano (px·dpr). */
const APERTURA_POLVO = 0.7
const TAMANO_MAXIMO_POLVO = 20

type UniformesPolvo = {
  uTiempo: THREE.IUniform<number>
  uEscalaPuntos: THREE.IUniform<number>
  uPixelRatio: THREE.IUniform<number>
  uFoco: THREE.IUniform<number>
  uApertura: THREE.IUniform<number>
  uBrilloPolvo: THREE.IUniform<number>
  uRadioSombra: THREE.IUniform<number>
  uTamMax: THREE.IUniform<number>
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
      uBrilloPolvo: { value: EXPOSICION_POLVO },
      uRadioSombra: { value: PARAMETROS_AGUJERO.radioSombra },
      uTamMax: { value: TAMANO_MAXIMO_POLVO },
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
    uniformes.uBrilloPolvo.value = ajuste('polvoExposicion', EXPOSICION_POLVO)
    uniformes.uApertura.value = 6 * escalaVista * APERTURA_POLVO
    uniformes.uTamMax.value = TAMANO_MAXIMO_POLVO * gl.getPixelRatio()
  })

  return <points geometry={geometria} material={material} frustumCulled={false} />
}
