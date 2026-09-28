import { Pass } from 'postprocessing'
import * as THREE from 'three'
import { ACUARELA, COLORES_PLANOS, ORIENTACION, PELICULA, TINTA } from '../constantes/dibujo'
import {
  CIELO_FRAG,
  COMPONER_FRAG,
  COPIA_FRAG,
  DESENFOQUE_FRAG,
  DOG_FRAG,
  LIC_FRAG,
  ORIENTACION_FRAG,
  PANTALLA_VERT,
  PELICULA_FRAG,
  REDUCIR_FRAG,
  TENSOR_FRAG,
} from '../shaders/dibujo'

/** Objetivo HDR sin profundidad; con `salidas` > 1, varias texturas a la vez (MRT). */
const objetivo = (ancho: number, alto: number, filtro: THREE.MagnificationTextureFilter = THREE.LinearFilter, salidas = 1) =>
  new THREE.WebGLRenderTarget(ancho, alto, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: filtro,
    magFilter: filtro,
    generateMipmaps: false,
    depthBuffer: false,
    count: salidas,
  })

const material = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: PANTALLA_VERT,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
  })

/** Parámetros ajustables en caliente (claves de desarrollo en la URL, ver `vistaCamaraStore`). */
export interface AjustesDibujo {
  activo: boolean
  /** Sólo la tinta sobre papel (para revisar las líneas). */
  soloTinta: boolean
  umbral: number
  grosor: number
}

/**
 * Pase del dibujo animado: redibuja la imagen de la escena al estilo de los dibujos de los años
 * 30. Va al final de la cadena de posproceso (después del tono):
 *
 * 1. Reducciones a 1/4 (orientación de los bordes) y a 1/2 (color y luz del dibujo).
 * 2. Orientación: tensor de estructura → desenfoque con memoria en el tiempo → tangente del borde.
 * 3. Tinta (FDoG): diferencia de gaussianas a través del borde y suavizado a lo largo de él.
 * 4. Composición: colores planos por bandas y la tinta encima.
 */
export class PasoDibujo extends Pass {
  /** Cámara de la escena: ancla el cielo en acuarela a la esfera celeste. */
  camara: THREE.Camera | null = null
  /**
   * Cuánto del cielo abierto se pinta como cielo (0–1). Dentro del horizonte, antes de que aparezca
   * el agujero de gusano, la oscuridad es oscuridad.
   */
  cieloPintado = 1

  readonly ajustes: AjustesDibujo = {
    activo: true,
    soloTinta: false,
    umbral: TINTA.umbral,
    grosor: TINTA.sigmaBorde,
  }

  private readonly escenaQuad = new THREE.Scene()
  private readonly camaraQuad = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly geometriaQuad = new THREE.PlaneGeometry(2, 2)
  private readonly quad: THREE.Mesh

  private readonly cuarto = objetivo(2, 2)
  private readonly tensor = objetivo(2, 2)
  private readonly tensorIntermedio = objetivo(2, 2)
  /** Tensor suavizado con memoria en el tiempo (ping-pong). */
  private readonly historia = [objetivo(2, 2), objetivo(2, 2)] as const
  private readonly orientacion = objetivo(2, 2)
  private readonly media = objetivo(2, 2)
  private readonly mediaIntermedia = objetivo(2, 2)
  private readonly luz = objetivo(2, 2)
  private readonly colorSuave = objetivo(2, 2)
  private readonly respuesta = objetivo(2, 2)
  private readonly lineas = objetivo(2, 2)
  private readonly cielo = objetivo(2, 2)
  private readonly aguadaIntermedia = objetivo(2, 2)
  private readonly aguada = objetivo(2, 2)
  /** El dibujo compuesto (sRGB), antes de pasar por la película. */
  private readonly dibujo = objetivo(2, 2)
  private readonly uCamara = {
    uProyInversa: { value: new THREE.Matrix4() },
    uCamaraMundo: { value: new THREE.Matrix4() },
  }

  private readonly matReducir: THREE.ShaderMaterial
  private readonly matDesenfoque: THREE.ShaderMaterial
  private readonly matTensor: THREE.ShaderMaterial
  private readonly matOrientacion: THREE.ShaderMaterial
  private readonly matDog: THREE.ShaderMaterial
  private readonly matLic: THREE.ShaderMaterial
  private readonly matComponer: THREE.ShaderMaterial
  private readonly matCopia: THREE.ShaderMaterial
  private readonly matCielo: THREE.ShaderMaterial
  private readonly matPelicula: THREE.ShaderMaterial

