import { Pass } from 'postprocessing'
import * as THREE from 'three'
import { ANALISIS_FLUJO, CAPAS_PINCELADAS, type CapaPinceladas } from '../constantes/pinceladas'
import {
  BASE_FRAG,
  CIELO_FRAG,
  DESENFOQUE_FRAG,
  FINAL_FRAG,
  FLUJO_FRAG,
  PALETA_FRAG,
  PANTALLA_VERT,
  PINCELADA_FRAG,
  PINCELADA_VERT,
  PINCELES_FRAG,
  PROMEDIO_FRAG,
  REDUCIR_FRAG,
  TENSOR_FRAG,
  VISIBILIDAD_ESTRELLAS_FRAG,
} from '../shaders/pintura'
import { ESTRELLAS_PINTADAS, generarEstrellasPintadas, proyectarEstrellas } from './estrellasPintadas'
import { MedidorGpu } from './medidorGpu'

/** Radio aparente de la sombra (parámetro de impacto crítico, r_s = 1). */
const RADIO_SOMBRA = 2.598

/** Generador determinista (mulberry32): las pinceladas no cambian de sitio al recargar. */
const generador = (semilla: number) => {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const suavizar = (borde0: number, borde1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - borde0) / (borde1 - borde0)))
  return t * t * (3 - 2 * t)
}

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

/** Tira base de una pincelada con `secciones` cortes: (fracción a lo largo, lado). */
const crearTira = (secciones: number): THREE.BufferGeometry => {
  const posiciones: number[] = []
  const indices: number[] = []
  for (let i = 0; i < secciones; i++) {
    const u = i / (secciones - 1)
    posiciones.push(u, -1, 0, u, 1, 0)
  }
  for (let i = 0; i < secciones - 1; i++) {
    const a = 2 * i
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const geometria = new THREE.BufferGeometry()
  geometria.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3))
  geometria.setIndex(indices)
  return geometria
}

interface Capa {
  definicion: CapaPinceladas
  tira: THREE.BufferGeometry
  geometria: THREE.InstancedBufferGeometry
  material: THREE.ShaderMaterial
  escena: THREE.Scene
}

/** Parámetros ajustables en caliente (claves de desarrollo en la URL, ver `vistaCamaraStore`). */
export interface AjustesPintura {
  activa: boolean
  depurar: boolean
  escalaAncho: number
  escalaLargo: number
  /** Máscara de bits de las capas que se pintan (1 fondo, 2 detalle, 4 realces). */
  capas: number
  /** Cronometra cada sección en la GPU (desarrollo; ver `medidorGpu.ts`). */
  medir: boolean
}

/**
 * Pase de pintura: repinta la imagen de la escena con pinceladas. Va al final de la cadena de
 * posproceso (después del tono), así que recibe la imagen ya revelada y la entrega al lienzo:
 *
 * 1. Reducciones a 1/4 (análisis) y a 1/2 (el color que ven los pinceles).
 * 2. Tensor de estructura → desenfoque fino (con memoria en el tiempo) → desenfoque suave → escala
 *    gruesa. Dos campos de flujo: el suave para el pincel grueso y el fino para los pinceles
 *    pequeños; ambos con remolinos en el cielo vacío, círculos alrededor del agujero y de las
 *    estrellas pintadas.
 * 3. Color de pintura (paleta de Van Gogh, cielo nocturno y estrellas), base del lienzo y tres
 *    capas de pinceladas curvas: fondo, detalle y realces de luz.
 * 4. Salida a pantalla con viñeta.
 */
export class PasoPintura extends Pass {
  readonly ajustes: AjustesPintura = {
    activa: true,
    depurar: false,
    escalaAncho: 1,
    escalaLargo: 1,
    capas: 7,
    medir: false,
  }
  private medidor: MedidorGpu | null = null
  /** Cámara de la escena: ancla el cielo pintado a la esfera celeste y sitúa el agujero. */
  camara: THREE.Camera | null = null
  /**
   * Cuánto del cielo abierto se pinta como cielo nocturno (0–1). Dentro del horizonte, antes de
   * que aparezca el agujero de gusano, la oscuridad es oscuridad, no cielo.
   */
  cieloPintado = 1
  /** Oscurecimiento máximo de las esquinas. */
  vineta = 0.38
  /** Luz rasante sobre el empaste: fuerza del relieve, cuánto sombrea y brillo del óleo. */
  relieve = { fuerza: 1.4, sombreado: 0.7, brillo: 0.09 }

