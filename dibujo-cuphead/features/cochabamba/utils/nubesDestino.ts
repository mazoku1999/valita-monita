import * as THREE from 'three'
import { RADIO_TIERRA_KM } from '../constantes/destino'
import { SOL_MANANA, direccionSol } from '../constantes/valle'
import { PISO_VALLE, alturaRegion, humedadRegion } from './region'

/**
 * Las nubes de la llegada a Cochabamba (ver `shaders/nubesBolas.ts`), con azar fijo, en km en el
 * plano de la región (x al este, y al norte, altura sobre el mar), como en una mañana de verdad:
 *
 * - Un mar de nubes sobre las tierras bajas húmedas (el Chapare, el Beni): un manto de nubes
 *   bajas y anchas que llega hasta el pie de las yungas.
 * - Cúmulos sueltos sobre las sierras y los valles, más donde es húmedo, casi ninguno sobre el
 *   Altiplano; alguno alto (cúmulo congesto) junto al camino de la cámara.
 * - La nube por la que entra la cámara al valle, sobre el punto de llegada, y cúmulos a los lados
 *   del camino en el valle, que pasan junto a ella al bajar.
 *
 * Las mismas nubes se dibujan en el globo (en radios terrestres, hijas de la Tierra) y en el valle
 * (en metros), y proyectan sus sombras, alargadas por el Sol bajo, en una textura.
 */

