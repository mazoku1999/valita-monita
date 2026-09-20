'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { LENTE_GRAVITACIONAL_FRAG } from '../shaders/lenteGravitacional.frag'
import { LENTE_GRAVITACIONAL_VERT } from '../shaders/lenteGravitacional.vert'
import { VISTAS_CAMARA } from '../constantes/vistasCamara'
import { ajuste, obtenerVista } from '../store/vistaCamaraStore'
import { factorVistaCenital, mezclar, pesoAspecto, senoElevacion } from '../utils/elevacionCamara'

/**
 * Ganancia del gas de canto (6.5): el haz satura a crema en toda su longitud, como en la
 * referencia. Fuera del plano manda el `aspecto` de la vista activa (ver `constantes/vistasCamara.ts`),
 * mezclado por elevación.
 */
const GANANCIA_CANTO = 6.5

type UniformesLente = {
  uTiempo: THREE.IUniform<number>
  uProyInversa: THREE.IUniform<THREE.Matrix4>
  uCamaraMundo: THREE.IUniform<THREE.Matrix4>
  uVistaProyeccion: THREE.IUniform<THREE.Matrix4>
  uPosCamara: THREE.IUniform<THREE.Vector3>
  uBrillo: THREE.IUniform<number>
  uBrumaElevada: THREE.IUniform<number>
  uElevada: THREE.IUniform<number>
  uAtenuacionLejana: THREE.IUniform<number>
  uCenital: THREE.IUniform<number>
  uRadioGasFin: THREE.IUniform<number>
}

export function LenteGravitacionalQuad() {
  const { geometria, material, uniformes } = useMemo(() => {
    const uniformesIniciales: UniformesLente = {
      uTiempo: { value: 0 },
      uProyInversa: { value: new THREE.Matrix4() },
      uCamaraMundo: { value: new THREE.Matrix4() },
      uVistaProyeccion: { value: new THREE.Matrix4() },
      uPosCamara: { value: new THREE.Vector3() },
      uBrillo: { value: GANANCIA_CANTO },
      uBrumaElevada: { value: 0 },
      uElevada: { value: 0 },
      uAtenuacionLejana: { value: 1 },
      uCenital: { value: 0 },
      uRadioGasFin: { value: 10.2 },
    }
    const materialLente = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: LENTE_GRAVITACIONAL_VERT,
      fragmentShader: LENTE_GRAVITACIONAL_FRAG,
      uniforms: uniformesIniciales,
      depthWrite: true,
      depthTest: true,
    })
    return {
      geometria: new THREE.PlaneGeometry(2, 2),
      material: materialLente,
      uniformes: uniformesIniciales,
    }
  }, [])

  useEffect(() => {
    return () => {
      geometria.dispose()
      material.dispose()
    }
  }, [geometria, material])

  useFrame(({ camera, clock }) => {
    camera.updateMatrixWorld()
    uniformes.uTiempo.value = clock.getElapsedTime()
    uniformes.uProyInversa.value.copy(camera.projectionMatrixInverse)
    uniformes.uCamaraMundo.value.copy(camera.matrixWorld)
    uniformes.uVistaProyeccion.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    uniformes.uPosCamara.value.copy(camera.position)
    const seno = senoElevacion(camera.position)
    const vista = VISTAS_CAMARA[obtenerVista()]
    const t = pesoAspecto(seno, vista.pesoMinimoAspecto)
    const aspecto = vista.aspecto
    uniformes.uCenital.value = factorVistaCenital(seno)
    uniformes.uBrillo.value = ajuste('ganancia', mezclar(GANANCIA_CANTO, aspecto.ganancia, t))
    uniformes.uBrumaElevada.value = ajuste('bruma', aspecto.bruma) * t
    uniformes.uElevada.value = t
    uniformes.uAtenuacionLejana.value = ajuste('lejano', aspecto.luzArcos)
    uniformes.uRadioGasFin.value = aspecto.radioGas
  })

  return <mesh geometry={geometria} material={material} frustumCulled={false} renderOrder={-10} />
}
