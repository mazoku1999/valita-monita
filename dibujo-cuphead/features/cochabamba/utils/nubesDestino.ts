import * as THREE from 'three'
import { DESTINO, NUBE_CORAZON, RADIO_TIERRA_KM } from '../constantes/destino'

/**
 * Las nubes de la llegada (ver `shaders/nubesBolas.ts`), con azar fijo:
 *
 * - Sobre la Tierra (en el marco de su malla, en radios terrestres): la nube con forma de corazón
 *   que flota sobre Cochabamba (bolas a lo largo del contorno y otras, más altas, que lo rellenan,
 *   con una grande en el centro, donde entra la cámara) y cúmulos sueltos alrededor, más en las
 *   tierras bajas del noreste que sobre el Altiplano.
 * - En el valle (en metros): la parte baja de esa misma nube, por la que sale la cámara, y cúmulos
 *   a los lados del camino, que pasan junto a ella mientras baja.
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

/** Una bola de nube: centro, radio, arriba de su nube, altura de la base (en radios) y tono. */
interface Bola {
  centro: THREE.Vector3
  radio: number
  arriba: THREE.Vector3
  base: number
  rosado: number
  altura: number
}

export interface Nubes {
  bolas: Float32Array
  arriba: Float32Array
  tono: Float32Array
  cantidad: number
}

const empaquetar = (bolas: readonly Bola[], azar: () => number): Nubes => {
  const datos = { bolas: new Float32Array(bolas.length * 4), arriba: new Float32Array(bolas.length * 4), tono: new Float32Array(bolas.length * 4), cantidad: bolas.length }
  bolas.forEach((bola, i) => {
    datos.bolas.set([bola.centro.x, bola.centro.y, bola.centro.z, bola.radio], i * 4)
    datos.arriba.set([bola.arriba.x, bola.arriba.y, bola.arriba.z, bola.base], i * 4)
    datos.tono.set([bola.rosado, azar(), bola.altura, 0], i * 4)
  })
  return datos
}

/** Corazón con signo (el de `CORAZON_GLSL`): la punta en (0, 0), los lóbulos hacia +y. */
const sdCorazon = (px: number, py: number): number => {
  const x = Math.abs(px)
  if (py + x > 1) return Math.hypot(x - 0.25, py - 0.75) - Math.SQRT2 / 4
  const m = 0.5 * Math.max(x + py, 0)
  return Math.sqrt(Math.min(x * x + (py - 1) * (py - 1), (x - m) * (x - m) + (py - m) * (py - m))) * Math.sign(x - py)
}

/**
 * Puntos del contorno del corazón (unidades de la curva, la punta en (0, 0)) cada `paso`, con la
 * normal hacia dentro: el lado recto de la punta al lóbulo y el arco del lóbulo, a cada lado.
 */
const contornoCorazon = (paso: number): { punto: [number, number]; dentro: [number, number] }[] => {
  const puntos: { punto: [number, number]; dentro: [number, number] }[] = []
  const radio = Math.SQRT2 / 4
  for (const lado of [1, -1]) {
    const recto = Math.SQRT1_2
    for (let s = lado > 0 ? 0 : paso; s < recto; s += paso) {
      const a = (s / recto) * 0.5
      puntos.push({ punto: [lado * a, a], dentro: [-lado * Math.SQRT1_2, Math.SQRT1_2] })
    }
    const arco = radio * Math.PI
    for (let s = 0; s < arco; s += paso) {
      const angulo = -Math.PI / 4 + s / radio
      const [cx, cy] = [Math.cos(angulo), Math.sin(angulo)]
      puntos.push({ punto: [lado * (0.25 + radio * cx), 0.75 + radio * cy], dentro: [-lado * cx, -cy] })
    }
  }
  return puntos
}

