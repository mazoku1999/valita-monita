import * as THREE from 'three'
import { CAMARA_VALLE, CAMPO, CORAZON, direccionRumbo } from '../constantes/valle'

/**
 * Las flores del campo de Tiquipaya (ver `constantes/valle.ts`), generadas una vez con azar fijo:
 *
 * - Girasoles en hileras norte-sur alrededor del corazón, altos (1.4–2.1 m, por encima de la cámara
 *   al final) y mirando al este, al Sol de la mañana, como los de verdad; los que quedan cerca de la
 *   cámara llevan sus hojas grandes en forma de corazón.
 * - Dentro del corazón, las flores del ramo: gerberas rosa pálido con el centro oscuro, rosas fucsia
 *   y rosa claro, lirios rosados con su raya y sus estambres, clavelinas (claveles de poeta)
 *   magenta, moradas y granate, bocas de dragón lilas y nubes de gipsófila rosa y blanca. Miran
 *   hacia el sureste y hacia arriba, a quien llega (la cámara baja desde el sureste y termina en la
 *   punta del corazón); son más densas donde se posa la cámara.
 * - El ribete del corazón, de gipsófila blanca y rosa.
 *
 * Cada planta da una cabeza (flor), un tallo y, algunas, hojas; la cabeza lleva su tipo, tamaño,
 * variante de color y hacia dónde mira (rumbo e inclinación). Ver `shaders/flores.ts`.
 */

export const TIPO_FLOR = {
  girasol: 0,
  gerbera: 1,
  lirio: 2,
  rosa: 3,
  clavelina: 4,
  bocaDeDragon: 5,
  gipsofila: 6,
} as const

/** Formas de hoja: la de girasol (corazón grande), la redonda de eucalipto y la larga. */
export const FORMA_HOJA = { girasol: 0, eucalipto: 1, larga: 2 } as const

export interface DatosFlores {
  /** Cabezas: base (x, y, z) y altura de la cabeza; tamaño, tipo, variante y azar; rumbo e inclinación de la cara. */
  cabezaBase: Float32Array
  cabezaForma: Float32Array
  cabezaCara: Float32Array
  /** Tallos: base y altura; grosor y tipo. */
  talloBase: Float32Array
  talloForma: Float32Array
  /** Hojas: punto de unión (x, y, z) y tamaño; rumbo, inclinación, forma y la altura de la planta. */
  hojaBase: Float32Array
  hojaForma: Float32Array
  cabezas: number
  hojas: number
}

/** Mulberry32: las mismas flores en cada carga. */
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

const punto2 = (x: number, y: number): number => x * x + y * y

/** Corazón con signo (el de `CORAZON_GLSL`): la punta en (0, 0), los lóbulos hacia +y. */
const sdCorazon = (px: number, py: number): number => {
  const x = Math.abs(px)
  if (py + x > 1) return Math.sqrt(punto2(x - 0.25, py - 0.75)) - Math.SQRT2 / 4
  const m = 0.5 * Math.max(x + py, 0)
  return Math.sqrt(Math.min(punto2(x, py - 1), punto2(x - m, py - m))) * Math.sign(x - py)
}

const [EJE_X, EJE_Z] = direccionRumbo(CORAZON.rumbo)
/** Distancia (m) al borde del corazón, negativa dentro (el mismo que pinta el suelo). */
export const distanciaCorazon = (x: number, z: number): number => {
  const u = x * -EJE_Z + z * EJE_X
  const v = x * EJE_X + z * EJE_Z
  return sdCorazon(u / CORAZON.escala, v / CORAZON.escala + 0.6) * CORAZON.escala
}

const FINAL = CAMARA_VALLE[CAMARA_VALLE.length - 1].posicion
const RADIANES = Math.PI / 180

/** Semilado del cuadro de girasoles que se dibujan una a una (más allá, el suelo los pinta). */
const GIRASOLES_SEMILADO = 95