  private readonly escenaQuad = new THREE.Scene()
  private readonly camaraQuad = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly geometriaQuad = new THREE.PlaneGeometry(2, 2)
  private readonly quad: THREE.Mesh

  private readonly reducida = objetivo(2, 2)
  private readonly reducidaMedia = objetivo(2, 2)
  private readonly tensor = objetivo(2, 2)
  private readonly tensorIntermedio = objetivo(2, 2)
  /** Tensor con desenfoque fino y memoria en el tiempo (ping-pong). */
  private readonly historia = [objetivo(2, 2), objetivo(2, 2)] as const
  private readonly tensorSuave = objetivo(2, 2)
  private readonly gruesoA = objetivo(2, 2)
  private readonly gruesoB = objetivo(2, 2)
  private readonly flujo = objetivo(2, 2)
  private readonly flujoFino = objetivo(2, 2)
  /** Cielo pintado a 1/4: [0] color (A: corriente), [1] dirección de los remolinos. */
  private readonly cielo = objetivo(2, 2, THREE.LinearFilter, 2)
  private readonly pintura = objetivo(2, 2)
  /** Preparación de los pinceles finos: [0] realces, [1] detalle (ver PINCELES_FRAG). */
  private readonly pinceles = objetivo(2, 2, THREE.LinearFilter, 2)
  /** Lienzo: [0] color, [1] grosor de la pintura (empaste). */
  private readonly lienzo = objetivo(2, 2, THREE.LinearFilter, 2)
  private readonly visibilidadEstrellas = objetivo(ESTRELLAS_PINTADAS.maximoVisibles, 1, THREE.NearestFilter)

  private readonly estrellas = generarEstrellasPintadas()
  private readonly uCamara = {
    uProyInversa: { value: new THREE.Matrix4() },
    uCamaraMundo: { value: new THREE.Matrix4() },
  }
  private readonly uEstrellas = {
    uEstrellas: { value: Array.from({ length: ESTRELLAS_PINTADAS.maximoVisibles }, () => new THREE.Vector4()) },
    uNumEstrellas: { value: 0 },
    uVisibilidadEstrellas: { value: this.visibilidadEstrellas.texture },
  }
  private readonly uAgujero = { value: new THREE.Vector4() }

  private readonly matReducir: THREE.ShaderMaterial
  private readonly matTensor: THREE.ShaderMaterial
  private readonly matDesenfoque: THREE.ShaderMaterial
  private readonly matPromedio: THREE.ShaderMaterial
  private readonly matVisibilidad: THREE.ShaderMaterial
  private readonly matFlujo: THREE.ShaderMaterial
  private readonly matCielo: THREE.ShaderMaterial
  private readonly matPaleta: THREE.ShaderMaterial
  private readonly matPinceles: THREE.ShaderMaterial
  private readonly matBase: THREE.ShaderMaterial
  private readonly matFinal: THREE.ShaderMaterial

  private capas: Capa[] = []
  private indiceHistoria = 0
  private conHistoria = false
  private anchoActual = 0
  private altoActual = 0
  private tiempo = 0
  private readonly auxiliar = new THREE.Vector3()