export interface NubesTierra extends Nubes {
  /** Bolas de la nube del corazón (centro y radio): para la niebla al entrar en ella. */
  corazon: Float32Array
  /** Racimos, para sus sombras en el mapa: centro (a media altura) y radio horizontal. */
  sombras: Float32Array
  racimos: number
}

/** Las nubes sobre la Tierra alrededor de Cochabamba, en radios terrestres. */
export function generarNubesTierra(semilla = 20261001): NubesTierra {
  const azar = crearAzar(semilla)
  const centro = puntoTierra(DESTINO.latitud, DESTINO.longitud)
  const { este, norte } = esteNorte(DESTINO.latitud, DESTINO.longitud)
  const km = 1 / RADIO_TIERRA_KM
  /** Punto a (e, n) km del destino (hacia el este y el norte) y a `altura` km sobre el suelo. */
  const enKm = (e: number, n: number, altura: number): THREE.Vector3 =>
    centro
      .clone()
      .addScaledVector(este, e * km)
      .addScaledVector(norte, n * km)
      .normalize()
      .multiplyScalar(1 + altura * km)
  const bolas: Bola[] = []
  const bola = (e: number, n: number, alturaCentro: number, radio: number, base: number, rosado: number, alturaEnNube: number): void => {
    const c = enKm(e, n, alturaCentro)
    bolas.push({ centro: c, radio: radio * km, arriba: c.clone().normalize(), base: (base - alturaCentro) / radio, rosado, altura: alturaEnNube })
  }

  // La nube del corazón: su eje (de la punta a los lóbulos) hacia el noroeste, como el corazón de
  // flores; (u, v) en km a su derecha y a lo largo del eje, con el centro sobre Cochabamba.
  const { rumbo, escala, base, cima } = NUBE_CORAZON
  const eje = [Math.sin(rumbo * GRADO), Math.cos(rumbo * GRADO)]
  const derecha = [eje[1], -eje[0]]
  const enCorazon = (u: number, v: number): [number, number] => [derecha[0] * u + eje[0] * v, derecha[1] * u + eje[1] * v]
  const alturaEnCorazon = (alturaCentro: number): number => (alturaCentro - base) / (cima - base)
  const inicioCorazon = bolas.length
  for (const { punto, dentro } of contornoCorazon(0.15)) {
    const radio = 2.4 + 0.8 * azar()
    const u = punto[0] * escala + dentro[0] * radio * 0.75
    const v = (punto[1] - 0.6) * escala + dentro[1] * radio * 0.75
    const alto = base + radio * (0.45 + 0.25 * azar())
    bola(...enCorazon(u, v), alto, radio, base, 0.85, alturaEnCorazon(alto))
  }
  for (let u = -0.62 * escala; u <= 0.62 * escala; u += 3.4) {
    for (let v = -0.62 * escala; v <= 0.55 * escala; v += 3.4) {
      const uu = u + (azar() - 0.5) * 1.6
      const vv = v + (azar() - 0.5) * 1.6
      const d = sdCorazon(uu / escala, vv / escala + 0.6) * escala
      if (d > -2.5) continue
      const radio = 2.6 + 1.4 * azar()
      const alto = base + radio * 0.55 + 2.6 * Math.min(1, -d / 8)
      bola(...enCorazon(uu, vv), alto, radio, base, 0.85, alturaEnCorazon(alto))
    }
  }
  // La bola del centro, la más alta: la cámara baja derecha y entra en ella.
  bola(0, 0, cima - 5, 5, base, 0.85, 1)
  const corazon = new Float32Array((bolas.length - inicioCorazon) * 4)
  bolas.slice(inicioCorazon).forEach((b, i) => corazon.set([b.centro.x, b.centro.y, b.centro.z, b.radio], i * 4))

  // Cúmulos sueltos: más hacia el noreste y el este (las tierras bajas) que hacia el Altiplano.
  const sombras: number[] = []
  let racimos = 0
  while (racimos < 46) {
    const rumboRacimo = 360 * azar()
    const distancia = 36 + 390 * Math.sqrt(azar())
    if (azar() > 0.3 + 0.7 * (0.5 + 0.5 * Math.cos((rumboRacimo - 60) * GRADO))) continue
    const e0 = Math.sin(rumboRacimo * GRADO) * distancia
    const n0 = Math.cos(rumboRacimo * GRADO) * distancia
    const baseRacimo = 2.2 + 3.2 * azar()
    const radioRacimo = 3 + 6 * azar()
    const cuantas = 4 + Math.floor(6 * azar())
    for (let k = 0; k < cuantas; k += 1) {
      const angulo = 2 * Math.PI * azar()
      const lejos = radioRacimo * 0.62 * Math.sqrt(azar())
      const radio = radioRacimo * (0.32 + 0.26 * azar()) * (1 - 0.35 * (lejos / radioRacimo))
      const alto = baseRacimo + radio * (0.3 + 0.55 * azar())
      bola(e0 + Math.cos(angulo) * lejos, n0 + Math.sin(angulo) * lejos, alto, radio, baseRacimo, 0, Math.min(1, (alto - baseRacimo) / radioRacimo))
    }
    const medio = enKm(e0, n0, baseRacimo + radioRacimo * 0.4)
    sombras.push(medio.x, medio.y, medio.z, radioRacimo * 0.8 * km)
    racimos += 1
  }

  return { ...empaquetar(bolas, azar), corazon, sombras: new Float32Array(sombras), racimos }
}