  private indiceHistoria = 0
  private conHistoria = false
  private anchoActual = 0
  private altoActual = 0
  private tiempo = 0

  constructor() {
    super('PasoDibujo')
    this.needsSwap = true
    // La profundidad de la escena da las siluetas de los objetos frente al cielo.
    this.needsDepthTexture = true

    this.matReducir = material(REDUCIR_FRAG, { uEntrada: { value: null }, uTexelEntrada: { value: new THREE.Vector2() } })
    this.matDesenfoque = material(DESENFOQUE_FRAG, {
      uEntrada: { value: null },
      uPaso: { value: new THREE.Vector2() },
      uHistoria: { value: null },
      uMezcla: { value: 1 },
    })
    this.matTensor = material(TENSOR_FRAG, { uReducida: { value: this.cuarto.texture }, uTexel: { value: new THREE.Vector2() } })
    this.matOrientacion = material(ORIENTACION_FRAG, { uTensor: { value: null } })
    this.matDog = material(DOG_FRAG, {
      uLuz: { value: this.luz.texture },
      uOrientacion: { value: this.orientacion.texture },
      uTexel: { value: new THREE.Vector2() },
      uSigma: { value: TINTA.sigmaBorde },
      uK: { value: TINTA.k },
      uRho: { value: TINTA.rho },
      uNivelTinta: { value: new THREE.Vector3(...TINTA.nivelTinta) },
      uProfundidad: { value: null },
      uPesoSilueta: { value: 0 },
      uPesoCalidez: { value: TINTA.pesoCalidez },
    })
    this.matLic = material(LIC_FRAG, {
      uRespuesta: { value: this.respuesta.texture },
      uOrientacion: { value: this.orientacion.texture },
      uTexel: { value: new THREE.Vector2() },
      uSigma: { value: TINTA.sigmaFlujo },
    })
    this.matComponer = material(COMPONER_FRAG, {
      uColorSuave: { value: this.colorSuave.texture },
      uLineas: { value: this.lineas.texture },
      uUmbralesBanda: { value: new THREE.Vector3(...COLORES_PLANOS.umbrales) },
      uValoresBanda: { value: new THREE.Vector3(...COLORES_PLANOS.valores) },
      uDegradado: { value: COLORES_PLANOS.degradado },
      uCroma: { value: COLORES_PLANOS.croma },
      uUmbral: { value: TINTA.umbral },
      uSuavidad: { value: TINTA.suavidad },
      uTinta: { value: new THREE.Vector3(...TINTA.color) },
      uAPantalla: { value: 1 },
      uSoloTinta: { value: 0 },
      uCielo: { value: this.cielo.texture },
      uAguada: { value: this.aguada.texture },
      uUmbralesAguada: { value: new THREE.Vector3(...ACUARELA.umbralesAguada) },
      uResolucion: { value: new THREE.Vector2() },
      uEscalaPapel: { value: ACUARELA.escalaPapel },
      uFuerzaEpoca: { value: COLORES_PLANOS.fuerzaEpoca },
    })
    this.matPelicula = material(PELICULA_FRAG, {
      uImagen: { value: this.dibujo.texture },
      uResolucion: { value: new THREE.Vector2() },
      uFotograma: { value: 0 },
      uAPantalla: { value: 1 },
      uPelicula: { value: new THREE.Vector4(PELICULA.grano, PELICULA.polvo, PELICULA.rayas, PELICULA.parpadeo) },
      uPelicula2: { value: new THREE.Vector3(PELICULA.vaiven, PELICULA.vineta, PELICULA.envejecido) },
    })
    this.matCielo = material(CIELO_FRAG, {
      uProfundidad: { value: null },
      uTexelEntrada: { value: new THREE.Vector2() },
      uCieloPintado: { value: 1 },
      ...this.uCamara,
    })
    this.matCopia = material(COPIA_FRAG, { uEntrada: { value: null }, uAPantalla: { value: 1 } })

    this.quad = new THREE.Mesh(this.geometriaQuad, this.matReducir)
    this.quad.frustumCulled = false
    this.escenaQuad.add(this.quad)
  }

