'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { LENTE_GRAVITACIONAL_FRAG } from '../shaders/lenteGravitacional.frag'
import { LENTE_GRAVITACIONAL_VERT } from '../shaders/lenteGravitacional.vert'
import { obtenerProgreso } from '@/features/narrativa/store/progresoScrollStore'
import { ajuste } from '../store/vistaCamaraStore'
import { ASPECTO_CANTO, aspectoEnCamara } from '../utils/campoAspecto'

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
  uDobladillo: THREE.IUniform<number>
  uBrumaCercana: THREE.IUniform<number>
  uBrumaEscala: THREE.IUniform<number>
  uCorona: THREE.IUniform<number>
  uAnguloPixel: THREE.IUniform<number>
}

export function LenteGravitacionalQuad() {
  const { size } = useThree()
  const { geometria, material, uniformes } = useMemo(() => {
    const uniformesIniciales: UniformesLente = {
      uTiempo: { value: 0 },
      uProyInversa: { value: new THREE.Matrix4() },
      uCamaraMundo: { value: new THREE.Matrix4() },
      uVistaProyeccion: { value: new THREE.Matrix4() },
      uPosCamara: { value: new THREE.Vector3() },
      uBrillo: { value: ASPECTO_CANTO.ganancia },
      uBrumaElevada: { value: 0 },
      uElevada: { value: 0 },
      uAtenuacionLejana: { value: 1 },
      uCenital: { value: 0 },
      uRadioGasFin: { value: 10.2 },
      uDobladillo: { value: 1 },
      uBrumaCercana: { value: 0 },
      uBrumaEscala: { value: 1 },
      uCorona: { value: 1 },
      uAnguloPixel: { value: 0.001 },
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
    // El aspecto sale de la cámara real (ver `utils/campoAspecto.ts`): al orbitar o cambiar de
    // encuadre, bruma, corona, arcos y física fuera del plano se funden con el movimiento.
    const aspecto = aspectoEnCamara(camera, obtenerProgreso())
    uniformes.uCenital.value = aspecto.cenital
    uniformes.uBrillo.value = ajuste('ganancia', aspecto.ganancia)
    uniformes.uBrumaElevada.value = ajuste('bruma', aspecto.brumaElevada)
    uniformes.uElevada.value = aspecto.elevada
    uniformes.uAtenuacionLejana.value = ajuste('lejano', aspecto.luzArcos)
    uniformes.uRadioGasFin.value = aspecto.radioGas
    uniformes.uDobladillo.value = aspecto.dobladillo
    uniformes.uBrumaCercana.value = aspecto.brumaCercana
    uniformes.uBrumaEscala.value = aspecto.brumaEscala
    uniformes.uCorona.value = ajuste('corona', aspecto.corona)
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 40
    uniformes.uAnguloPixel.value = THREE.MathUtils.degToRad(fov) / Math.max(size.height, 1)
  })

  return <mesh geometry={geometria} material={material} frustumCulled={false} renderOrder={-10} />
}
