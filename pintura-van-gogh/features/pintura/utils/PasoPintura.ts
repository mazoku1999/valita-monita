import { Pass } from 'postprocessing'
import * as THREE from 'three'
import { ANALISIS_FLUJO, CAPAS_PINCELADAS, type CapaPinceladas } from '../constantes/pinceladas'
import {
  BASE_FRAG,
  DESENFOQUE_FRAG,
  FINAL_FRAG,
  FLUJO_FRAG,
  PANTALLA_VERT,
  PINCELADA_FRAG,
  PALETA_FRAG,
  PINCELADA_VERT,
  PROMEDIO_FRAG,
  REDUCIR_FRAG,
  TENSOR_FRAG,
} from '../shaders/pintura'

/** Secciones de la tira de cada pincelada (8 tramos: curvas suaves sin disparar los vértices). */
const SECCIONES = 9

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

const objetivo = (ancho: number, alto: number): THREE.WebGLRenderTarget =>
  new THREE.WebGLRenderTarget(ancho, alto, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
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

/** Tira base de una pincelada: (fracción a lo largo, lado). */
const crearTira = (): THREE.BufferGeometry => {
  const posiciones: number[] = []
  const indices: number[] = []
  for (let i = 0; i < SECCIONES; i++) {
    const u = i / (SECCIONES - 1)
    posiciones.push(u, -1, 0, u, 1, 0)
  }
  for (let i = 0; i < SECCIONES - 1; i++) {
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
  geometria: THREE.InstancedBufferGeometry
  material: THREE.ShaderMaterial
  malla: THREE.Mesh
  escena: THREE.Scene
}

/** Parámetros ajustables en caliente (claves de desarrollo en la URL, ver `vistaCamaraStore`). */
export interface AjustesPintura {
  activa: boolean
  depurar: boolean
  escalaAncho: number
  escalaLargo: number
}

/**
 * Pase de pintura: repinta la imagen de la escena con pinceladas. Va al final de la cadena de
 * posproceso (después del tono), así que recibe la imagen ya revelada y la entrega al lienzo:
 *
 * 1. Reducción a 1/4 en sRGB (el color medio que ve el pintor).
 * 2. Tensor de estructura → desenfoque gaussiano ancho → suavizado temporal → campo de flujo
 *    (dirección a lo largo de las formas y remolinos donde no las hay).
 * 3. Base del lienzo y, encima, las capas de pinceladas curvas que siguen el flujo.
 * 4. Salida a pantalla.
 */
export class PasoPintura extends Pass {
  readonly ajustes: AjustesPintura = { activa: true, depurar: false, escalaAncho: 1, escalaLargo: 1 }
  /** Cámara de la escena: ancla el cielo pintado a la esfera celeste. */
  camara: THREE.Camera | null = null
  /**
   * Cuánto del cielo abierto se pinta como cielo nocturno (0–1). Dentro del horizonte, antes de
   * que aparezca el agujero de gusano, la oscuridad es oscuridad, no cielo.
   */
  cieloPintado = 1
  /** Oscurecimiento máximo de las esquinas. */
  vineta = 0.38

  private readonly quad: THREE.Mesh
  private readonly escenaQuad = new THREE.Scene()
  private readonly camaraQuad = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly geometriaQuad = new THREE.PlaneGeometry(2, 2)
  private readonly tira = crearTira()

  private readonly reducida = objetivo(2, 2)
  private readonly tensor = objetivo(2, 2)
  private readonly tensorIntermedio = objetivo(2, 2)
  private readonly historia = [objetivo(2, 2), objetivo(2, 2)] as const
  private readonly gruesoA = objetivo(2, 2)
  private readonly gruesoB = objetivo(2, 2)
  private readonly flujo = objetivo(2, 2)
  private readonly pintura = objetivo(2, 2)
  private readonly lienzo = objetivo(2, 2)
  private readonly uCamara = {
    uProyInversa: { value: new THREE.Matrix4() },
    uCamaraMundo: { value: new THREE.Matrix4() },
  }

  private readonly matReducir: THREE.ShaderMaterial
  private readonly matTensor: THREE.ShaderMaterial
  private readonly matDesenfoqueH: THREE.ShaderMaterial
  private readonly matDesenfoqueV: THREE.ShaderMaterial
  private readonly matPromedioGrueso: THREE.ShaderMaterial
  private readonly matGruesoH: THREE.ShaderMaterial
  private readonly matGruesoV: THREE.ShaderMaterial
  private readonly matFlujo: THREE.ShaderMaterial
  private readonly matPaleta: THREE.ShaderMaterial
  private readonly matBase: THREE.ShaderMaterial
  private readonly matFinal: THREE.ShaderMaterial

  private capas: Capa[] = []
  private indiceHistoria = 0
  private conHistoria = false
  private anchoActual = 0
  private altoActual = 0

  constructor() {
    super('PasoPintura')
    this.needsSwap = true
    // La profundidad de la escena separa el cielo abierto de lo que tiene cuerpo.
    this.needsDepthTexture = true

    this.matReducir = material(REDUCIR_FRAG, {
      uEntrada: { value: null },
      uTexelEntrada: { value: new THREE.Vector2() },
    })
    this.matTensor = material(TENSOR_FRAG, {
      uReducida: { value: this.reducida.texture },
      uTexel: { value: new THREE.Vector2() },
    })
    this.matDesenfoqueH = material(DESENFOQUE_FRAG, {
      uEntrada: { value: this.tensor.texture },
      uPaso: { value: new THREE.Vector2() },
      uHistoria: { value: null },
      uMezcla: { value: 1 },
    })
    this.matDesenfoqueV = material(DESENFOQUE_FRAG, {
      uEntrada: { value: this.tensorIntermedio.texture },
      uPaso: { value: new THREE.Vector2() },
      uHistoria: { value: null },
      uMezcla: { value: 1 },
    })
    this.matPromedioGrueso = material(PROMEDIO_FRAG, {
      uEntrada: { value: null },
      uTexelEntrada: { value: new THREE.Vector2() },
    })
    this.matGruesoH = material(DESENFOQUE_FRAG, {
      uEntrada: { value: this.gruesoA.texture },
      uPaso: { value: new THREE.Vector2() },
      uHistoria: { value: null },
      uMezcla: { value: 1 },
    })
    this.matGruesoV = material(DESENFOQUE_FRAG, {
      uEntrada: { value: this.gruesoB.texture },
      uPaso: { value: new THREE.Vector2() },
      uHistoria: { value: null },
      uMezcla: { value: 1 },
    })
    this.matFlujo = material(FLUJO_FRAG, {
      uTensor: { value: null },
      uTensorGrueso: { value: this.gruesoA.texture },
      uPesoGrueso: { value: ANALISIS_FLUJO.pesoGrueso },
      uAspecto: { value: 1 },
      uTexel: { value: new THREE.Vector2() },
      ...this.uCamara,
      uFuerzaMinima: { value: ANALISIS_FLUJO.fuerzaMinima },
      uFuerzaPlena: { value: ANALISIS_FLUJO.fuerzaPlena },
    })
    this.matPaleta = material(PALETA_FRAG, {
      uReducida: { value: this.reducida.texture },
      uProfundidad: { value: null },
      uTexelEntrada: { value: new THREE.Vector2() },
      uCieloPintado: { value: 1 },
      ...this.uCamara,
    })
    this.matBase = material(BASE_FRAG, { uPintura: { value: this.pintura.texture } })
    this.matFinal = material(FINAL_FRAG, {
      uLienzo: { value: this.lienzo.texture },
      uAPantalla: { value: 1 },
      uEntradaLineal: { value: 0 },
      uAspecto: { value: 1 },
      uVineta: { value: this.vineta },
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
    this.reducida.setSize(anchoR, altoR)
    this.tensor.setSize(anchoR, altoR)
    this.tensorIntermedio.setSize(anchoR, altoR)
    this.historia[0].setSize(anchoR, altoR)
    this.historia[1].setSize(anchoR, altoR)
    this.flujo.setSize(anchoR, altoR)
    this.pintura.setSize(anchoR, altoR)
    const anchoG = Math.max(2, Math.round(anchoR / 4))
    const altoG = Math.max(2, Math.round(altoR / 4))
    this.gruesoA.setSize(anchoG, altoG)
    this.gruesoB.setSize(anchoG, altoG)
    this.lienzo.setSize(ancho, alto)
    this.conHistoria = false
    ;(this.matPromedioGrueso.uniforms.uTexelEntrada.value as THREE.Vector2).set(1 / anchoR, 1 / altoR)
    const pasoG = ANALISIS_FLUJO.pasoDesenfoqueGrueso
    ;(this.matGruesoH.uniforms.uPaso.value as THREE.Vector2).set(pasoG / anchoG, 0)
    ;(this.matGruesoV.uniforms.uPaso.value as THREE.Vector2).set(0, pasoG / altoG)

    ;(this.matReducir.uniforms.uTexelEntrada.value as THREE.Vector2).set(1 / ancho, 1 / alto)
    ;(this.matTensor.uniforms.uTexel.value as THREE.Vector2).set(1 / anchoR, 1 / altoR)
    const paso = ANALISIS_FLUJO.pasoDesenfoque
    ;(this.matDesenfoqueH.uniforms.uPaso.value as THREE.Vector2).set(paso / anchoR, 0)
    ;(this.matDesenfoqueV.uniforms.uPaso.value as THREE.Vector2).set(0, paso / altoR)
    this.matFlujo.uniforms.uAspecto.value = ancho / alto
    ;(this.matFlujo.uniforms.uTexel.value as THREE.Vector2).set(1 / anchoR, 1 / altoR)
    ;(this.matPaleta.uniforms.uTexelEntrada.value as THREE.Vector2).set(1 / ancho, 1 / alto)
    this.matFinal.uniforms.uAspecto.value = ancho / alto

    this.reconstruirCapas()
  }

  /** Una rejilla de anclas por capa, con una pincelada por celda en orden aleatorio. */
  private reconstruirCapas(): void {
    for (const capa of this.capas) {
      capa.geometria.dispose()
      capa.material.dispose()
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

      const geometria = new THREE.InstancedBufferGeometry()
      geometria.index = this.tira.index
      geometria.setAttribute('position', this.tira.getAttribute('position'))
      geometria.setAttribute('aAncla', new THREE.InstancedBufferAttribute(anclas, 2))
      geometria.setAttribute('aSemilla', new THREE.InstancedBufferAttribute(semillas, 4))
      geometria.instanceCount = total

      const materialCapa = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: PINCELADA_VERT,
        fragmentShader: PINCELADA_FRAG,
        uniforms: {
          uFlujo: { value: this.flujo.texture },
          uColor: { value: this.pintura.texture },
          uResolucion: { value: new THREE.Vector2(ancho, alto) },
          uAncho: { value: definicion.ancho * alto },
          uLargo: { value: definicion.largo * alto },
          uVariacion: { value: definicion.variacion },
          uDesvio: { value: definicion.desvio },
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
      return { definicion, geometria, material: materialCapa, malla, escena }
    })
  }

  override setDepthTexture(textura: THREE.Texture): void {
    this.matPaleta.uniforms.uProfundidad.value = textura
  }

  private dibujar(renderer: THREE.WebGLRenderer, materialQuad: THREE.ShaderMaterial, destino: THREE.WebGLRenderTarget | null): void {
    this.quad.material = materialQuad
    renderer.setRenderTarget(destino)
    renderer.render(this.escenaQuad, this.camaraQuad)
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

    const camara = this.camara
    if (camara) {
      camara.updateMatrixWorld()
      this.uCamara.uProyInversa.value.copy(camara.projectionMatrixInverse)
      this.uCamara.uCamaraMundo.value.copy(camara.matrixWorld)
    }
    this.matPaleta.uniforms.uCieloPintado.value = this.matPaleta.uniforms.uProfundidad.value ? this.cieloPintado : 0
    this.matFinal.uniforms.uVineta.value = this.vineta

    // 1. Reducción.
    this.matReducir.uniforms.uEntrada.value = inputBuffer.texture
    this.dibujar(renderer, this.matReducir, this.reducida)

    // 2. Tensor, desenfoque y suavizado temporal, flujo.
    this.dibujar(renderer, this.matTensor, this.tensor)
    this.dibujar(renderer, this.matDesenfoqueH, this.tensorIntermedio)
    const previa = this.historia[this.indiceHistoria]
    const actual = this.historia[1 - this.indiceHistoria]
    this.matDesenfoqueV.uniforms.uHistoria.value = previa.texture
    this.matDesenfoqueV.uniforms.uMezcla.value = this.conHistoria
      ? 1 - Math.exp(-Math.min(Math.max(deltaTime, 0), 0.25) / ANALISIS_FLUJO.tauTemporal)
      : 1
    this.dibujar(renderer, this.matDesenfoqueV, actual)
    this.indiceHistoria = 1 - this.indiceHistoria
    this.conHistoria = true
    // Escala gruesa: la forma grande que orienta el pincel donde no hay detalle.
    this.matPromedioGrueso.uniforms.uEntrada.value = actual.texture
    this.dibujar(renderer, this.matPromedioGrueso, this.gruesoA)
    this.dibujar(renderer, this.matGruesoH, this.gruesoB)
    this.dibujar(renderer, this.matGruesoV, this.gruesoA)
    this.matFlujo.uniforms.uTensor.value = actual.texture
    this.dibujar(renderer, this.matFlujo, this.flujo)

    // 3. Color de pintura (paleta y cielo nocturno), base y pinceladas.
    this.dibujar(renderer, this.matPaleta, this.pintura)
    this.dibujar(renderer, this.matBase, this.lienzo)
    for (const capa of this.capas) {
      const u = capa.material.uniforms
      u.uAncho.value = capa.definicion.ancho * this.altoActual * this.ajustes.escalaAncho
      u.uLargo.value = capa.definicion.largo * this.altoActual * this.ajustes.escalaLargo
      u.uDepurar.value = this.ajustes.depurar ? 1 : 0
      renderer.setRenderTarget(this.lienzo)
      renderer.render(capa.escena, this.camaraQuad)
    }

    // 4. Salida.
    this.dibujar(renderer, this.matFinal, destino)
    renderer.autoClear = limpiezaPrevia
  }

  override dispose(): void {
    for (const capa of this.capas) {
      capa.geometria.dispose()
      capa.material.dispose()
    }
    this.capas = []
    for (const rt of [
      this.reducida,
      this.tensor,
      this.tensorIntermedio,
      ...this.historia,
      this.gruesoA,
      this.gruesoB,
      this.flujo,
      this.pintura,
      this.lienzo,
    ])
      rt.dispose()
    for (const m of [
      this.matReducir,
      this.matTensor,
      this.matDesenfoqueH,
      this.matDesenfoqueV,
      this.matPromedioGrueso,
      this.matGruesoH,
      this.matGruesoV,
      this.matFlujo,
      this.matPaleta,
      this.matBase,
      this.matFinal,
    ])
      m.dispose()
    this.geometriaQuad.dispose()
    this.tira.dispose()
  }
}