  override setSize(ancho: number, alto: number): void {
    ancho = Math.max(2, Math.round(ancho))
    alto = Math.max(2, Math.round(alto))
    if (ancho === this.anchoActual && alto === this.altoActual) return
    this.anchoActual = ancho
    this.altoActual = alto
    const anchoC = Math.max(2, Math.round(ancho / 4))
    const altoC = Math.max(2, Math.round(alto / 4))
    for (const rt of [this.cuarto, this.tensor, this.tensorIntermedio, ...this.historia, this.orientacion, this.aguadaIntermedia, this.aguada])
      rt.setSize(anchoC, altoC)
    const anchoM = Math.max(2, Math.round(ancho / 2))
    const altoM = Math.max(2, Math.round(alto / 2))
    for (const rt of [this.media, this.mediaIntermedia, this.luz, this.colorSuave, this.respuesta, this.lineas, this.cielo])
      rt.setSize(anchoM, altoM)
    ;(this.matCielo.uniforms.uTexelEntrada.value as THREE.Vector2).set(0.5 / ancho, 0.5 / alto)
    ;(this.matComponer.uniforms.uResolucion.value as THREE.Vector2).set(ancho, alto)
    ;(this.matPelicula.uniforms.uResolucion.value as THREE.Vector2).set(ancho, alto)
    this.dibujo.setSize(ancho, alto)
    this.matComponer.uniforms.uEscalaPapel.value = ACUARELA.escalaPapel * Math.max(1, alto / 720)
    this.conHistoria = false
    ;(this.matTensor.uniforms.uTexel.value as THREE.Vector2).set(1 / anchoC, 1 / altoC)
    ;(this.matDog.uniforms.uTexel.value as THREE.Vector2).set(1 / anchoM, 1 / altoM)
    ;(this.matLic.uniforms.uTexel.value as THREE.Vector2).set(1 / anchoM, 1 / altoM)
  }

  override setDepthTexture(textura: THREE.Texture): void {
    this.matDog.uniforms.uProfundidad.value = textura
    this.matCielo.uniforms.uProfundidad.value = textura
  }

  private dibujar(renderer: THREE.WebGLRenderer, materialQuad: THREE.ShaderMaterial, destino: THREE.WebGLRenderTarget | null): void {
    this.quad.material = materialQuad
    renderer.setRenderTarget(destino)
    renderer.render(this.escenaQuad, this.camaraQuad)
  }

  private reducir(renderer: THREE.WebGLRenderer, entrada: THREE.Texture, texel: THREE.Vector2Like, destino: THREE.WebGLRenderTarget) {
    this.matReducir.uniforms.uEntrada.value = entrada
    ;(this.matReducir.uniforms.uTexelEntrada.value as THREE.Vector2).set(texel.x, texel.y)
    this.dibujar(renderer, this.matReducir, destino)
  }

  private desenfocar(
    renderer: THREE.WebGLRenderer,
    entrada: THREE.WebGLRenderTarget,
    paso: THREE.Vector2Like,
    destino: THREE.WebGLRenderTarget,
    historia: THREE.WebGLRenderTarget | null = null,
    mezcla = 1,
  ) {
    const u = this.matDesenfoque.uniforms
    u.uEntrada.value = entrada.texture
    ;(u.uPaso.value as THREE.Vector2).set(paso.x, paso.y)
    u.uHistoria.value = historia ? historia.texture : null
    u.uMezcla.value = historia ? mezcla : 1
    this.dibujar(renderer, this.matDesenfoque, destino)
  }