  constructor() {
    super('PasoPintura')
    this.needsSwap = true
    // La profundidad de la escena separa el cielo abierto de lo que tiene cuerpo.
    this.needsDepthTexture = true

    this.matReducir = material(REDUCIR_FRAG, { uEntrada: { value: null }, uTexelEntrada: { value: new THREE.Vector2() } })
    this.matTensor = material(TENSOR_FRAG, { uReducida: { value: this.reducida.texture }, uTexel: { value: new THREE.Vector2() } })
    this.matDesenfoque = material(DESENFOQUE_FRAG, {
      uEntrada: { value: null },
      uPaso: { value: new THREE.Vector2() },
      uHistoria: { value: null },
      uMezcla: { value: 1 },
    })
    this.matPromedio = material(PROMEDIO_FRAG, { uEntrada: { value: null }, uTexelEntrada: { value: new THREE.Vector2() } })
    this.matVisibilidad = material(VISIBILIDAD_ESTRELLAS_FRAG, {
      uEstrellas: this.uEstrellas.uEstrellas,
      uNumEstrellas: this.uEstrellas.uNumEstrellas,
      uProfundidad: { value: null },
      uReducida: { value: this.reducida.texture },
      uCieloPintado: { value: 1 },
      uAspecto: { value: 1 },
    })
    this.matFlujo = material(FLUJO_FRAG, {
      uTensor: { value: null },
      uTensorGrueso: { value: this.gruesoA.texture },
      uTensorFino: { value: null },
      uPesoGrueso: { value: ANALISIS_FLUJO.pesoGrueso },
      uAgujero: this.uAgujero,
      uAspecto: { value: 1 },
      uFuerzaMinima: { value: ANALISIS_FLUJO.fuerzaMinima },
      uFuerzaPlena: { value: ANALISIS_FLUJO.fuerzaPlena },
      uRemolino: { value: this.cielo.textures[1] },
      ...this.uEstrellas,
    })
    this.matCielo = material(CIELO_FRAG, { uTexel: { value: new THREE.Vector2() }, ...this.uCamara })
    this.matPaleta = material(PALETA_FRAG, {
      uReducida: { value: this.reducidaMedia.texture },
      uProfundidad: { value: null },
      uTexelEntrada: { value: new THREE.Vector2() },
      uCieloPintado: { value: 1 },
      uAspecto: { value: 1 },
      uCielo: { value: this.cielo.textures[0] },
      ...this.uEstrellas,
    })
    this.matPinceles = material(PINCELES_FRAG, {
      uEntrada: { value: null },
      uReducidaMedia: { value: this.reducidaMedia.texture },
      uPintura: { value: this.pintura.texture },
      uTexelEntrada: { value: new THREE.Vector2() },
      uTexelMedia: { value: new THREE.Vector2() },
    })
    this.matBase = material(BASE_FRAG, {
      uPintura: { value: this.pintura.texture },
      uResolucion: { value: new THREE.Vector2() },
      uPeriodoTela: { value: 4 },
    })
    this.matFinal = material(FINAL_FRAG, {
      uLienzo: { value: this.lienzo.texture },
      uAPantalla: { value: 1 },
      uEntradaLineal: { value: 0 },
      uAspecto: { value: 1 },
      uVineta: { value: this.vineta },
      uAltura: { value: this.lienzo.textures[1] },
      uTexel: { value: new THREE.Vector2() },
      uPasoRelieve: { value: 1 },
      uRelieve: { value: this.relieve.fuerza },
      uSombreado: { value: this.relieve.sombreado },
      uBrillo: { value: this.relieve.brillo },
    })

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

    const r = ANALISIS_FLUJO.reduccion
    const anchoR = Math.max(2, Math.round(ancho / r))
    const altoR = Math.max(2, Math.round(alto / r))
    for (const rt of [this.reducida, this.tensor, this.tensorIntermedio, ...this.historia, this.tensorSuave, this.flujo, this.flujoFino, this.cielo])
      rt.setSize(anchoR, altoR)
    ;(this.matCielo.uniforms.uTexel.value as THREE.Vector2).set(1 / anchoR, 1 / altoR)
    const anchoG = Math.max(2, Math.round(anchoR / 4))
    const altoG = Math.max(2, Math.round(altoR / 4))
    this.gruesoA.setSize(anchoG, altoG)
    this.gruesoB.setSize(anchoG, altoG)
    const anchoM = Math.max(2, Math.round(ancho / 2))
    const altoM = Math.max(2, Math.round(alto / 2))
    this.reducidaMedia.setSize(anchoM, altoM)
    this.pintura.setSize(anchoM, altoM)
    this.pinceles.setSize(anchoM, altoM)
    ;(this.matPinceles.uniforms.uTexelEntrada.value as THREE.Vector2).set(1 / ancho, 1 / alto)
    ;(this.matPinceles.uniforms.uTexelMedia.value as THREE.Vector2).set(1 / anchoM, 1 / altoM)
    this.lienzo.setSize(ancho, alto)
    this.conHistoria = false

    ;(this.matTensor.uniforms.uTexel.value as THREE.Vector2).set(1 / anchoR, 1 / altoR)
    this.matFlujo.uniforms.uAspecto.value = ancho / alto
    ;(this.matPaleta.uniforms.uTexelEntrada.value as THREE.Vector2).set(0.5 / ancho, 0.5 / alto)
    this.matPaleta.uniforms.uAspecto.value = ancho / alto
    this.matVisibilidad.uniforms.uAspecto.value = ancho / alto
    this.matFinal.uniforms.uAspecto.value = ancho / alto
    ;(this.matFinal.uniforms.uTexel.value as THREE.Vector2).set(1 / ancho, 1 / alto)
    // La luz lee el relieve a la escala de los trazos (que se miden en fracciones de la altura).
    this.matFinal.uniforms.uPasoRelieve.value = Math.max(1, alto / 720)
    ;(this.matBase.uniforms.uResolucion.value as THREE.Vector2).set(ancho, alto)
    this.matBase.uniforms.uPeriodoTela.value = Math.max(3, 0.0045 * alto)

    this.reconstruirCapas()
  }