const crearAzar = (semilla: number): (() => number) => {
  let estado = semilla >>> 0
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0
    let t = estado
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const GRADO = Math.PI / 180

/** Punto de la Tierra (unitario, marco de su malla: longitud atan(−z, x), latitud asin(y)). */
export const puntoTierra = (latitud: number, longitud: number): THREE.Vector3 =>
  new THREE.Vector3(Math.cos(latitud * GRADO) * Math.cos(longitud * GRADO), Math.sin(latitud * GRADO), -Math.cos(latitud * GRADO) * Math.sin(longitud * GRADO))

/** El este y el norte (unitarios) en un punto de la Tierra. */
export const esteNorte = (latitud: number, longitud: number): { este: THREE.Vector3; norte: THREE.Vector3 } => {
  const la = latitud * GRADO
  const lo = longitud * GRADO
  return {
    este: new THREE.Vector3(-Math.sin(lo), 0, -Math.cos(lo)),
    norte: new THREE.Vector3(-Math.sin(la) * Math.cos(lo), Math.cos(la), Math.sin(la) * Math.sin(lo)),
  }
}

/** Una bola de nube en km: centro (x este, y norte, z altura sobre el mar), radio, base de su nube. */
export interface BolaNube {
  x: number
  y: number
  z: number
  r: number
  /** Altura de la base de su nube (km sobre el mar) y de la bola en su nube (0 abajo, 1 arriba). */
  base: number
  alto: number
}

/** La nube de entrada: donde está la cámara al pasar del globo al valle (km) y su base (km sobre el mar). */
export const NUBE_ENTRADA = { x: 2.15, y: -2.15, base: 5.55 } as const

/** Radio (km) del campo de nubes alrededor del corazón de flores. */
const RADIO_CAMPO = 330

/** Racimo de bolas: `cuantas` bolas en un círculo de radio `radio` sobre `base`, más o menos altas. */
const racimo = (
  bolas: BolaNube[],
  azar: () => number,
  x: number,
  y: number,
  base: number,
  radio: number,
  cuantas: number,
  aplastada: number,
): void => {
  for (let k = 0; k < cuantas; k += 1) {
    const angulo = 2 * Math.PI * azar()
    const lejos = radio * 0.62 * Math.sqrt(azar())
    const r = radio * (0.3 + 0.24 * azar()) * (1 - 0.3 * (lejos / radio))
    const alto = (0.3 + 0.55 * azar()) * (1 - aplastada)
    bolas.push({ x: x + Math.cos(angulo) * lejos, y: y + Math.sin(angulo) * lejos, z: base + r * (0.25 + alto), r, base, alto: Math.min(1, alto + 0.25) })
  }
}

export function generarCumulos(semilla = 20261003): BolaNube[] {
  const azar = crearAzar(semilla)
  const bolas: BolaNube[] = []

  // El campo: una rejilla de 11 km con cada nube desplazada al azar dentro de su celda.
  const celda = 11
  for (let cy = -RADIO_CAMPO; cy <= RADIO_CAMPO; cy += celda) {
    for (let cx = -RADIO_CAMPO; cx <= RADIO_CAMPO; cx += celda) {
      const x = cx + (azar() - 0.5) * celda
      const y = cy + (azar() - 0.5) * celda
      const distancia = Math.hypot(x, y)
      if (distancia > RADIO_CAMPO) continue
      // El valle se queda despejado alrededor del corazón (sólo la nube de entrada).
      if (distancia < 9) continue
      const suelo = alturaRegion(x, y, 3) / 1000
      const humedad = humedadRegion(x, y)
      const bajo = suelo < 1.0
      let probabilidad: number
      if (bajo) probabilidad = 0.97 * Math.min(1, Math.max(0, (humedad - 0.45) / 0.18))
      else if (suelo > 3.5 && humedad < 0.45) probabilidad = 0.05
      else probabilidad = 0.13 + 0.4 * Math.min(1, Math.max(0, (humedad - 0.5) / 0.3))
      if (azar() > probabilidad * (1 - Math.min(1, Math.max(0, (distancia - 260) / 70)))) continue
      if (bajo) {
        // El mar de nubes: nubes bajas, anchas y chatas, muy juntas.
        const radio = 7.5 + 5 * azar()
        racimo(bolas, azar, x, y, suelo + 0.9 + 0.5 * azar(), radio, 9 + Math.floor(6 * azar()), 0.6)
      } else {
        // Cúmulos: la base a unos 1,5 km sobre el suelo (no por debajo de los 4,3 km en la sierra).
        const radio = 1.8 + 3.2 * azar()
        const base = Math.max(suelo + 1.3, 4.3) + 0.7 * azar()
        racimo(bolas, azar, x, y, base, radio, 5 + Math.floor(5 * azar()), 0)
        // Alguno crece en torre.
        if (azar() < 0.25) racimo(bolas, azar, x + (azar() - 0.5) * radio * 0.4, y + (azar() - 0.5) * radio * 0.4, base + radio * 0.6, radio * 0.7, 4, 0)
      }
    }
  }

  // Cúmulos altos junto al camino de la cámara (que baja sobre el valle desde el noroeste): se
  // pasa junto a ellos al bajar.
  for (const [x, y, radio, base] of [
    [14, 6, 4.2, 5.2],
    [-11, -9, 3.6, 5.0],
    [9, -14, 3.2, 5.4],
    [-6, 13, 3.8, 5.6],
    [22, -4, 3, 5.1],
  ] as const) {
    racimo(bolas, azar, x, y, base, radio, 7, 0)
    racimo(bolas, azar, x, y, base + radio * 0.6, radio * 0.7, 5, 0)
  }

  // La nube de entrada: la cámara entra por arriba y sale por su base sobre el valle.
  const entrada: readonly (readonly [number, number, number, number])[] = [
    [2.2, -2.2, 6.72, 0.9],
    [2.02, -2.02, 6.35, 0.72],
    [1.84, -1.84, 5.99, 0.64],
    [1.68, -1.68, 5.73, 0.52],
    [2.7, -1.9, 6.47, 0.76],
    [1.9, -2.75, 6.52, 0.78],
    [2.6, -2.5, 6.09, 0.7],
    [1.5, -2.3, 6.27, 0.62],
    [2.35, -1.45, 6.17, 0.6],
    [2.8, -2.6, 6.87, 0.82],
    [2.3, -2.3, 7.4, 0.8],
    [1.9, -1.9, 7.1, 0.7],
    [2.6, -2.1, 7.7, 0.62],
  ]
  for (const [x, y, z, r] of entrada) bolas.push({ x, y, z, r, base: NUBE_ENTRADA.base, alto: Math.min(1, (z - NUBE_ENTRADA.base) / 2) })

  // Cúmulos a los lados del camino en el valle (por delante de la cámara al salir de la nube y más
  // abajo, hacia los bordes del cuadro), nunca a menos de 7° de la línea de vista hacia el corazón
  // ni en el propio camino (en km: x este, y norte, z altura sobre el fondo del valle).
  const arriba = new THREE.Vector3(0, 1, 0)
  const camino = [4, 3.5, 3, 2.6, 2.2, 1.8, 1.4, 1].map((z) => new THREE.Vector3(1.3 + (z - 2.4) * 0.5, z, 1.3 + (z - 2.4) * 0.5))
  const haciaCorazon = new THREE.Vector3()
  const haciaNube = new THREE.Vector3()
  for (const grupo of [
    { referencia: new THREE.Vector3(1.6, 2.9, 1.6), base: [1.2, 3.4], cuantos: 8 },
    { referencia: new THREE.Vector3(0.95, 1.75, 0.95), base: [0.7, 2.1], cuantos: 7 },
  ]) {
    // Marco del valle en km (x este, y arriba, z sur), como la cámara del valle.
    const adelante = grupo.referencia.clone().multiplyScalar(-1).normalize()
    const derechaVista = new THREE.Vector3().crossVectors(adelante, arriba).normalize()
    const arribaVista = new THREE.Vector3().crossVectors(derechaVista, adelante)
    let hechos = 0
    let intentos = 0
    while (hechos < grupo.cuantos && intentos < 4000) {
      intentos += 1
      const radio = 0.3 + 0.36 * azar()
      const lejos = 0.6 + 1.8 * azar()
      const lado = (azar() < 0.5 ? -1 : 1) * Math.tan((16 + 20 * azar()) * GRADO)
      const alto = Math.tan((-14 + 26 * azar()) * GRADO)
      const centro = grupo.referencia.clone().addScaledVector(adelante, lejos).addScaledVector(derechaVista, lado * lejos).addScaledVector(arribaVista, alto * lejos)
      const base = centro.y - radio * 0.5
      if (base < grupo.base[0] || base > grupo.base[1]) continue
      const bloquea = camino.some((ojo) => {
        haciaCorazon.copy(ojo).multiplyScalar(-1).normalize()
        haciaNube.copy(centro).sub(ojo)
        const distancia = haciaNube.length()
        if (distancia < radio * 1.4 + 0.15) return true
        const angulo = Math.acos(Math.min(1, haciaNube.normalize().dot(haciaCorazon)))
        return angulo < 7 * GRADO + Math.asin(Math.min(1, radio / distancia))
      })
      if (bloquea) continue
      // Del marco del valle (km sobre el fondo) al de la región (km sobre el mar).
      const cuantas = 5 + Math.floor(5 * azar())
      const inicio = bolas.length
      racimo(bolas, azar, centro.x, -centro.z, base + PISO_VALLE / 1000, radio, cuantas, 0)
      for (let k = inicio; k < bolas.length; k += 1) bolas[k].alto = Math.min(1, (bolas[k].z - bolas[k].base) / radio)
      hechos += 1
    }
  }
  return bolas
}

/** Las bolas para el shader: bola (centro y radio), arriba de su nube y base (en radios) y tono. */
export interface Nubes {
  bolas: Float32Array
  arriba: Float32Array
  tono: Float32Array
  cantidad: number
}

/**
 * Las nubes en el globo: en el marco de la malla de la Tierra (radios terrestres), con la
 * curvatura. `origen`, `este` y `norte`: la base de la región en ese marco.
 */
export function nubesEnGlobo(bolas: readonly BolaNube[], origen: THREE.Vector3, este: THREE.Vector3, norte: THREE.Vector3): Nubes {
  const datos: Nubes = { bolas: new Float32Array(bolas.length * 4), arriba: new Float32Array(bolas.length * 4), tono: new Float32Array(bolas.length * 4), cantidad: bolas.length }
  const punto = new THREE.Vector3()
  bolas.forEach((b, i) => {
    punto.copy(origen).addScaledVector(este, b.x / RADIO_TIERRA_KM).addScaledVector(norte, b.y / RADIO_TIERRA_KM).normalize()
    const arriba = punto.clone()
    punto.multiplyScalar(1 + b.z / RADIO_TIERRA_KM)
    datos.bolas.set([punto.x, punto.y, punto.z, b.r / RADIO_TIERRA_KM], i * 4)
    datos.arriba.set([arriba.x, arriba.y, arriba.z, (b.base - b.z) / b.r], i * 4)
    datos.tono.set([0, ((i * 0.61803) % 1 + 1) % 1, b.alto, 0], i * 4)
  })
  return datos
}

/** Las nubes en el valle (m: x al este, y sobre el fondo del valle, z al sur), las de a menos de `radio` km. */
export function nubesEnValle(bolas: readonly BolaNube[], radio = 70): Nubes {
  const cerca = bolas.filter((b) => Math.hypot(b.x, b.y) < radio)
  const datos: Nubes = { bolas: new Float32Array(cerca.length * 4), arriba: new Float32Array(cerca.length * 4), tono: new Float32Array(cerca.length * 4), cantidad: cerca.length }
  cerca.forEach((b, i) => {
    datos.bolas.set([b.x * 1000, b.z * 1000 - PISO_VALLE, -b.y * 1000, b.r * 1000], i * 4)
    datos.arriba.set([0, 1, 0, (b.base - b.z) / b.r], i * 4)
    datos.tono.set([0, ((i * 0.61803) % 1 + 1) % 1, b.alto, 0], i * 4)
  })
  return datos
}

/**
 * Geometría instanciada de las bolas: un quad unidad (−1..1) con la bola, el arriba de su nube y
 * su tono por instancia.
 */
export const crearBolasInstanciadas = (nubes: Nubes): THREE.InstancedBufferGeometry => {
  const geometria = new THREE.InstancedBufferGeometry()
  geometria.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3))
  geometria.setIndex([0, 1, 2, 0, 2, 3])
  geometria.setAttribute('aBola', new THREE.InstancedBufferAttribute(nubes.bolas, 4))
  geometria.setAttribute('aArriba', new THREE.InstancedBufferAttribute(nubes.arriba, 4))
  geometria.setAttribute('aTono', new THREE.InstancedBufferAttribute(nubes.tono, 4))
  geometria.instanceCount = nubes.cantidad
  return geometria
}

