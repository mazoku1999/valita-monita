import * as THREE from 'three'
import { AGUA_INTERIOR, DESIERTOS, HIELO, POBLACION, TIERRA_FIRME, type Poligono } from '../datos/continentes'

/**
 * Mapas de la Tierra pintados en lienzos a partir de `datos/continentes.ts` (proyección
 * equirectangular: x = longitud, y = latitud, el norte arriba). No hay imágenes: el mapa
 * RGB lleva tierra firme (R), aridez (G) y hielo (B), cada canal con su difuminado, y el de
 * población es una luminancia con manchas suaves. El shader de la Tierra los combina con ruido
 * para dibujar costas fractales, desiertos, bosques, casquetes y las luces de las ciudades.
 */
const ANCHO = 2048
const ALTO = 1024
/** Población: manchas radiales sumadas (1024×512 basta: el shader las rompe en ciudades). */
const ANCHO_POBLACION = 1024
const ALTO_POBLACION = 512

/** Lo que tienen en común el lienzo de la página y el de fuera de pantalla (el del hilo aparte). */
type Contexto2D = CanvasPath & CanvasDrawPath & CanvasFillStrokeStyles & CanvasRect & CanvasImageData & CanvasCompositing

/**
 * Un lienzo para pintar y leer sus píxeles: en el hilo aparte (ver `features/segundo-plano`), uno
 * fuera de pantalla; en la página, uno del documento.
 */
const crearLienzo = (ancho: number, alto: number): Contexto2D => {
  let contexto: Contexto2D | null
  if (typeof document === 'undefined') {
    contexto = new OffscreenCanvas(ancho, alto).getContext('2d', { willReadFrequently: true })
  } else {
    const lienzo = document.createElement('canvas')
    lienzo.width = ancho
    lienzo.height = alto
    contexto = lienzo.getContext('2d', { willReadFrequently: true })
  }
  if (!contexto) throw new Error('Sin contexto 2D para el mapa de la Tierra')
  return contexto
}

const trazar = (contexto: Contexto2D, poligono: Poligono, ancho: number, alto: number): void => {
  contexto.beginPath()
  for (let k = 0; k < poligono.length; k += 2) {
    const x = ((poligono[k] + 180) / 360) * ancho
    const y = ((90 - poligono[k + 1]) / 180) * alto
    if (k === 0) contexto.moveTo(x, y)
    else contexto.lineTo(x, y)
  }
  contexto.closePath()
  contexto.fill()
}

/** Máscara en escala de grises (0..1) de unos polígonos, restando otros si se dan. */
const mascara = (poligonos: readonly Poligono[], restar: readonly Poligono[] = []): Float32Array => {
  const contexto = crearLienzo(ANCHO, ALTO)
  contexto.fillStyle = '#000'
  contexto.fillRect(0, 0, ANCHO, ALTO)
  contexto.fillStyle = '#fff'
  for (const poligono of poligonos) trazar(contexto, poligono, ANCHO, ALTO)
  contexto.fillStyle = '#000'
  for (const poligono of restar) trazar(contexto, poligono, ANCHO, ALTO)
  const datos = contexto.getImageData(0, 0, ANCHO, ALTO).data
  const valores = new Float32Array(ANCHO * ALTO)
  for (let i = 0; i < valores.length; i += 1) valores[i] = datos[i * 4] / 255
  return valores
}

/**
 * Difuminado de caja separable repetido (≈ gaussiano) con envoltura en longitud: sin él los
 * polígonos tendrían bordes de un píxel y las costas saldrían escalonadas.
 */
const difuminar = (valores: Float32Array, ancho: number, alto: number, radio: number, pasadas = 3): Float32Array => {
  if (radio < 1) return valores
  let origen: Float32Array = valores
  let destino: Float32Array = new Float32Array(valores.length)
  const ventana = 2 * radio + 1
  for (let pasada = 0; pasada < pasadas; pasada += 1) {
    for (let y = 0; y < alto; y += 1) {
      const fila = y * ancho
      let suma = 0
      for (let k = -radio; k <= radio; k += 1) suma += origen[fila + ((k + ancho) % ancho)]
      for (let x = 0; x < ancho; x += 1) {
        destino[fila + x] = suma / ventana
        suma += origen[fila + ((x + radio + 1) % ancho)] - origen[fila + ((x - radio + ancho) % ancho)]
      }
    }
    ;[origen, destino] = [destino, origen]
    for (let x = 0; x < ancho; x += 1) {
      let suma = 0
      for (let k = -radio; k <= radio; k += 1) suma += origen[Math.min(alto - 1, Math.max(0, k)) * ancho + x]
      for (let y = 0; y < alto; y += 1) {
        destino[y * ancho + x] = suma / ventana
        suma += origen[Math.min(alto - 1, y + radio + 1) * ancho + x] - origen[Math.max(0, y - radio) * ancho + x]
      }
    }
    ;[origen, destino] = [destino, origen]
  }
  return origen
}