/**
 * Una bola del valle y su racimo: centro (x, y, z) en metros, radio y la altura de la base de su
 * nube (m sobre el fondo del valle).
 */
type BolaValle = readonly [number, number, number, number, number]

/**
 * La nube de entrada del valle (la parte baja de la nube del corazón): bolas a lo largo del camino
 * de la cámara, que empieza dentro de ella y sale por su base (ver `CAMARA_VALLE`).
 */
export const NUBE_ENTRADA_VALLE: readonly BolaValle[] = [
  [2200, 4150, 2200, 900, 3000],
  [2020, 3780, 2020, 720, 3000],
  [1840, 3420, 1840, 640, 3000],
  [1680, 3160, 1680, 520, 3000],
  [2700, 3900, 1900, 760, 3000],
  [1900, 3950, 2750, 780, 3000],
  [2600, 3520, 2500, 700, 3000],
  [1500, 3700, 2300, 620, 3000],
  [2350, 3600, 1450, 600, 3000],
  [2800, 4300, 2600, 820, 3000],
]

export interface NubesValle extends Nubes {
  /** Bolas de la nube de entrada (centro y radio) y la altura de su base, para la niebla. */
  entrada: readonly BolaValle[]
}

/** Las nubes del valle: la de entrada (rosada, la del corazón) y cúmulos a los lados del camino. */
export function generarNubesValle(semilla = 20261002): NubesValle {
  const azar = crearAzar(semilla)
  const arriba = new THREE.Vector3(0, 1, 0)
  const bolas: Bola[] = NUBE_ENTRADA_VALLE.map(([x, y, z, radio, base]) => ({
    centro: new THREE.Vector3(x, y, z),
    radio,
    arriba,
    base: (base - y) / radio,
    rosado: 0.85,
    altura: Math.min(1, (y - base) / 1500),
  }))

  // Cúmulos a los lados del camino, por delante de la cámara (se buscan en su marco en dos puntos
  // del camino: al salir de la nube y más abajo; hacia los bordes del cuadro, por debajo de ella,
  // para que suban a su lado al bajar), nunca a menos de 7° de la línea de vista hacia el corazón
  // ni en el propio camino.
  const camino = [4000, 3500, 3000, 2600, 2200, 1800, 1400, 1000].map((y) => new THREE.Vector3(1300 + (y - 2400) * 0.5, y, 1300 + (y - 2400) * 0.5))
  const haciaCorazon = new THREE.Vector3()
  const haciaNube = new THREE.Vector3()
  const grupos = [
    { referencia: new THREE.Vector3(1600, 2900, 1600), base: [1200, 3400], cuantos: 8 },
    { referencia: new THREE.Vector3(950, 1750, 950), base: [700, 2100], cuantos: 7 },
  ] as const
  for (const grupo of grupos) {
    const adelante = grupo.referencia.clone().multiplyScalar(-1).normalize()
    const derechaVista = new THREE.Vector3().crossVectors(adelante, arriba).normalize()
    const arribaVista = new THREE.Vector3().crossVectors(derechaVista, adelante)
    let racimos = 0
    let intentos = 0
    while (racimos < grupo.cuantos && intentos < 4000) {
      intentos += 1
      const radioRacimo = 300 + 360 * azar()
      const lejos = 600 + 1800 * azar()
      const lado = (azar() < 0.5 ? -1 : 1) * Math.tan((16 + 20 * azar()) * GRADO)
      const alto = Math.tan((-14 + 26 * azar()) * GRADO)
      const centro = grupo.referencia
        .clone()
        .addScaledVector(adelante, lejos)
        .addScaledVector(derechaVista, lado * lejos)
        .addScaledVector(arribaVista, alto * lejos)
      const base = centro.y - radioRacimo * 0.5
      if (base < grupo.base[0] || base > grupo.base[1]) continue
      const bloquea = camino.some((ojo) => {
        haciaCorazon.copy(ojo).multiplyScalar(-1).normalize()
        haciaNube.copy(centro).sub(ojo)
        const distancia = haciaNube.length()
        if (distancia < radioRacimo * 1.4 + 150) return true
        const angulo = Math.acos(Math.min(1, haciaNube.normalize().dot(haciaCorazon)))
        return angulo < 7 * GRADO + Math.asin(Math.min(1, radioRacimo / distancia))
      })
      if (bloquea) continue
      const cuantas = 5 + Math.floor(5 * azar())
      for (let k = 0; k < cuantas; k += 1) {
        const angulo = 2 * Math.PI * azar()
        const lejosBola = radioRacimo * 0.6 * Math.sqrt(azar())
        const radio = radioRacimo * (0.34 + 0.26 * azar()) * (1 - 0.3 * (lejosBola / radioRacimo))
        const y = base + radio * (0.3 + 0.55 * azar())
        bolas.push({
          centro: new THREE.Vector3(centro.x + Math.cos(angulo) * lejosBola, y, centro.z + Math.sin(angulo) * lejosBola),
          radio,
          arriba,
          base: (base - y) / radio,
          rosado: 0.12,
          altura: Math.min(1, (y - base) / radioRacimo),
        })
      }
      racimos += 1
    }
  }
  return { ...empaquetar(bolas, azar), entrada: NUBE_ENTRADA_VALLE }
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

/**
 * Cuánto se está dentro de una nube (0..1) según la distancia con signo (en las unidades de las
 * bolas) de la cámara a la nube: la unión de las bolas cortadas por su base. `dentro` y `fuera`
 * fijan la niebla plena y la niebla nula.
 */
export const nieblaEn = (camara: THREE.Vector3, bolas: Float32Array, altura: (punto: THREE.Vector3) => number, base: number, dentro: number, fuera: number): number => {
  let distancia = Number.POSITIVE_INFINITY
  for (let i = 0; i < bolas.length; i += 4) {
    const dx = camara.x - bolas[i]
    const dy = camara.y - bolas[i + 1]
    const dz = camara.z - bolas[i + 2]
    distancia = Math.min(distancia, Math.sqrt(dx * dx + dy * dy + dz * dz) - bolas[i + 3])
  }
  distancia = Math.max(distancia, base - altura(camara))
  const t = Math.min(1, Math.max(0, (distancia - fuera) / (dentro - fuera)))
  return t * t * (3 - 2 * t)
}