export function generarFlores(semilla = 20260929): DatosFlores {
  const azar = crearAzar(semilla)
  const cabezas: number[][] = []
  const tallos: number[][] = []
  const hojas: number[][] = []

  const planta = (x: number, z: number, altura: number, tamano: number, tipo: number, rumbo: number, inclinacion: number, grosor: number): void => {
    const variante = azar()
    cabezas.push([x, 0, z, altura, tamano, tipo, variante, azar(), rumbo * RADIANES, inclinacion * RADIANES])
    tallos.push([x, 0, z, altura, grosor, tipo])
  }

  // Girasoles en hileras, mirando al este (al Sol de la mañana) con algo de desorden.
  for (let x = -GIRASOLES_SEMILADO; x <= GIRASOLES_SEMILADO; x += CAMPO.entreHileras) {
    for (let z = -GIRASOLES_SEMILADO; z <= GIRASOLES_SEMILADO; z += CAMPO.entrePlantas) {
      const px = x + (azar() - 0.5) * 0.18
      const pz = z + (azar() - 0.5) * 0.24
      if (distanciaCorazon(px, pz) < 1.4) continue
      if (azar() < 0.04) continue
      const altura = 1.4 + 0.7 * azar()
      // Mirando al este y algo hacia arriba: desde el aire se ven amarillos.
      planta(px, pz, altura, 0.15 + 0.06 * azar(), TIPO_FLOR.girasol, 95 + (azar() - 0.5) * 30, 15 + 20 * azar(), 0.028)
      // Hojas grandes en los que quedan cerca de la cámara al final.
      if (Math.hypot(px - FINAL[0], pz - FINAL[2]) < 60) {
        for (let k = 0; k < 3; k += 1) {
          hojas.push([px, altura * (0.3 + 0.2 * k + 0.06 * azar()), pz, 0.2 + 0.12 * azar(), 360 * azar() * RADIANES, (20 + 30 * azar()) * RADIANES, FORMA_HOJA.girasol, altura])
        }
      }
    }
  }

  // Las flores del ramo dentro del corazón: más densas junto a la punta, donde se posa la cámara.
  const reparto: readonly [number, number][] = [
    [TIPO_FLOR.gerbera, 0.18],
    [TIPO_FLOR.rosa, 0.18],
    [TIPO_FLOR.lirio, 0.08],
    [TIPO_FLOR.clavelina, 0.2],
    [TIPO_FLOR.bocaDeDragon, 0.14],
    [TIPO_FLOR.gipsofila, 0.22],
  ]
  const elegirTipo = (): number => {
    let r = azar()
    for (const [tipo, peso] of reparto) {
      if (r < peso) return tipo
      r -= peso
    }
    return TIPO_FLOR.gipsofila
  }
  const medidas: Record<number, { altura: [number, number]; tamano: [number, number] }> = {
    [TIPO_FLOR.gerbera]: { altura: [0.3, 0.46], tamano: [0.05, 0.065] },
    [TIPO_FLOR.rosa]: { altura: [0.34, 0.52], tamano: [0.04, 0.052] },
    [TIPO_FLOR.lirio]: { altura: [0.44, 0.64], tamano: [0.07, 0.09] },
    [TIPO_FLOR.clavelina]: { altura: [0.22, 0.36], tamano: [0.045, 0.06] },
    [TIPO_FLOR.bocaDeDragon]: { altura: [0.36, 0.56], tamano: [0.035, 0.045] },
    [TIPO_FLOR.gipsofila]: { altura: [0.26, 0.44], tamano: [0.08, 0.12] },
  }
  // Densidad (flores por m²): tupida junto a la cámara final, como un ramo; más clara lejos, donde
  // el suelo ya pinta el tapiz rosado.
  const DENSIDAD = { cerca: 36, lejos: 3.5, alcance: 7 }
  const ladoCaja = 2.4 * CORAZON.escala
  const intentos = Math.round(ladoCaja * ladoCaja * DENSIDAD.cerca)
  for (let n = 0; n < intentos; n += 1) {
    const x = (azar() - 0.5) * ladoCaja
    const z = (azar() - 0.5) * ladoCaja
    const d = distanciaCorazon(x, z)
    if (d > -CORAZON.ribete - 0.2) continue
    const aCamara = Math.hypot(x - FINAL[0], z - FINAL[2])
    const densidad = DENSIDAD.lejos + (DENSIDAD.cerca - DENSIDAD.lejos) * Math.exp(-aCamara / DENSIDAD.alcance)
    if (azar() > densidad / DENSIDAD.cerca) continue
    const tipo = elegirTipo()
    const { altura, tamano } = medidas[tipo]
    const alto = altura[0] + (altura[1] - altura[0]) * azar()
    planta(x, z, alto, tamano[0] + (tamano[1] - tamano[0]) * azar(), tipo, 135 + (azar() - 0.5) * 60, 30 + 30 * azar(), 0.009)
    // El verde del ramo al pie de las flores cercanas: hojas redondas de eucalipto y hojas largas.
    if (aCamara < 22) {
      for (let k = 0; k < 2; k += 1) {
        const eucalipto = azar() < 0.55
        hojas.push([
          x + (azar() - 0.5) * 0.08,
          alto * (0.1 + 0.3 * azar()),
          z + (azar() - 0.5) * 0.08,
          eucalipto ? 0.045 + 0.035 * azar() : 0.08 + 0.07 * azar(),
          360 * azar() * RADIANES,
          (15 + 35 * azar()) * RADIANES,
          eucalipto ? FORMA_HOJA.eucalipto : FORMA_HOJA.larga,
          alto,
        ])
      }
    }
  }

  // El ribete: gipsófila blanca y rosa a lo largo del borde del corazón.
  for (let n = 0; n < 120000; n += 1) {
    const x = (azar() - 0.5) * 2.4 * CORAZON.escala
    const z = (azar() - 0.5) * 2.4 * CORAZON.escala
    const d = distanciaCorazon(x, z)
    if (d > 0.1 || d < -CORAZON.ribete) continue
    if (azar() > 0.35) continue
    planta(x, z, 0.3 + 0.2 * azar(), 0.09 + 0.05 * azar(), TIPO_FLOR.gipsofila, 135, 40, 0.006)
  }

  const plano = (filas: number[][], ancho: number, desde: number, hasta: number): Float32Array => {
    const datos = new Float32Array(filas.length * ancho)
    filas.forEach((fila, i) => {
      for (let k = 0; k < ancho; k += 1) datos[i * ancho + k] = fila[desde + k] ?? 0
    })
    return datos
  }
  return {
    cabezaBase: plano(cabezas, 4, 0, 4),
    cabezaForma: plano(cabezas, 4, 4, 8),
    cabezaCara: plano(cabezas, 2, 8, 10),
    talloBase: plano(tallos, 4, 0, 4),
    talloForma: plano(tallos, 2, 4, 6),
    hojaBase: plano(hojas, 4, 0, 4),
    hojaForma: plano(hojas, 4, 4, 8),
    cabezas: cabezas.length,
    hojas: hojas.length,
  }
}

/** Geometría instanciada de un quad unidad (−1..1) con los atributos por instancia dados. */
export const crearQuadInstanciado = (atributos: Record<string, [Float32Array, number]>, instancias: number): THREE.InstancedBufferGeometry => {
  const geometria = new THREE.InstancedBufferGeometry()
  geometria.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3))
  geometria.setIndex([0, 1, 2, 0, 2, 3])
  for (const [nombre, [datos, tamano]] of Object.entries(atributos)) {
    geometria.setAttribute(nombre, new THREE.InstancedBufferAttribute(datos, tamano))
  }
  geometria.instanceCount = instancias
  return geometria
}