/** Los píxeles RGBA de un lienzo con la fila de abajo primero (como los lee la GPU: el norte arriba). */
const deAbajoArriba = (pixeles: Uint8ClampedArray, ancho: number, alto: number): Uint8Array => {
  const datos = new Uint8Array(ancho * alto * 4)
  for (let y = 0; y < alto; y += 1) datos.set(pixeles.subarray(y * ancho * 4, (y + 1) * ancho * 4), (alto - 1 - y) * ancho * 4)
  return datos
}

/** Los mapas de la Tierra en RGBA (ver `deAbajoArriba`): se pintan en un hilo aparte. */
export interface DatosMapasTierra {
  mapa: Uint8Array
  poblacion: Uint8Array
}

export function calcularMapasTierra(): DatosMapasTierra {
  const tierra = difuminar(mascara(TIERRA_FIRME, AGUA_INTERIOR), ANCHO, ALTO, 2)
  const aridez = difuminar(mascara(DESIERTOS), ANCHO, ALTO, 22)
  const hielo = difuminar(mascara(HIELO), ANCHO, ALTO, 3)
  const mapa = new Uint8ClampedArray(ANCHO * ALTO * 4)
  for (let i = 0; i < ANCHO * ALTO; i += 1) {
    mapa[i * 4] = Math.round(255 * tierra[i])
    mapa[i * 4 + 1] = Math.round(255 * aridez[i])
    mapa[i * 4 + 2] = Math.round(255 * hielo[i])
    mapa[i * 4 + 3] = 255
  }

  const contexto = crearLienzo(ANCHO_POBLACION, ALTO_POBLACION)
  contexto.fillStyle = '#000'
  contexto.fillRect(0, 0, ANCHO_POBLACION, ALTO_POBLACION)
  contexto.globalCompositeOperation = 'lighter'
  for (let k = 0; k < POBLACION.length; k += 4) {
    const [intensidad, longitud, latitud, radio] = POBLACION.slice(k, k + 4)
    const x = ((longitud + 180) / 360) * ANCHO_POBLACION
    const y = ((90 - latitud) / 180) * ALTO_POBLACION
    const r = (radio / 360) * ANCHO_POBLACION
    const gradiente = contexto.createRadialGradient(x, y, 0, x, y, r)
    const nivel = Math.round(200 * intensidad)
    gradiente.addColorStop(0, `rgb(${nivel},${nivel},${nivel})`)
    gradiente.addColorStop(1, 'rgb(0,0,0)')
    contexto.fillStyle = gradiente
    contexto.fillRect(x - r, y - r, 2 * r, 2 * r)
  }
  const poblacion = contexto.getImageData(0, 0, ANCHO_POBLACION, ALTO_POBLACION).data

  return { mapa: deAbajoArriba(mapa, ANCHO, ALTO), poblacion: deAbajoArriba(poblacion, ANCHO_POBLACION, ALTO_POBLACION) }
}

const aTextura = (datos: Uint8Array, ancho: number, alto: number): THREE.DataTexture => {
  const textura = new THREE.DataTexture(datos, ancho, alto, THREE.RGBAFormat, THREE.UnsignedByteType)
  textura.colorSpace = THREE.NoColorSpace
  textura.wrapS = THREE.RepeatWrapping
  textura.wrapT = THREE.ClampToEdgeWrapping
  textura.minFilter = THREE.LinearMipmapLinearFilter
  textura.magFilter = THREE.LinearFilter
  textura.anisotropy = 4
  textura.generateMipmaps = true
  textura.needsUpdate = true
  return textura
}

export interface TexturasTierra {
  readonly mapa: THREE.DataTexture
  readonly poblacion: THREE.DataTexture
  readonly liberar: () => void
}

export function crearTexturasTierra(datos: DatosMapasTierra): TexturasTierra {
  const mapa = aTextura(datos.mapa, ANCHO, ALTO)
  const poblacion = aTextura(datos.poblacion, ANCHO_POBLACION, ALTO_POBLACION)
  return {
    mapa,
    poblacion,
    liberar: () => {
      mapa.dispose()
      poblacion.dispose()
    },
  }
}
