import { Pass } from 'postprocessing'
import * as THREE from 'three'
import { refBufferGas } from '@/features/agujero-negro/store/mallaGas'
import { SOL_EN_ESCENA } from '@/features/sistema-solar/store/solEnEscena'
import { ACUARELA, COLORES_PLANOS, HERVOR, PELICULA, TINTA } from '../constantes/dibujo'
import {
  CIELO_FRAG,
  COMPONER_FRAG,
  CONTORNO_FRAG,
  COPIA_FRAG,
  DESENFOQUE_FRAG,
  DESTELLO_FRAG,
  DESTELLO_VERT,
  PANTALLA_VERT,
  PELICULA_FRAG,
  REDUCIR_FRAG,
} from '../shaders/dibujo'
import { numeroDeDibujo } from '../store/ritmoDibujo'
import { crearGeometriaDestellos, generarDestellos } from './destellos'

/** Radio aparente de la sombra (parámetro de impacto crítico, r_s = 1). */
const RADIO_SOMBRA = 2.598

/** Objetivo HDR sin profundidad. */
const objetivo = (ancho: number, alto: number, filtro: THREE.MagnificationTextureFilter = THREE.LinearFilter) =>
  new THREE.WebGLRenderTarget(ancho, alto, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: filtro,
    magFilter: filtro,
    generateMipmaps: false,
    depthBuffer: false,
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

const suavizar = (borde0: number, borde1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - borde0) / (borde1 - borde0)))
  return t * t * (3 - 2 * t)
}

/** Parámetros ajustables en caliente (claves de desarrollo en la URL, ver `vistaCamaraStore`). */
export interface AjustesDibujo {
  activo: boolean
  /** Sólo la tinta sobre papel (para revisar las líneas). */
  soloTinta: boolean
  /** Radio del trazo de tinta (px a 720 de alto). */
  grosor: number
}

/**
 * Pase del dibujo animado. El agujero negro ya llega dibujado en caricatura desde su propio buffer
 * (color y qué objeto hay en cada píxel, ver `shaders/lenteCaricatura.frag.ts`) y el sistema solar
 * en la propia escena (con alfa 0.5, ver `TONO_GLSL`); este pase los compone sobre el cielo, tonea
 * y aplana lo que todavía es realista y le pone la tinta y la película:
 *
 * 1. Cielo en acuarela anclado a la esfera celeste, con rayos de sol detrás del agujero.
 * 2. Contornos a partir de los objetos (y de los saltos de profundidad dentro del horizonte), con
 *    grosor de pincel variable y el hervor del dibujo a mano.
 * 3. Composición: cielo (con aguadas de luz), lo que aún se renderiza con materiales realistas en
 *    colores planos de época, el agujero de caricatura y la tinta; papel.
 * 4. Estrellas y destellos de caricatura; película antigua a 24 fotogramas por segundo.
 */
export class PasoDibujo extends Pass {
  /** Cámara de la escena: ancla el cielo a la esfera celeste y sitúa el agujero. */
  camara: THREE.Camera | null = null
  /** Cuánto del cielo abierto se pinta como cielo (0–1): dentro del horizonte, oscuridad. */
  cieloPintado = 1
  /** Cuánto se ve el agujero de caricatura (sólo fuera del horizonte). */
  gasVisible = 1
  /** Visibilidad de los destellos de la banda de polvo (sólo con la cámara fuera del horizonte). */
  bandaVisible = 1
  /** Latido del compás (0–1), ver `store/ritmoDibujo.ts`. */
  latido = 0
  /** Pulsaciones del compás transcurridas (las estrellas bailan con ellas). */
  pulsaciones = 0
  /** Radio del iris de la película (1 abierto, 0 cerrado). */
  iris = 1

  readonly ajustes: AjustesDibujo = { activo: true, soloTinta: false, grosor: TINTA.grosor }

  private readonly escenaQuad = new THREE.Scene()
  private readonly camaraQuad = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly geometriaQuad = new THREE.PlaneGeometry(2, 2)
  private readonly quad: THREE.Mesh

