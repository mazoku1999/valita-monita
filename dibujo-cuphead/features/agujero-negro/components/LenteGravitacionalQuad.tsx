'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { latido, tocaDibujar } from '@/features/dibujo/store/ritmoDibujo'
import { obtenerProgreso } from '@/features/narrativa/store/progresoScrollStore'
import { LENTE_CARICATURA_FRAG } from '../shaders/lenteCaricatura.frag'
import { LENTE_GRAVITACIONAL_VERT } from '../shaders/lenteGravitacional.vert'
import { PANTALLA_GAS_FRAG, PANTALLA_GAS_VERT } from '../shaders/pantallaGas'
import { refBufferGas } from '../store/mallaGas'
import { gBordeSombra, observadorEnCamara, tiempoVisto } from '../utils/observadorCaida'

type UniformesLente = {
  uTiempo: THREE.IUniform<number>
  uProyInversa: THREE.IUniform<THREE.Matrix4>
  uCamaraMundo: THREE.IUniform<THREE.Matrix4>
  uVistaProyeccion: THREE.IUniform<THREE.Matrix4>
  uPosCamara: THREE.IUniform<THREE.Vector3>
  uAnguloPixel: THREE.IUniform<number>
  uObservador: THREE.IUniform<THREE.Vector2>
  uLatido: THREE.IUniform<number>
}

/**
 * El agujero de caricatura (lente gravitacional, disco, anillo de fotones y sombra) se traza UNA
 * vez por dibujo en un buffer propio, con su color y qué objeto hay en cada píxel. Una malla de
 * pantalla barata escribe su profundidad en la escena (lo que queda detrás del agujero sigue
 * oculto) y el pase de dibujo (`features/dibujo/utils/PasoDibujo.ts`) lo compone y lo entinta.
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
      uAnguloPixel: { value: 0.001 },
      uObservador: { value: new THREE.Vector2(1, 0) },
      uLatido: { value: 0 },
    }
    const geometria = new THREE.PlaneGeometry(2, 2)
    const materialLente = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: LENTE_GRAVITACIONAL_VERT,
      // El agujero dibujado como un dibujo animado (misma física de la lente, ver el shader).
      fragmentShader: LENTE_CARICATURA_FRAG,
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
      // [0] color de caricatura (lineal, A = cobertura), [1] qué hay en cada píxel (objeto, banda, cara).
      count: 2,
    })
    // Malla de pantalla que sólo escribe la PROFUNDIDAD del agujero en la escena: lo que queda
    // detrás sigue oculto, y su color lo compone el pase de dibujo.
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
    // Dibujo animado: entre dibujo y dibujo la pantalla no cambia, así que el gas no se traza. Dentro
    // del horizonte (el agujero de gusano, el sistema solar, el valle) el pase no lo usa: tampoco.
    if (!tocaDibujar() || camera.position.length() < 0.9) return
    const { uniformes, buffer, escenaGas, camaraGas } = recursos
    const dpr = gl.getPixelRatio()
    const ancho = Math.max(2, Math.round(size.width * dpr))
    const alto = Math.max(2, Math.round(size.height * dpr))
    if (buffer.width !== ancho || buffer.height !== alto) buffer.setSize(ancho, alto)

    camera.updateMatrixWorld()
    uniformes.uProyInversa.value.copy(camera.projectionMatrixInverse)
    uniformes.uCamaraMundo.value.copy(camera.matrixWorld)
    uniformes.uVistaProyeccion.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    uniformes.uPosCamara.value.copy(camera.position)
    const distancia = camera.position.length()
    const observador = observadorEnCamara(distancia, obtenerProgreso())
    uniformes.uObservador.value.set(observador.energia, observador.caida)
    // En la caída el disco se ve girar más deprisa (la luz llega comprimida en el tiempo).
    const gReferencia = observador.caida > 0 ? gBordeSombra(observador, distancia) : 1
    uniformes.uTiempo.value = tiempoVisto(clock.getElapsedTime(), gReferencia)
    uniformes.uLatido.value = latido(clock.getElapsedTime())
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 40
    uniformes.uAnguloPixel.value = THREE.MathUtils.degToRad(fov) / Math.max(size.height, 1)
    // Dentro del horizonte el agujero ya no es una superficie delante de la cámara (todo se
    // captura en el primer paso): no se escribe su profundidad.
    recursos.mallaPantalla.visible = distancia > 1.05

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