/** La textura de sombras de las nubes: lado (km) del cuadrado centrado en el corazón y texels. */
export const SOMBRAS_NUBES = { lado: 660, texeles: 1024 } as const

/**
 * Sombras de las nubes en el suelo (R: 0..1), con el Sol bajo de la mañana: la de cada bola es una
 * elipse alargada en la dirección del Sol, desplazada hacia el oeste tanto más cuanto más alta va
 * la nube sobre el suelo (a 17° de elevación, más de tres veces su altura).
 */
export function crearTexturaSombras(bolas: readonly BolaNube[]): THREE.DataTexture {
  const { lado, texeles } = SOMBRAS_NUBES
  const datos = new Float32Array(texeles * texeles)
  const [sx, sAlto, sz] = direccionSol(SOL_MANANA.rumbo, SOL_MANANA.elevacion)
  // Hacia el Sol en el plano (x este, y norte) y su elevación.
  const solX = sx
  const solY = -sz
  const horizontal = Math.hypot(solX, solY)
  const ux = solX / horizontal
  const uy = solY / horizontal
  const cotangente = horizontal / sAlto
  const kmPorTexel = lado / texeles
  for (const b of bolas) {
    const suelo = Math.max(0, alturaRegion(b.x, b.y, 3) / 1000)
    const sobre = Math.max(0.2, b.z - suelo)
    // La sombra cae del lado contrario al Sol.
    const cx = b.x - ux * sobre * cotangente
    const cy = b.y - uy * sobre * cotangente
    const largo = b.r / Math.max(sAlto, 0.1)
    const ancho = b.r
    const alcance = largo + kmPorTexel
    const i0 = Math.max(0, Math.floor((cx - alcance + lado / 2) / kmPorTexel))
    const i1 = Math.min(texeles - 1, Math.ceil((cx + alcance + lado / 2) / kmPorTexel))
    const j0 = Math.max(0, Math.floor((cy - alcance + lado / 2) / kmPorTexel))
    const j1 = Math.min(texeles - 1, Math.ceil((cy + alcance + lado / 2) / kmPorTexel))
    for (let j = j0; j <= j1; j += 1) {
      const py = -lado / 2 + (j + 0.5) * kmPorTexel - cy
      for (let i = i0; i <= i1; i += 1) {
        const px = -lado / 2 + (i + 0.5) * kmPorTexel - cx
        const a = (px * ux + py * uy) / largo
        const c = (-px * uy + py * ux) / ancho
        const d = a * a + c * c
        if (d < 1) {
          const k = j * texeles + i
          datos[k] = Math.max(datos[k], Math.min(1, (1 - d) * 3))
        }
      }
    }
  }
  const bytes = new Uint8Array(texeles * texeles)
  for (let k = 0; k < bytes.length; k += 1) bytes[k] = Math.round(datos[k] * 255)
  const textura = new THREE.DataTexture(bytes, texeles, texeles, THREE.RedFormat, THREE.UnsignedByteType)
  textura.minFilter = THREE.LinearFilter
  textura.magFilter = THREE.LinearFilter
  textura.needsUpdate = true
  return textura
}

/**
 * La distancia (km, negativa dentro) de un punto (km: x este, y norte, altura sobre el mar) a las
 * nubes: la unión de las bolas, cada una cortada por la base de su nube.
 */
export const distanciaANubes = (x: number, y: number, alto: number, bolas: readonly BolaNube[]): number => {
  let distancia = Number.POSITIVE_INFINITY
  for (const b of bolas) {
    const dx = x - b.x
    const dy = y - b.y
    if (Math.abs(dx) - b.r > distancia || Math.abs(dy) - b.r > distancia) continue
    const dz = alto - b.z
    distancia = Math.min(distancia, Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz) - b.r, b.base - alto))
  }
  return distancia
}

/** Cuánto se está dentro de una nube (0..1): plena a 250 m dentro, nula a 50 m fuera. */
export const nieblaEnNubes = (x: number, y: number, alto: number, bolas: readonly BolaNube[]): number => {
  const t = Math.min(1, Math.max(0, (distanciaANubes(x, y, alto, bolas) - 0.05) / (-0.25 - 0.05)))
  return t * t * (3 - 2 * t)
}
