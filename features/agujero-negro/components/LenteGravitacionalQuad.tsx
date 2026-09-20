'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { LENTE_GRAVITACIONAL_FRAG } from '../shaders/lenteGravitacional.frag'
import { LENTE_GRAVITACIONAL_VERT } from '../shaders/lenteGravitacional.vert'
import { PANTALLA_GAS_FRAG, PANTALLA_GAS_VERT } from '../shaders/pantallaGas'
import { refBufferGas } from '../store/mallaGas'
import { ajuste } from '../store/vistaCamaraStore'

/** Ganancia del gas, la misma para todas las vistas. */
const GANANCIA = 3.6

type UniformesLente = {
  uTiempo: THREE.IUniform<number>
  uProyInversa: THREE.IUniform<THREE.Matrix4>
  uCamaraMundo: THREE.IUniform<THREE.Matrix4>
  uVistaProyeccion: THREE.IUniform<THREE.Matrix4>
  uPosCamara: THREE.IUniform<THREE.Vector3>
  uBrillo: THREE.IUniform<number>
}

/**
 * El gas (lente gravitacional, disco, anillo de fotones y bruma) se traza UNA vez por fotograma
 * en un buffer HDR propio. Una malla de pantalla barata escribe su profundidad en la escena
 * (las chispas del polvo siguen quedando detrás del gas) y el efecto de posproceso del gas
 * (`utils/efectoGas.ts`) compone el color y le aplica su propio bloom ancho.
 */
export function LenteGravitacionalQuad() {
  const { gl, size } = useThree()

  const recursos = useMemo(() => {
    const uniformes: UniformesLente = {
      uTiempo: { value: 0 },
      uProyInversa: { value: new THREE.Matrix4() },
      uCamaraMundo: { value: new THREE.Matrix4() },
      uVistaProyeccion: { value: new THREE.Matrix4() },
      uPosCamara: { value: new THREE.Vector3() },
      uBrillo: { value: GANANCIA },
    }
    const geometria = new THREE.PlaneGeometry(2, 2)
    const materialLente = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: LENTE_GRAVITACIONAL_VERT,
      fragmentShader: LENTE_GRAVITACIONAL_FRAG,
      uniforms: uniformes,
      depthWrite: true,
      depthTest: true,
    })
    const mallaLente = new THREE.Mesh(geometria, materialLente)
    mallaLente.frustumCulled = false
    const escenaGas = new THREE.Scene()
    escenaGas.add(mallaLente)
    const camaraGas = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    const profundidad = new THREE.DepthTexture(2, 2)
    const buffer = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: true,
      depthTexture: profundidad,
    })
    // Malla de pantalla que sólo escribe la PROFUNDIDAD del gas en la escena: las chispas del
    // polvo que quedan detrás del gas siguen ocultas, y el color del gas lo compone el efecto de
    // posproceso (`utils/efectoGas.ts`) después del bloom de las chispas.
    const materialPantalla = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: PANTALLA_GAS_VERT,
      fragmentShader: PANTALLA_GAS_FRAG,
      uniforms: { uColor: { value: buffer.texture }, uProfundidad: { value: profundidad } },
      depthWrite: true,
      depthTest: true,
      colorWrite: false,
    })
    const mallaPantalla = new THREE.Mesh(geometria, materialPantalla)
    mallaPantalla.frustumCulled = false
    mallaPantalla.renderOrder = -10
    refBufferGas.current = buffer

    return { uniformes, geometria, materialLente, escenaGas, camaraGas, buffer, profundidad, materialPantalla, mallaPantalla }
  }, [])

  useEffect(() => {
    refBufferGas.current = recursos.buffer
    return () => {
      if (refBufferGas.current === recursos.buffer) refBufferGas.current = null
      recursos.buffer.dispose()
      recursos.profundidad.dispose()
      recursos.materialPantalla.dispose()
      recursos.materialLente.dispose()
      recursos.geometria.dispose()
    }
  }, [recursos])

  // Prioridad 0: se ejecuta antes de que el compositor de efectos (prioridad 1) dibuje la escena.
  useFrame(({ camera, clock }) => {
    const { uniformes, buffer, escenaGas, camaraGas } = recursos
    const dpr = gl.getPixelRatio()
    const ancho = Math.max(2, Math.round(size.width * dpr))
    const alto = Math.max(2, Math.round(size.height * dpr))
    if (buffer.width !== ancho || buffer.height !== alto) buffer.setSize(ancho, alto)

    camera.updateMatrixWorld()
    uniformes.uTiempo.value = clock.getElapsedTime()
    uniformes.uProyInversa.value.copy(camera.projectionMatrixInverse)
    uniformes.uCamaraMundo.value.copy(camera.matrixWorld)
    uniformes.uVistaProyeccion.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    uniformes.uPosCamara.value.copy(camera.position)
    // Ganancia única (3.6): antes 6.5 de canto y de 3.6 a 6.5 por vista. Con el factor Doppler
    // real y KAPPA 2.4 el haz de canto satura igual, la cara cercana a 12° queda en crema y el
    // disco de frente en oro sin bajar nada por vista. (Ajustables desde la URL en desarrollo.)
    uniformes.uBrillo.value = ajuste('ganancia', GANANCIA)

    const objetivoPrevio = gl.getRenderTarget()
    const limpiezaPrevia = gl.autoClear
    gl.autoClear = true
    gl.setRenderTarget(buffer)
    gl.clear(true, true, false)
    gl.render(escenaGas, camaraGas)
    gl.setRenderTarget(objetivoPrevio)
    gl.autoClear = limpiezaPrevia
  }, 0)

  return <primitive object={recursos.mallaPantalla} />
}