  private readonly media = objetivo(2, 2)
  private readonly mediaIntermedia = objetivo(2, 2)
  private readonly colorSuave = objetivo(2, 2)
  private readonly cuarto = objetivo(2, 2)
  private readonly aguadaIntermedia = objetivo(2, 2)
  private readonly aguada = objetivo(2, 2)
  private readonly cielo = objetivo(2, 2)
  private readonly contornos = objetivo(2, 2)
  /** El dibujo compuesto (sRGB), antes de pasar por la película. */
  private readonly dibujo = objetivo(2, 2)

  private readonly uCamara = {
    uProyInversa: { value: new THREE.Matrix4() },
    uCamaraMundo: { value: new THREE.Matrix4() },
  }
  private readonly uAgujero = { value: new THREE.Vector4() }
  private readonly uSol = { value: new THREE.Vector4() }

  private readonly matReducir: THREE.ShaderMaterial
  private readonly matDesenfoque: THREE.ShaderMaterial
  private readonly matCielo: THREE.ShaderMaterial
  private readonly matContorno: THREE.ShaderMaterial
  private readonly matComponer: THREE.ShaderMaterial
  private readonly matPelicula: THREE.ShaderMaterial
  private readonly matCopia: THREE.ShaderMaterial
  private readonly geometriaDestellos = crearGeometriaDestellos(generarDestellos())
  private readonly matDestellos: THREE.ShaderMaterial
  private readonly escenaDestellos = new THREE.Scene()

  private anchoActual = 0
  private altoActual = 0
  private tiempo = 0
  private readonly auxiliar = new THREE.Vector3()