  /** Una rejilla de anclas por capa, con una pincelada por celda en orden aleatorio. */
  private reconstruirCapas(): void {
    for (const capa of this.capas) {
      capa.geometria.dispose()
      capa.material.dispose()
      capa.tira.dispose()
    }
    const ancho = this.anchoActual
    const alto = this.altoActual
    this.capas = CAPAS_PINCELADAS.map((definicion, indice) => {
      const celda = Math.max(2, definicion.espaciado * alto)
      const columnas = Math.ceil(ancho / celda) + 2
      const filas = Math.ceil(alto / celda) + 2
      const total = columnas * filas
      const orden = Array.from({ length: total }, (_, i) => i)
      const azar = generador(7919 * (indice + 1))
      for (let i = total - 1; i > 0; i--) {
        const j = Math.floor(azar() * (i + 1))
        ;[orden[i], orden[j]] = [orden[j], orden[i]]
      }
      const anclas = new Float32Array(total * 2)
      const semillas = new Float32Array(total * 4)
      orden.forEach((celdaIndice, k) => {
        const columna = (celdaIndice % columnas) - 1
        const fila = Math.floor(celdaIndice / columnas) - 1
        anclas[2 * k] = ((columna + azar()) * celda) / ancho
        anclas[2 * k + 1] = ((fila + azar()) * celda) / alto
        for (let c = 0; c < 4; c++) semillas[4 * k + c] = azar()
      })

      const tira = crearTira(definicion.secciones)
      const geometria = new THREE.InstancedBufferGeometry()
      geometria.index = tira.index
      geometria.setAttribute('position', tira.getAttribute('position'))
      geometria.setAttribute('aAncla', new THREE.InstancedBufferAttribute(anclas, 2))
      geometria.setAttribute('aSemilla', new THREE.InstancedBufferAttribute(semillas, 4))
      geometria.instanceCount = total

      const materialCapa = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: PINCELADA_VERT,
        fragmentShader: PINCELADA_FRAG,
        uniforms: {
          uFlujo: { value: definicion.flujoFino ? this.flujoFino.texture : this.flujo.texture },
          uColor: { value: this.pintura.texture },
          uTexelColor: { value: new THREE.Vector2(1 / this.pintura.width, 1 / this.pintura.height) },
          uRealces: { value: this.pinceles.textures[0] },
          uDetalle: { value: this.pinceles.textures[1] },
          uAgujero: this.uAgujero,
          uModo: { value: definicion.modo },
          uDifuminado: { value: definicion.difuminado },
          uUmbralDetalle: { value: definicion.umbralDetalle },
          uResolucion: { value: new THREE.Vector2(ancho, alto) },
          uAncho: { value: definicion.ancho * alto },
          uLargo: { value: definicion.largo * alto },
          uVariacion: { value: definicion.variacion },
          uDesvio: { value: definicion.desvio },
          uPasos: { value: definicion.pasos },
          uDepurar: { value: 0 },
        },
        depthTest: false,
        depthWrite: false,
        // La tira se curva y puede girar sobre sí misma: ninguna cara se descarta.
        side: THREE.DoubleSide,
        transparent: true,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.OneFactor,
        blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      })
      const malla = new THREE.Mesh(geometria, materialCapa)
      malla.frustumCulled = false
      const escena = new THREE.Scene()
      escena.add(malla)
      return { definicion, tira, geometria, material: materialCapa, escena }
    })
  }

  override setDepthTexture(textura: THREE.Texture): void {
    this.matPaleta.uniforms.uProfundidad.value = textura
    this.matVisibilidad.uniforms.uProfundidad.value = textura
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

  /**
   * El agujero en pantalla (centro y radio de la sombra en fracción de la altura) para el
   * remolino del flujo. Sólo de lejos: cuando la sombra ocupa media pantalla, la forma del disco
   * ya orienta los trazos y un remolino de pantalla sólo la estorbaría.
   */
  private situarAgujero(camara: THREE.Camera): void {
    const distancia = camara.position.length()
    const perspectiva = camara instanceof THREE.PerspectiveCamera ? camara : null
    if (!perspectiva || distancia < 1.3) {
      this.uAgujero.value.set(0.5, 0.5, 0.1, 0)
      return
    }
    const p = this.auxiliar.set(0, 0, 0).project(perspectiva)
    const angulo = Math.asin(Math.min(1, (RADIO_SOMBRA * Math.sqrt(Math.max(0, 1 - 1 / distancia))) / distancia))
    const radio = (0.5 * Math.tan(angulo)) / Math.tan(THREE.MathUtils.degToRad(perspectiva.fov) / 2)
    const delante = p.z < 1 ? 1 : 0
    this.uAgujero.value.set(0.5 + 0.5 * p.x, 0.5 + 0.5 * p.y, radio, delante * (1 - suavizar(0.12, 0.25, radio)))
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
    this.matFinal.uniforms.uAPantalla.value = this.renderToScreen ? 1 : 0

    if (!this.ajustes.activa) {
      // Sin pintura (comparación en desarrollo): la imagen de la escena tal cual.
      this.matFinal.uniforms.uLienzo.value = inputBuffer.texture
      this.matFinal.uniforms.uEntradaLineal.value = 1
      this.dibujar(renderer, this.matFinal, destino)
      this.matFinal.uniforms.uLienzo.value = this.lienzo.texture
      this.matFinal.uniforms.uEntradaLineal.value = 0
      renderer.autoClear = limpiezaPrevia
      return
    }

    const paso = Math.min(Math.max(deltaTime, 0), 0.25)
    this.tiempo += paso
    if (this.ajustes.medir && !this.medidor) this.medidor = new MedidorGpu(renderer.getContext() as WebGL2RenderingContext)
    const medidor = this.ajustes.medir ? this.medidor : null
    medidor?.recoger()
    medidor?.inicio('analisis')
    const camara = this.camara
    if (camara) {
      camara.updateMatrixWorld()
      this.uCamara.uProyInversa.value.copy(camara.projectionMatrixInverse)
      this.uCamara.uCamaraMundo.value.copy(camara.matrixWorld)
      this.situarAgujero(camara)
    }
    const cieloPintado = this.matPaleta.uniforms.uProfundidad.value ? this.cieloPintado : 0
    this.matPaleta.uniforms.uCieloPintado.value = cieloPintado
    this.matVisibilidad.uniforms.uCieloPintado.value = cieloPintado
    this.matFinal.uniforms.uVineta.value = this.vineta
    this.matFinal.uniforms.uRelieve.value = this.relieve.fuerza
    this.matFinal.uniforms.uSombreado.value = this.relieve.sombreado
    this.matFinal.uniforms.uBrillo.value = this.relieve.brillo

    const anchoR = this.reducida.width
    const altoR = this.reducida.height

    // 1. Reducciones.
    this.reducir(renderer, inputBuffer.texture, { x: 1 / this.anchoActual, y: 1 / this.altoActual }, this.reducida)
    this.reducir(renderer, inputBuffer.texture, { x: 0.5 / this.anchoActual, y: 0.5 / this.altoActual }, this.reducidaMedia)

    // 2. Tensor: desenfoque fino con memoria, suave, grueso.
    this.dibujar(renderer, this.matTensor, this.tensor)
    this.desenfocar(renderer, this.tensor, { x: 1 / anchoR, y: 0 }, this.tensorIntermedio)
    const previa = this.historia[this.indiceHistoria]
    const fino = this.historia[1 - this.indiceHistoria]
    const mezcla = this.conHistoria ? 1 - Math.exp(-paso / ANALISIS_FLUJO.tauTemporal) : 1
    this.desenfocar(renderer, this.tensorIntermedio, { x: 0, y: 1 / altoR }, fino, previa, mezcla)
    this.indiceHistoria = 1 - this.indiceHistoria
    this.conHistoria = true
    const pasoSuave = ANALISIS_FLUJO.pasoDesenfoque
    this.desenfocar(renderer, fino, { x: pasoSuave / anchoR, y: 0 }, this.tensorIntermedio)
    this.desenfocar(renderer, this.tensorIntermedio, { x: 0, y: pasoSuave / altoR }, this.tensorSuave)
    this.matPromedio.uniforms.uEntrada.value = this.tensorSuave.texture
    ;(this.matPromedio.uniforms.uTexelEntrada.value as THREE.Vector2).set(1 / anchoR, 1 / altoR)
    this.dibujar(renderer, this.matPromedio, this.gruesoA)
    const pasoGrueso = ANALISIS_FLUJO.pasoDesenfoqueGrueso
    this.desenfocar(renderer, this.gruesoA, { x: pasoGrueso / this.gruesoA.width, y: 0 }, this.gruesoB)
    this.desenfocar(renderer, this.gruesoB, { x: 0, y: pasoGrueso / this.gruesoA.height }, this.gruesoA)

    // Estrellas pintadas: proyección y visibilidad (antes del flujo, que gira alrededor de ellas).
    this.uEstrellas.uNumEstrellas.value =
      camara && cieloPintado > 0
        ? proyectarEstrellas(this.estrellas, camara, this.tiempo, this.anchoActual / this.altoActual, this.uEstrellas.uEstrellas.value)
        : 0
    this.dibujar(renderer, this.matVisibilidad, this.visibilidadEstrellas)

    // Cielo pintado y dirección de sus remolinos (una vez por fotograma, a 1/4).
    this.dibujar(renderer, this.matCielo, this.cielo)

    // Flujos: suave (pincel grueso) y fino (pinceles pequeños).
    const uf = this.matFlujo.uniforms
    uf.uTensorFino.value = fino.texture
    uf.uTensor.value = this.tensorSuave.texture
    uf.uPesoGrueso.value = ANALISIS_FLUJO.pesoGrueso
    this.dibujar(renderer, this.matFlujo, this.flujo)
    uf.uTensor.value = fino.texture
    uf.uPesoGrueso.value = 0.5 * ANALISIS_FLUJO.pesoGrueso
    this.dibujar(renderer, this.matFlujo, this.flujoFino)

    medidor?.fin()

    // 3. Color de pintura, base y pinceladas.
    medidor?.inicio('paleta')
    this.dibujar(renderer, this.matPaleta, this.pintura)
    medidor?.fin()
    medidor?.inicio('pinceles')
    this.matPinceles.uniforms.uEntrada.value = inputBuffer.texture
    this.dibujar(renderer, this.matPinceles, this.pinceles)
    medidor?.fin()
    medidor?.inicio('base')
    this.dibujar(renderer, this.matBase, this.lienzo)
    medidor?.fin()
    for (const [indice, capa] of this.capas.entries()) {
      if ((this.ajustes.capas & (1 << indice)) === 0) continue
      const u = capa.material.uniforms
      u.uAncho.value = capa.definicion.ancho * this.altoActual * this.ajustes.escalaAncho
      u.uLargo.value = capa.definicion.largo * this.altoActual * this.ajustes.escalaLargo
      u.uDepurar.value = this.ajustes.depurar ? 1 : 0
      medidor?.inicio(`capa ${capa.definicion.nombre}`)
      renderer.setRenderTarget(this.lienzo)
      renderer.render(capa.escena, this.camaraQuad)
      medidor?.fin()
    }

    // 4. Salida.
    medidor?.inicio('final')
    this.dibujar(renderer, this.matFinal, destino)
    medidor?.fin()
    renderer.autoClear = limpiezaPrevia
  }

  override dispose(): void {
    for (const capa of this.capas) {
      capa.geometria.dispose()
      capa.material.dispose()
      capa.tira.dispose()
    }
    this.capas = []
    for (const rt of [
      this.reducida,
      this.reducidaMedia,
      this.tensor,
      this.tensorIntermedio,
      ...this.historia,
      this.tensorSuave,
      this.gruesoA,
      this.gruesoB,
      this.flujo,
      this.flujoFino,
      this.cielo,
      this.pintura,
      this.pinceles,
      this.lienzo,
      this.visibilidadEstrellas,
    ])
      rt.dispose()
    for (const m of [
      this.matReducir,
      this.matTensor,
      this.matDesenfoque,
      this.matPromedio,
      this.matVisibilidad,
      this.matFlujo,
      this.matCielo,
      this.matPaleta,
      this.matPinceles,
      this.matBase,
      this.matFinal,
    ])
      m.dispose()
    this.geometriaQuad.dispose()
  }
}
