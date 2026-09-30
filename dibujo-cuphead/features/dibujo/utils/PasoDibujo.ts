import { Pass } from 'postprocessing'
import * as THREE from 'three'
import { refBufferGas } from '@/features/agujero-negro/store/mallaGas'
import { VALLE_EN_ESCENA } from '@/features/cochabamba/store/valle'
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
import { ROTULO_FRAG, ROTULO_VERT } from '../shaders/rotulos'
import { numeroDeDibujo } from '../store/ritmoDibujo'
import { ROTULOS } from '../store/rotulos'
import { crearGeometriaDestellos, generarDestellos } from './destellos'

/**
 * Los rótulos de los planetas (en píxeles a 720 de alto): alto del letrero, separación bajo el
 * planeta (más para el destino, que lleva el anillo), holgura del anillo sobre el planeta y cuándo
 * se retiran al crecer el planeta en pantalla (radio en px).
 */
const ROTULO = {
  alto: 21,
  separacion: 7,
  separacionDestino: 19,
  holguraAnillo: 9,
  retirarNombre: [34, 58],
  retirarDestino: [58, 96],
  retirarMarca: [52, 84],
} as const

/** Rectángulo en píxeles de pantalla. */
interface Rectangulo {
  x0: number
  y0: number
  x1: number
  y1: number
}

const seSolapan = (a: Rectangulo, b: Rectangulo): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

const suavizarPx = (borde0: number, borde1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - borde0) / (borde1 - borde0)))
  return t * t * (3 - 2 * t)
}

