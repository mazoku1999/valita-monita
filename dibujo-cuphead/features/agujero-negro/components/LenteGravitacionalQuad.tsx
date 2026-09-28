'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { tocaDibujar } from '@/features/dibujo/store/ritmoDibujo'
import { obtenerProgreso } from '@/features/narrativa/store/progresoScrollStore'
import { LENTE_GRAVITACIONAL_FRAG } from '../shaders/lenteGravitacional.frag'
import { LENTE_GRAVITACIONAL_VERT } from '../shaders/lenteGravitacional.vert'
import { PANTALLA_GAS_FRAG, PANTALLA_GAS_VERT } from '../shaders/pantallaGas'
import { refBufferGas } from '../store/mallaGas'
import { ajuste } from '../store/vistaCamaraStore'
import { suavizar } from '../utils/aleatorio'
import { ASPECTO_CANTO, aspectoEnCamara } from '../utils/campoAspecto'
import { exposicionZambullida, gBordeSombra, observadorEnCamara, tiempoVisto } from '../utils/observadorCaida'

/**
 * Constantes del mundo (las mismas desde cualquier ángulo y distancia; ajustables desde la URL
 * sólo en desarrollo para calibrar): opacidad y brillo de la niebla interior y amplitud del
 * anillo de fotones. Ver el shader de la lente.
 */
export const MUNDO = { niebla: 6.0, nieblaLuz: 0.026, anillo: 0.85 } as const

/**
 * La niebla interior es lo que se ve desde lejos a través de columnas largas de gas tenue junto
 * al agujero: de cerca ese gas es transparente. En la caída (la cámara por dentro de 13 unidades,
 * donde no llega ningún encuadre: el zoom libre para ahí) se disipa hasta desaparecer a 3.5, y la
 * sombra, el anillo y el disco se ven a pelo en vez de a través de una bruma parda.
 */
export const factorNieblaCercana = (distancia: number): number =>
  ajuste('nieblaCaida', 1) > 0.5 ? suavizar(3.5, 13, distancia) : 1

type UniformesLente = {
  uTiempo: THREE.IUniform<number>
  uProyInversa: THREE.IUniform<THREE.Matrix4>
  uCamaraMundo: THREE.IUniform<THREE.Matrix4>
  uVistaProyeccion: THREE.IUniform<THREE.Matrix4>
  uPosCamara: THREE.IUniform<THREE.Vector3>
  uBrillo: THREE.IUniform<number>
  uNiebla: THREE.IUniform<number>
  uNieblaLuz: THREE.IUniform<number>
  uAnillo: THREE.IUniform<number>
  uAnguloPixel: THREE.IUniform<number>
  uObservador: THREE.IUniform<THREE.Vector2>
  uGReferencia: THREE.IUniform<number>
}

/**
 * El gas (lente gravitacional, disco, niebla interior, anillo de fotones y cielo) se traza UNA
 * vez por fotograma en un buffer HDR propio. Una malla de pantalla barata escribe su profundidad
 * en la escena (las chispas del polvo siguen quedando detrás del gas) y el efecto de posproceso
 * del gas (`utils/efectoGas.ts`) compone el color y le aplica el resplandor de cámara.
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
      uBrillo: { value: ASPECTO_CANTO.ganancia },
      uNiebla: { value: MUNDO.niebla },
      uNieblaLuz: { value: MUNDO.nieblaLuz },
      uAnillo: { value: MUNDO.anillo },
      uAnguloPixel: { value: 0.001 },
      uObservador: { value: new THREE.Vector2(1, 0) },
      uGReferencia: { value: 1 },
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
    // Dibujo animado: entre dibujo y dibujo la pantalla no cambia, así que el gas no se traza.
    if (!tocaDibujar()) return
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
    const progreso = obtenerProgreso()
    const distancia = camera.position.length()
    // Exposición del gas: el ajuste por vista (ver `utils/campoAspecto.ts`) y, en la zambullida,
    // el diafragma que se cierra mientras el disco llena la pantalla.
    uniformes.uBrillo.value =
      ajuste('ganancia', aspectoEnCamara(camera, progreso).ganancia) * exposicionZambullida(distancia, progreso)
    const niebla = factorNieblaCercana(distancia)
    uniformes.uNiebla.value = ajuste('niebla', MUNDO.niebla) * niebla
    uniformes.uNieblaLuz.value = ajuste('nieblaLuz', MUNDO.nieblaLuz) * niebla
    const observador = observadorEnCamara(distancia, progreso)
    uniformes.uObservador.value.set(observador.energia, observador.caida)
    const gReferencia = observador.caida > 0 ? gBordeSombra(observador, distancia) : 1
    uniformes.uGReferencia.value = gReferencia
    uniformes.uTiempo.value = tiempoVisto(clock.getElapsedTime(), gReferencia)
    uniformes.uAnillo.value = ajuste('anillo', MUNDO.anillo)
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 40
    uniformes.uAnguloPixel.value = THREE.MathUtils.degToRad(fov) / Math.max(size.height, 1)
    // Dentro del horizonte el gas ya no es una superficie delante de la cámara (todo se captura
    // en el primer paso): no se escribe su profundidad, para que el anillo de papel de la escena
    // final se dibuje con su propia oclusión.
    recursos.mallaPantalla.visible = camera.position.length() > 1.05

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
