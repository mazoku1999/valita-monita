'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { VIAJE } from '@/features/agujero-negro/constantes/viajeScroll'
import { obtenerProgreso } from '@/features/narrativa/store/progresoScrollStore'
import { NUBES_FRAG, NUBES_VERT } from '../shaders/valle'

/**
 * El paso por las nubes al entrar en la Tierra (ver `NUBES_FRAG`): una capa de pantalla completa
 * que se dibuja encima de todo mientras la cámara baja hacia Cochabamba. Tapa la pantalla entera
 * justo cuando la Tierra da paso al valle (`VIAJE.nubesPleno`) y después se abre sobre él.
 */
export function NubesDeEntrada() {
  const { size } = useThree()
  const malla = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: NUBES_VERT,
      fragmentShader: NUBES_FRAG,
      uniforms: {
        uAvance: { value: 0 },
        uAspecto: { value: 1 },
        uTiempo: { value: 0 },
        uCercaLejos: { value: new THREE.Vector2(0.1, 1400) },
      },
      // Encima de todo y sustituyendo el color y la marca de caricatura; su profundidad (por capa)
      // es la que ve el pase para entintar los bordes.
      transparent: true,
      depthTest: false,
      depthWrite: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.ZeroFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.ZeroFactor,
    })
    const nubes = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
    nubes.frustumCulled = false
    nubes.renderOrder = 50
    nubes.visible = false
    return nubes
  }, [])

  useEffect(
    () => () => {
      malla.geometry.dispose()
      ;(malla.material as THREE.ShaderMaterial).dispose()
    },
    [malla],
  )

  useFrame(({ camera, clock }) => {
    const progreso = obtenerProgreso()
    const avance = (progreso - VIAJE.nubesInicio) / (VIAJE.nubesFin - VIAJE.nubesInicio)
    malla.visible = avance > 0 && avance < 1
    if (!malla.visible) return
    const u = (malla.material as THREE.ShaderMaterial).uniforms
    u.uAvance.value = avance
    u.uAspecto.value = size.width / Math.max(size.height, 1)
    u.uTiempo.value = clock.getElapsedTime()
    if (camera instanceof THREE.PerspectiveCamera) (u.uCercaLejos.value as THREE.Vector2).set(camera.near, camera.far)
  })

  return <primitive object={malla} />
}