/** Si el objeto y todos sus padres son visibles. */
const esVisible = (objeto: THREE.Object3D): boolean => {
  for (let o: THREE.Object3D | null = objeto; o; o = o.parent) if (!o.visible) return false
  return true
}

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
  /** Cuánto está la cámara dentro de una nube (0–1) y su avance por ella (mueve las volutas). */
  niebla = 0
  nieblaAvance = 0
  /** 1 al salir de la nube (la niebla se abre desde el centro), −1 al entrar (se cierra en él). */
  nieblaSentido = 1

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
  private readonly matRotulos: THREE.ShaderMaterial
  private readonly escenaRotulos = new THREE.Scene()
  private readonly vistaProyeccion = new THREE.Matrix4()
  private readonly enClip = new THREE.Vector4()

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
      uDia: { value: 0 },
      uRotacionValle: { value: VALLE_EN_ESCENA.rotacion },
      uSolValle: { value: VALLE_EN_ESCENA.sol },
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
      uSoloCielo: { value: 0 },
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
      uNiebla: { value: 0 },
      uNieblaAvance: { value: 0 },
      uNieblaSentido: { value: 1 },
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

    this.matRotulos = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: ROTULO_VERT,
      fragmentShader: ROTULO_FRAG,
      uniforms: {
        uResolucion: { value: new THREE.Vector2() },
        uCentro: { value: new THREE.Vector2() },
        uTamano: { value: new THREE.Vector2() },
        uTextura: { value: null },
        uOpacidad: { value: 0 },
        uTipo: { value: 0 },
        uGiro: { value: 0 },
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
    const mallaRotulos = new THREE.Mesh(this.geometriaQuad, this.matRotulos)
    mallaRotulos.frustumCulled = false
    this.escenaRotulos.add(mallaRotulos)

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
    uc.uDia.value = VALLE_EN_ESCENA.dia
    this.dibujar(renderer, this.matCielo, this.cielo)

    // 3. Contornos.
    const ul = this.matContorno.uniforms
    ul.uIdGas.value = gas ? gas.textures[1] : null
    ul.uGasVisible.value = gasVisible
    ul.uSoloCielo.value = VALLE_EN_ESCENA.dia
    // En el valle, las siluetas contra el cielo van algo más finas (con tantos árboles y nubes, el
    // trazo del espacio pesaba demasiado).
    ul.uGrosor.value = this.ajustes.grosor * (1 - 0.28 * VALLE_EN_ESCENA.dia)
    ;(ul.uHervor.value as THREE.Vector3).set(hervorX, hervorY, HERVOR.amplitud)
    this.dibujar(renderer, this.matContorno, this.contornos)

    // 4. Composición.
    const u = this.matComponer.uniforms
    u.uEscena.value = inputBuffer.texture
    u.uGasColor.value = gas ? gas.textures[0] : null
    u.uGasVisible.value = gasVisible
    u.uSoloTinta.value = this.ajustes.soloTinta ? 1 : 0
    u.uNiebla.value = this.niebla
    u.uNieblaAvance.value = this.nieblaAvance
    u.uNieblaSentido.value = this.nieblaSentido
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
      // De día no hay estrellas.
      ud.uEstrellasVisibles.value = uc.uCieloPintado.value * (1 - VALLE_EN_ESCENA.dia)
      ud.uBandaVisible.value = ud.uProfundidad.value ? this.bandaVisible * suavizar(0, 1, gasVisible) : 0
      renderer.setRenderTarget(this.dibujo)
      renderer.render(this.escenaDestellos, this.camaraQuad)
      // Los nombres de los planetas y la marca del destino, encima.
      this.dibujarRotulos(renderer, camara, Math.min(Math.max(deltaTime, 0), 0.25))
    }

    // 6. Película antigua.
    this.matPelicula.uniforms.uFotograma.value = Math.floor(this.tiempo * PELICULA.fotogramasPorSegundo) % 100000
    this.matPelicula.uniforms.uAPantalla.value = aPantalla
    this.matPelicula.uniforms.uIris.value = this.iris
    // En el valle, con tantos bordes pequeños (flores), la separación de colores de la lente vieja
    // ensuciaba: se reduce.
    this.matPelicula.uniforms.uAberracion.value = PELICULA.aberracion * (1 - 0.65 * VALLE_EN_ESCENA.dia)
    this.dibujar(renderer, this.matPelicula, destino)
    renderer.autoClear = limpiezaPrevia
  }

  /**
   * Nombres de los planetas bajo cada uno y, en el destino, el anillo con el corazón (ver
   * `store/rotulos.ts`). Se colocan con las matrices de este fotograma; si un letrero se sale de la
   * pantalla, tapa a otro de más prioridad o cae sobre el Sol, se funde en vez de aparecer a medias,
   * y cuando su planeta ya es grande en pantalla se retira.
   */
  private dibujarRotulos(renderer: THREE.WebGLRenderer, camara: THREE.Camera, paso: number): void {
    if (ROTULOS.planetas.length === 0 || !(camara instanceof THREE.PerspectiveCamera)) return
    const ancho = this.anchoActual
    const alto = this.altoActual
    const escala = alto / 720
    const u = this.matRotulos.uniforms
    ;(u.uResolucion.value as THREE.Vector2).set(ancho, alto)
    u.uGiro.value = this.tiempo * 0.22
    this.vistaProyeccion.multiplyMatrices(camara.projectionMatrix, camara.matrixWorldInverse)
    const pixelesPorUnidad = (camara.projectionMatrix.elements[5] * alto) / 2
    const k = 1 - Math.exp(-paso * 5)
    const ocupados: Rectangulo[] = []
    // El Sol, que no se tapa.
    if (SOL_EN_ESCENA.visible > 0.01) {
      const sol = this.enClip.set(SOL_EN_ESCENA.posicion.x, SOL_EN_ESCENA.posicion.y, SOL_EN_ESCENA.posicion.z, 1).applyMatrix4(this.vistaProyeccion)
      if (sol.w > 0) {
        const x = (sol.x / sol.w * 0.5 + 0.5) * ancho
        const y = (sol.y / sol.w * 0.5 + 0.5) * alto
        const radio = (SOL_EN_ESCENA.radio * pixelesPorUnidad) / sol.w + 6 * escala
        ocupados.push({ x0: x - radio, y0: y - radio, x1: x + radio, y1: y + radio })
      }
    }
    for (const rotulo of ROTULOS.planetas) {
      const base = rotulo.destino ? Math.max(ROTULOS.nombres, ROTULOS.destino) : ROTULOS.nombres
      let objetivoNombre = 0
      let objetivoMarca = 0
      let x = 0
      let y = 0
      let radioPx = 0
      let proyectado = false
      if (base > 0.001 && esVisible(rotulo.objeto)) {
        rotulo.objeto.getWorldPosition(this.auxiliar)
        const clip = this.enClip.set(this.auxiliar.x, this.auxiliar.y, this.auxiliar.z, 1).applyMatrix4(this.vistaProyeccion)
        if (clip.w > 0) {
          proyectado = true
          x = (clip.x / clip.w * 0.5 + 0.5) * ancho
          y = (clip.y / clip.w * 0.5 + 0.5) * alto
          radioPx = (rotulo.objeto.matrixWorld.getMaxScaleOnAxis() * pixelesPorUnidad) / clip.w
          const altoLetrero = ROTULO.alto * escala
          const anchoLetrero = altoLetrero * rotulo.aspecto
          const centroY = y - radioPx - (rotulo.destino ? ROTULO.separacionDestino : ROTULO.separacion) * escala - altoLetrero / 2
          const rect = { x0: x - anchoLetrero / 2, y0: centroY - altoLetrero / 2, x1: x + anchoLetrero / 2, y1: centroY + altoLetrero / 2 }
          const enPantalla = rect.x0 > 6 && rect.x1 < ancho - 6 && rect.y0 > 6 && rect.y1 < alto - 6
          const retirar = rotulo.destino ? ROTULO.retirarDestino : ROTULO.retirarNombre
          const pequeno = 1 - suavizarPx(retirar[0] * escala, retirar[1] * escala, radioPx)
          if (enPantalla && !ocupados.some((otro) => seSolapan(rect, otro))) {
            objetivoNombre = (rotulo.destino ? base : ROTULOS.nombres) * pequeno
            ocupados.push(rect)
          }
          if (rotulo.destino) objetivoMarca = ROTULOS.destino * (1 - suavizarPx(ROTULO.retirarMarca[0] * escala, ROTULO.retirarMarca[1] * escala, radioPx))
          if (proyectado) {
            ;(u.uCentro.value as THREE.Vector2).set(x, centroY)
            ;(u.uTamano.value as THREE.Vector2).set(anchoLetrero, altoLetrero)
          }
        }
      }
      rotulo.opacidad += (objetivoNombre - rotulo.opacidad) * k
      rotulo.opacidadMarca += (objetivoMarca - rotulo.opacidadMarca) * k
      if (!proyectado) continue
      if (rotulo.opacidad > 0.01) {
        u.uTipo.value = 0
        u.uTextura.value = rotulo.textura
        u.uOpacidad.value = rotulo.opacidad
        renderer.render(this.escenaRotulos, this.camaraQuad)
      }
      if (rotulo.destino && rotulo.opacidadMarca > 0.01) {
        const lado = ((radioPx + ROTULO.holguraAnillo * escala) / 0.72) * 2
        ;(u.uCentro.value as THREE.Vector2).set(x, y)
        ;(u.uTamano.value as THREE.Vector2).set(lado, lado)
        u.uTipo.value = 1
        u.uOpacidad.value = rotulo.opacidadMarca
        renderer.render(this.escenaRotulos, this.camaraQuad)
      }
    }
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
      this.matRotulos,
    ])
      m.dispose()
    this.geometriaDestellos.dispose()
    this.geometriaQuad.dispose()
  }
}