  constructor() {
    super('PasoDibujo')
    this.needsSwap = true
    // La profundidad de la escena separa el cielo abierto de lo que tiene cuerpo.
    this.needsDepthTexture = true

    this.matReducir = material(REDUCIR_FRAG, { uEntrada: { value: null }, uBloque: { value: 2 } })
    this.matDesenfoque = material(DESENFOQUE_FRAG, {
      uEntrada: { value: null },
      uPaso: { value: new THREE.Vector2() },
      uHistoria: { value: null },
      uMezcla: { value: 1 },
    })
    this.matCielo = material(CIELO_FRAG, {
      uProfundidad: { value: null },
      uEscena: { value: null },
      uSol: this.uSol,
      uTexelEntrada: { value: new THREE.Vector2() },
      uCieloPintado: { value: 1 },
      uAgujero: this.uAgujero,
      uAspecto: { value: 1 },
      uTiempo: { value: 0 },
      uLatido: { value: 0 },
      ...this.uCamara,
    })
    this.matContorno = material(CONTORNO_FRAG, {
      uIdGas: { value: null },
      uProfundidad: { value: null },
      uResolucion: { value: new THREE.Vector2() },
      uCercaLejos: { value: new THREE.Vector2(0.1, 1400) },
      uGrosor: { value: TINTA.grosor },
      uHervor: { value: new THREE.Vector3(0, 0, HERVOR.amplitud) },
      uGasVisible: { value: 1 },
    })
    this.matComponer = material(COMPONER_FRAG, {
      uEscena: { value: null },
      uColorSuave: { value: this.colorSuave.texture },
      uContornos: { value: this.contornos.texture },
      uGasColor: { value: null },
      uGasVisible: { value: 1 },
      uCielo: { value: this.cielo.texture },
      uAguada: { value: this.aguada.texture },
      uUmbralesAguada: { value: new THREE.Vector3(...ACUARELA.umbralesAguada) },
      uResolucion: { value: new THREE.Vector2() },
      uEscalaPapel: { value: ACUARELA.escalaPapel },
      uFuerzaEpoca: { value: COLORES_PLANOS.fuerzaEpoca },
      uHervor: { value: new THREE.Vector3(0, 0, HERVOR.amplitud) },
      uUmbralesBanda: { value: new THREE.Vector3(...COLORES_PLANOS.umbrales) },
      uValoresBanda: { value: new THREE.Vector3(...COLORES_PLANOS.valores) },
      uDegradado: { value: COLORES_PLANOS.degradado },
      uCroma: { value: COLORES_PLANOS.croma },
      uTinta: { value: new THREE.Vector3(...TINTA.color) },
      uAPantalla: { value: 1 },
      uSoloTinta: { value: 0 },
    })
    this.matPelicula = material(PELICULA_FRAG, {
      uImagen: { value: this.dibujo.texture },
      uResolucion: { value: new THREE.Vector2() },
      uFotograma: { value: 0 },
      uAPantalla: { value: 1 },
      uPelicula: { value: new THREE.Vector4(PELICULA.grano, PELICULA.polvo, PELICULA.rayas, PELICULA.parpadeo) },
      uPelicula2: { value: new THREE.Vector3(PELICULA.vaiven, PELICULA.vineta, PELICULA.envejecido) },
      uAberracion: { value: PELICULA.aberracion },
      uIris: { value: 1 },
    })
    this.matCopia = material(COPIA_FRAG, { uEntrada: { value: null }, uAPantalla: { value: 1 } })
    this.matDestellos = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: DESTELLO_VERT,
      fragmentShader: DESTELLO_FRAG,
      uniforms: {
        uVistaProyeccion: { value: new THREE.Matrix4() },
        uPosCamara: { value: new THREE.Vector3() },
        uResolucion: { value: new THREE.Vector2() },
        uDibujo: { value: 0 },
        uTiempo: { value: 0 },
        uPulsaciones: { value: 0 },
        uCielo: { value: this.cielo.texture },
        uAguada: { value: this.aguada.texture },
        uProfundidad: { value: null },
        uGasColor: { value: null },
        uGasVisible: { value: 1 },
        uEstrellasVisibles: { value: 1 },
        uBandaVisible: { value: 1 },
        uTinta: { value: new THREE.Vector3(...TINTA.color) },
      },
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    })
    const mallaDestellos = new THREE.Mesh(this.geometriaDestellos, this.matDestellos)
    mallaDestellos.frustumCulled = false
    this.escenaDestellos.add(mallaDestellos)

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
    for (const rt of [this.cuarto, this.aguadaIntermedia, this.aguada]) rt.setSize(anchoC, altoC)
    const anchoM = Math.max(2, Math.round(ancho / 2))
    const altoM = Math.max(2, Math.round(alto / 2))
    for (const rt of [this.media, this.mediaIntermedia, this.colorSuave, this.cielo]) rt.setSize(anchoM, altoM)
    this.contornos.setSize(ancho, alto)
    this.dibujo.setSize(ancho, alto)

    ;(this.matCielo.uniforms.uTexelEntrada.value as THREE.Vector2).set(0.5 / ancho, 0.5 / alto)
    this.matCielo.uniforms.uAspecto.value = ancho / alto
    for (const m of [this.matContorno, this.matComponer, this.matPelicula, this.matDestellos])
      (m.uniforms.uResolucion.value as THREE.Vector2).set(ancho, alto)
    this.matComponer.uniforms.uEscalaPapel.value = ACUARELA.escalaPapel * Math.max(1, alto / 720)
  }

  override setDepthTexture(textura: THREE.Texture): void {
    this.matCielo.uniforms.uProfundidad.value = textura
    this.matContorno.uniforms.uProfundidad.value = textura
    this.matDestellos.uniforms.uProfundidad.value = textura
  }

  private dibujar(renderer: THREE.WebGLRenderer, materialQuad: THREE.ShaderMaterial, destino: THREE.WebGLRenderTarget | null): void {
    this.quad.material = materialQuad
    renderer.setRenderTarget(destino)
    renderer.render(this.escenaQuad, this.camaraQuad)
  }

  private reducir(renderer: THREE.WebGLRenderer, entrada: THREE.Texture, bloque: 2 | 4, destino: THREE.WebGLRenderTarget) {
    this.matReducir.uniforms.uEntrada.value = entrada
    this.matReducir.uniforms.uBloque.value = bloque
    this.dibujar(renderer, this.matReducir, destino)
  }

  private desenfocar(renderer: THREE.WebGLRenderer, entrada: THREE.WebGLRenderTarget, paso: THREE.Vector2Like, destino: THREE.WebGLRenderTarget) {
    const u = this.matDesenfoque.uniforms
    u.uEntrada.value = entrada.texture
    ;(u.uPaso.value as THREE.Vector2).set(paso.x, paso.y)
    u.uMezcla.value = 1
    this.dibujar(renderer, this.matDesenfoque, destino)
  }

  /**
   * El agujero en pantalla (centro y radio de la sombra en fracción de la altura) para los rayos
   * de sol; con la cámara dentro del horizonte o detrás, sin rayos.
   */
  private situarAgujero(camara: THREE.Camera): void {
    const distancia = camara.position.length()
    const perspectiva = camara instanceof THREE.PerspectiveCamera ? camara : null
    if (!perspectiva || distancia < 1.2) {
      this.uAgujero.value.set(0.5, 0.5, 0.1, 0)
      return
    }
    const p = this.auxiliar.set(0, 0, 0).project(perspectiva)
    const angulo = Math.asin(Math.min(1, (RADIO_SOMBRA * Math.sqrt(Math.max(0, 1 - 1 / distancia))) / distancia))
    const radio = (0.5 * Math.tan(angulo)) / Math.tan(THREE.MathUtils.degToRad(perspectiva.fov) / 2)
    const delante = p.z < 1 ? 1 : 0
    this.uAgujero.value.set(0.5 + 0.5 * p.x, 0.5 + 0.5 * p.y, radio, delante * this.gasVisible)
  }

  /** El Sol de caricatura en pantalla (centro y radio de su disco en fracción de la altura). */
  private situarSol(camara: THREE.Camera): void {
    const perspectiva = camara instanceof THREE.PerspectiveCamera ? camara : null
    if (!perspectiva || SOL_EN_ESCENA.visible <= 0.001) {
      this.uSol.value.set(0.5, 0.5, 0.1, 0)
      return
    }
    const distancia = Math.max(camara.position.distanceTo(SOL_EN_ESCENA.posicion), 1e-3)
    const p = this.auxiliar.copy(SOL_EN_ESCENA.posicion).project(perspectiva)
    const radio = (0.5 * SOL_EN_ESCENA.radio) / distancia / Math.tan(THREE.MathUtils.degToRad(perspectiva.fov) / 2)
    this.uSol.value.set(0.5 + 0.5 * p.x, 0.5 + 0.5 * p.y, radio, p.z < 1 ? SOL_EN_ESCENA.visible : 0)
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

    this.tiempo += Math.min(Math.max(deltaTime, 0), 0.25)
    const camara = this.camara
    if (camara) {
      camara.updateMatrixWorld()
      this.uCamara.uProyInversa.value.copy(camara.projectionMatrixInverse)
      this.uCamara.uCamaraMundo.value.copy(camara.matrixWorld)
      this.situarAgujero(camara)
      this.situarSol(camara)
      if (camara instanceof THREE.PerspectiveCamera) (this.matContorno.uniforms.uCercaLejos.value as THREE.Vector2).set(camara.near, camara.far)
    }
    const gas = refBufferGas.current
    const gasVisible = gas ? this.gasVisible : 0
    const semilla = Math.floor(numeroDeDibujo() / HERVOR.cadaDibujos)
    const hervorX = (semilla * 12.9898) % 97
    const hervorY = (semilla * 78.233) % 89

    // 1. Reducciones y versiones suavizadas de la escena (para lo que aún es realista).
    this.reducir(renderer, inputBuffer.texture, 2, this.media)
    this.reducir(renderer, inputBuffer.texture, 4, this.cuarto)
    // El desenfoque tiene σ = 3.5 pasos: el paso se escala para el σ pedido.
    const pasoC = COLORES_PLANOS.desenfoque / 3.5
    this.desenfocar(renderer, this.media, { x: pasoC / this.media.width, y: 0 }, this.mediaIntermedia)
    this.desenfocar(renderer, this.mediaIntermedia, { x: 0, y: pasoC / this.media.height }, this.colorSuave)
    const pasoA = ACUARELA.desenfoqueAguada / 3.5
    this.desenfocar(renderer, this.cuarto, { x: pasoA / this.cuarto.width, y: 0 }, this.aguadaIntermedia)
    this.desenfocar(renderer, this.aguadaIntermedia, { x: 0, y: pasoA / this.cuarto.height }, this.aguada)

    // 2. Cielo en acuarela con los rayos de sol del agujero.
    const uc = this.matCielo.uniforms
    uc.uEscena.value = inputBuffer.texture
    uc.uCieloPintado.value = uc.uProfundidad.value ? this.cieloPintado : 0
    uc.uTiempo.value = this.tiempo
    uc.uLatido.value = this.latido
    this.dibujar(renderer, this.matCielo, this.cielo)

    // 3. Contornos.
    const ul = this.matContorno.uniforms
    ul.uIdGas.value = gas ? gas.textures[1] : null
    ul.uGasVisible.value = gasVisible
    ul.uGrosor.value = this.ajustes.grosor
    ;(ul.uHervor.value as THREE.Vector3).set(hervorX, hervorY, HERVOR.amplitud)
    this.dibujar(renderer, this.matContorno, this.contornos)

    // 4. Composición.
    const u = this.matComponer.uniforms
    u.uEscena.value = inputBuffer.texture
    u.uGasColor.value = gas ? gas.textures[0] : null
    u.uGasVisible.value = gasVisible
    u.uSoloTinta.value = this.ajustes.soloTinta ? 1 : 0
    u.uAPantalla.value = 1
    ;(u.uHervor.value as THREE.Vector3).set(hervorX, hervorY, HERVOR.amplitud)
    this.dibujar(renderer, this.matComponer, this.dibujo)

    // 5. Estrellas y destellos de caricatura.
    if (camara) {
      const ud = this.matDestellos.uniforms
      ;(ud.uVistaProyeccion.value as THREE.Matrix4).multiplyMatrices(camara.projectionMatrix, camara.matrixWorldInverse)
      ;(ud.uPosCamara.value as THREE.Vector3).copy(camara.position)
      ud.uDibujo.value = numeroDeDibujo()
      ud.uTiempo.value = this.tiempo
      ud.uPulsaciones.value = this.pulsaciones
      ud.uGasColor.value = gas ? gas.textures[0] : null
      ud.uGasVisible.value = gasVisible
      ud.uEstrellasVisibles.value = uc.uCieloPintado.value
      ud.uBandaVisible.value = ud.uProfundidad.value ? this.bandaVisible * suavizar(0, 1, gasVisible) : 0
      renderer.setRenderTarget(this.dibujo)
      renderer.render(this.escenaDestellos, this.camaraQuad)
    }

    // 6. Película antigua.
    this.matPelicula.uniforms.uFotograma.value = Math.floor(this.tiempo * PELICULA.fotogramasPorSegundo) % 100000
    this.matPelicula.uniforms.uAPantalla.value = aPantalla
    this.matPelicula.uniforms.uIris.value = this.iris
    this.dibujar(renderer, this.matPelicula, destino)
    renderer.autoClear = limpiezaPrevia
  }

  override dispose(): void {
    for (const rt of [
      this.media,
      this.mediaIntermedia,
      this.colorSuave,
      this.cuarto,
      this.aguadaIntermedia,
      this.aguada,
      this.cielo,
      this.contornos,
      this.dibujo,
    ])
      rt.dispose()
    for (const m of [
      this.matReducir,
      this.matDesenfoque,
      this.matCielo,
      this.matContorno,
      this.matComponer,
      this.matPelicula,
      this.matCopia,
      this.matDestellos,
    ])
      m.dispose()
    this.geometriaDestellos.dispose()
    this.geometriaQuad.dispose()
  }
}