  override render(
    renderer: THREE.WebGLRenderer,
    inputBuffer: THREE.WebGLRenderTarget,
    outputBuffer: THREE.WebGLRenderTarget,
    deltaTime = 1 / 60,
  ): void {
    const limpiezaPrevia = renderer.autoClear
    renderer.autoClear = false
    const destino = this.renderToScreen ? null : outputBuffer
    const aPantalla = this.renderToScreen ? 1 : 0

    if (!this.ajustes.activo) {
      this.matCopia.uniforms.uEntrada.value = inputBuffer.texture
      this.matCopia.uniforms.uAPantalla.value = aPantalla
      this.dibujar(renderer, this.matCopia, destino)
      renderer.autoClear = limpiezaPrevia
      return
    }

    const paso = Math.min(Math.max(deltaTime, 0), 0.25)
    this.tiempo += paso
    const anchoC = this.cuarto.width
    const altoC = this.cuarto.height
    const anchoM = this.media.width
    const altoM = this.media.height

    // 1. Reducciones.
    this.reducir(renderer, inputBuffer.texture, { x: 1 / this.anchoActual, y: 1 / this.altoActual }, this.cuarto)
    this.reducir(renderer, inputBuffer.texture, { x: 0.5 / this.anchoActual, y: 0.5 / this.altoActual }, this.media)

    // 2. Orientación de los bordes.
    this.dibujar(renderer, this.matTensor, this.tensor)
    const pasoT = ORIENTACION.pasoDesenfoque
    this.desenfocar(renderer, this.tensor, { x: pasoT / anchoC, y: 0 }, this.tensorIntermedio)
    const previa = this.historia[this.indiceHistoria]
    const actual = this.historia[1 - this.indiceHistoria]
    const mezcla = this.conHistoria ? 1 - Math.exp(-paso / ORIENTACION.tauTemporal) : 1
    this.desenfocar(renderer, this.tensorIntermedio, { x: 0, y: pasoT / altoC }, actual, previa, mezcla)
    this.indiceHistoria = 1 - this.indiceHistoria
    this.conHistoria = true
    this.matOrientacion.uniforms.uTensor.value = actual.texture
    this.dibujar(renderer, this.matOrientacion, this.orientacion)

    // 3. Luz para la tinta (desenfoque ligero) y color simplificado para los planos.
    const pasoL = TINTA.desenfoquePrevio
    this.desenfocar(renderer, this.media, { x: pasoL / anchoM, y: 0 }, this.mediaIntermedia)
    this.desenfocar(renderer, this.mediaIntermedia, { x: 0, y: pasoL / altoM }, this.luz)
    const pasoC = COLORES_PLANOS.desenfoque
    this.desenfocar(renderer, this.media, { x: pasoC / anchoM, y: 0 }, this.mediaIntermedia)
    this.desenfocar(renderer, this.mediaIntermedia, { x: 0, y: pasoC / altoM }, this.colorSuave)

    // 4. Tinta: diferencia de gaussianas a través del borde y suavizado a lo largo de él.
    this.matDog.uniforms.uSigma.value = this.ajustes.grosor
    this.matDog.uniforms.uPesoSilueta.value = this.matDog.uniforms.uProfundidad.value ? TINTA.pesoSilueta : 0
    this.dibujar(renderer, this.matDog, this.respuesta)
    this.dibujar(renderer, this.matLic, this.lineas)

    // 5. Luz de las aguadas (muy suavizada), cielo en acuarela (anclado a la esfera celeste) y máscara
    // del cielo abierto.
    const pasoA = ACUARELA.desenfoqueAguada
    this.desenfocar(renderer, this.cuarto, { x: pasoA / anchoC, y: 0 }, this.aguadaIntermedia)
    this.desenfocar(renderer, this.aguadaIntermedia, { x: 0, y: pasoA / altoC }, this.aguada)
    const camara = this.camara
    if (camara) {
      camara.updateMatrixWorld()
      this.uCamara.uProyInversa.value.copy(camara.projectionMatrixInverse)
      this.uCamara.uCamaraMundo.value.copy(camara.matrixWorld)
    }
    this.matCielo.uniforms.uCieloPintado.value = this.matCielo.uniforms.uProfundidad.value ? this.cieloPintado : 0
    this.dibujar(renderer, this.matCielo, this.cielo)

    // 6. Composición.
    const u = this.matComponer.uniforms
    u.uUmbral.value = this.ajustes.umbral
    u.uSoloTinta.value = this.ajustes.soloTinta ? 1 : 0
    u.uAPantalla.value = 1
    this.dibujar(renderer, this.matComponer, this.dibujo)

    // 7. Película antigua (a 24 fotogramas por segundo, como en un proyector).
    this.matPelicula.uniforms.uFotograma.value = Math.floor(this.tiempo * PELICULA.fotogramasPorSegundo) % 100000
    this.matPelicula.uniforms.uAPantalla.value = aPantalla
    this.dibujar(renderer, this.matPelicula, destino)
    renderer.autoClear = limpiezaPrevia
  }

  override dispose(): void {
    for (const rt of [
      this.cuarto,
      this.tensor,
      this.tensorIntermedio,
      ...this.historia,
      this.orientacion,
      this.media,
      this.mediaIntermedia,
      this.luz,
      this.colorSuave,
      this.respuesta,
      this.lineas,
      this.cielo,
      this.aguadaIntermedia,
      this.aguada,
      this.dibujo,
    ])
      rt.dispose()
    for (const m of [
      this.matReducir,
      this.matDesenfoque,
      this.matTensor,
      this.matOrientacion,
      this.matDog,
      this.matLic,
      this.matComponer,
      this.matCopia,
      this.matCielo,
      this.matPelicula,
    ])
      m.dispose()
    this.geometriaQuad.dispose()
  }
}
