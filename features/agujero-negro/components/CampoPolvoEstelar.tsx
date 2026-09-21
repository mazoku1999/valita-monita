'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { obtenerProgreso } from '@/features/narrativa/store/progresoScrollStore'
import { PARAMETROS_AGUJERO } from '../constantes/parametrosAgujero'
import { POLVO_ESTELAR_FRAG, POLVO_ESTELAR_VERT } from '../shaders/polvoEstelar'
import { ajuste } from '../store/vistaCamaraStore'
import { aspectoEnCamara } from '../utils/campoAspecto'
import { generarPolvoEstelar } from '../utils/generarPolvoEstelar'
import { MUNDO } from './LenteGravitacionalQuad'

/**
 * Exposición del polvo a la distancia de referencia (0.9 a 38 unidades, la calibración de canto).
 * Más cerca, el flujo de cada grano crece con el cuadrado de la distancia (0.9·(38/D)²: la ley
 * que seguían las exposiciones por vista, 3.5 a 19.5). Más lejos la ley se suaviza a (38/D)^0.45:
 * con 1/d² la banda de chispas se apagaba de lejos (0.06 sRGB a 10 R a 105 unidades) mientras que
 * en la captura lejana 32 del usuario sigue a 0.3 hasta ±15 R; una banda extensa vista de lejos
 * conserva su brillo superficial, y con granos subpíxel y bloom umbralizado la ley pura no lo hace.
 */
const EXPOSICION_REFERENCIA = 0.9
const DISTANCIA_REFERENCIA = 38
const EXPONENTE_CERCA = 2
const EXPONENTE_LEJOS = 0.45

type UniformesPolvo = {
  uTiempo: THREE.IUniform<number>
  uEscalaPuntos: THREE.IUniform<number>
  uPixelRatio: THREE.IUniform<number>
  uFoco: THREE.IUniform<number>
  uApertura: THREE.IUniform<number>
  uBrilloPolvo: THREE.IUniform<number>
  uRadioSombra: THREE.IUniform<number>
  uTamMax: THREE.IUniform<number>
  uNiebla: THREE.IUniform<number>
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
      uBrilloPolvo: { value: EXPOSICION_REFERENCIA },
      uRadioSombra: { value: PARAMETROS_AGUJERO.radioSombra },
      uTamMax: { value: 30 },
      uNiebla: { value: MUNDO.niebla },
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
    const distancia = camera.position.length()
    uniformes.uFoco.value = distancia
    const aspecto = aspectoEnCamara(camera, obtenerProgreso())
    const relacion = DISTANCIA_REFERENCIA / Math.max(distancia, 1)
    const exponente = relacion > 1 ? EXPONENTE_CERCA : ajuste('polvoExponente', EXPONENTE_LEJOS)
    uniformes.uBrilloPolvo.value = ajuste('polvoExposicion', EXPOSICION_REFERENCIA) * Math.pow(relacion, exponente)
    uniformes.uApertura.value = 6 * escalaVista * aspecto.apertura
    uniformes.uTamMax.value = aspecto.tamanoMaximo * gl.getPixelRatio()
    uniformes.uNiebla.value = ajuste('niebla', MUNDO.niebla)
  })

  return <points geometry={geometria} material={material} frustumCulled={false} />
}
