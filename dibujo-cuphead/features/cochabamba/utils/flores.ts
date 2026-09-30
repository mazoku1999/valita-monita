import * as THREE from 'three'
import { CAMARA_VALLE, CAMPO, CORAZON } from '../constantes/valle'
import { CAMPOS, CELDAS_CAMPOS, CULTIVO, MANZANA, campoEn, crearCampo, dentroDelCultivo, sitioCelda } from './campos'
import { distanciaCorazon } from './corazon'

/**
 * Las flores del campo de Tiquipaya (ver `constantes/valle.ts`), generadas una vez con azar fijo:
 *
 * - Girasoles en hileras a lo largo de sus franjas (ver `campos.ts`), altos (1.4–2.1 m, por encima
 *   de la cámara al final) y mirando al este, al Sol de la mañana, como los de verdad; los que quedan
 *   cerca de la cámara llevan sus hojas grandes en forma de corazón.
 * - Dentro del corazón, las flores del ramo de las fotos: gerberas rosa pálido con el centro oscuro,
 *   rosas rosa claro, fucsia y lila, lirios "stargazer" y sus capullos, claveles de poeta cereza,
 *   granate, fucsia y morados, bocas de dragón malva, lila y crema, gipsófila rosa y dianthus verdes.
 *   Miran hacia el sureste y hacia arriba, a quien llega (la cámara baja desde el sureste y termina
 *   en la punta del corazón); son más densas donde se posa la cámara y, delante de ella, forman el
 *   ramo (`RAMO` y su relleno).
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
  capulloLirio: 7,
  bolaVerde: 8,
} as const

/**
 * Formas de hoja: la de girasol (corazón grande), la de eucalipto (gris azulada), la larga (de
 * lirio) y la de aspidistra (grande, brillante, con nervios paralelos: la que envuelve el ramo).
 */
export const FORMA_HOJA = { girasol: 0, eucalipto: 1, larga: 2, aspidistra: 3 } as const

export interface DatosFlores {
  /** Cabezas: base (x, y, z) y altura de la cabeza; tamaño, tipo, variante y azar; rumbo e inclinación de la cara. */
  cabezaBase: Float32Array
  cabezaForma: Float32Array
  cabezaCara: Float32Array
  /** Tallos: base y altura; grosor, tipo y la semilla de su flor. */
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

const FINAL = CAMARA_VALLE[CAMARA_VALLE.length - 1].posicion
const MIRA_FINAL = CAMARA_VALLE[CAMARA_VALLE.length - 1].mira
/** Hacia dónde mira la cámara al final (horizontal, unitario). */
const ADELANTE_FINAL = ((): [number, number] => {
  const x = MIRA_FINAL[0] - FINAL[0]
  const z = MIRA_FINAL[2] - FINAL[2]
  const l = Math.hypot(x, z)
  return [x / l, z / l]
})()

/**
 * El ramo en primer plano, delante de la cámara final, compuesto como el de las fotos: una gerbera
 * rosa pálido, un lirio abierto con dos capullos, rosas rosa claro, fucsia y lila, claveles de poeta
 * fucsia, granate y morado, bocas de dragón lila y crema, nubes de gipsófila rosa y dos dianthus
 * verdes. Cada uno: tipo, adelante y a la derecha de la cámara (m), altura de la cabeza (m),
 * tamaño (m), variante de color e inclinación de la cara (°).
 */
const RAMO: readonly (readonly [number, number, number, number, number, number, number])[] = [
  // Gerbera, abajo a la izquierda, de frente.
  [1, 1.0, -0.3, 0.44, 0.058, 0.2, 12],
  // Lirio abierto en el centro, algo más alto, y sus capullos.
  [2, 1.45, 0.06, 0.62, 0.088, 0.3, 18],
  [7, 1.52, -0.08, 0.72, 0.02, 0.2, 0],
  [7, 1.4, 0.24, 0.68, 0.019, 0.8, 0],
  // Rosas: rosa claro delante, fucsia a la derecha, lila a la izquierda, otra rosa claro atrás.
  [3, 0.92, 0.1, 0.4, 0.046, 0.2, 0],
  [3, 1.18, 0.4, 0.46, 0.045, 0.6, 0],
  [3, 1.32, -0.52, 0.44, 0.044, 0.82, 0],
  [3, 1.7, 0.36, 0.52, 0.044, 0.3, 0],
  // Claveles de poeta: fucsia, granate con borde blanco, morado con centro blanco.
  [4, 0.86, -0.1, 0.34, 0.046, 0.05, 0],
  [4, 1.04, 0.52, 0.36, 0.044, 0.1, 0],
  [4, 1.22, -0.34, 0.4, 0.045, 0.115, 0],
  [4, 1.6, 0.62, 0.42, 0.044, 0.02, 0],
  [4, 1.75, -0.2, 0.44, 0.042, 0.09, 0],
  // Bocas de dragón: lila y crema, que suben por detrás.
  [5, 1.12, -0.18, 0.62, 0.046, 0.05, 0],
  [5, 1.42, 0.5, 0.64, 0.044, 0.12, 0],
  [5, 1.62, -0.6, 0.66, 0.045, 0.03, 0],
  [5, 1.9, 0.18, 0.68, 0.044, 0.1, 0],
  // Gipsófila rosa llenando los huecos.
  [6, 0.9, 0.34, 0.36, 0.085, 0.1, 0],
  [6, 1.1, -0.62, 0.4, 0.09, 0.2, 0],
  [6, 1.34, 0.22, 0.46, 0.08, 0.05, 0],
  [6, 0.8, -0.44, 0.32, 0.075, 0.3, 0],
  [6, 1.5, -0.36, 0.48, 0.085, 0.7, 0],
  [6, 1.62, 0.1, 0.5, 0.08, 0.15, 0],
  [6, 1.9, 0.5, 0.5, 0.09, 0.4, 0],
  // Dianthus verdes.
  [8, 0.98, 0.26, 0.33, 0.026, 0.4, 0],
  [8, 1.4, -0.08, 0.38, 0.024, 0.7, 0],
]

/**
 * El relleno del ramo: flores entre las del ramo, tupidas como en un ramo de verdad (entre cabeza y
 * cabeza se veía el follaje del suelo), más altas hacia el fondo y el centro, en cúpula, para que
 * desde la cámara se vean todas. Ninguna tapa a otra de delante más de un poco.
 */
const RELLENO = { flores: 70, intentos: 1500, adelante: [0.75, 2.3] } as const
const REPARTO_RELLENO: readonly (readonly [number, number])[] = [
  [TIPO_FLOR.gipsofila, 0.38],
  [TIPO_FLOR.clavelina, 0.2],
  [TIPO_FLOR.rosa, 0.19],
  [TIPO_FLOR.bocaDeDragon, 0.1],
  [TIPO_FLOR.bolaVerde, 0.06],
  [TIPO_FLOR.gerbera, 0.02],
  [TIPO_FLOR.capulloLirio, 0.05],
]

/** Las hojas de aspidistra del ramo: adelante y a la derecha de la cámara (m), rumbo (°) y largo (m). */
const ASPIDISTRAS: readonly (readonly [number, number, number, number])[] = [
  [0.95, -0.66, 200, 0.26],
  [1.0, 0.7, 75, 0.26],
  [1.4, -0.82, 250, 0.3],
  [1.45, 0.86, 30, 0.3],
  [1.8, 0.0, 330, 0.28],
]
const RADIANES = Math.PI / 180

/** Radio (m) alrededor del corazón en el que los girasoles se dibujan uno a uno. */
const GIRASOLES = { radio: 150 } as const

/**
 * Medio grosor del tallo (m) de cada tipo, el de verdad: gruesos, los tallos eran un bosque de palos
 * delante del ramo.
 */
const GROSOR_TALLO: Record<number, number> = {
  [TIPO_FLOR.girasol]: 0.016,
  [TIPO_FLOR.gerbera]: 0.0045,
  [TIPO_FLOR.lirio]: 0.005,
  [TIPO_FLOR.rosa]: 0.004,
  [TIPO_FLOR.clavelina]: 0.003,
  [TIPO_FLOR.bocaDeDragon]: 0.0035,
  [TIPO_FLOR.gipsofila]: 0.0025,
  [TIPO_FLOR.capulloLirio]: 0.004,
  [TIPO_FLOR.bolaVerde]: 0.003,
}

export function generarFlores(semilla = 20260929): DatosFlores {
  let azar = crearAzar(semilla)
  const cabezas: number[][] = []
  const tallos: number[][] = []
  const hojas: number[][] = []

  const planta = (x: number, z: number, altura: number, tamano: number, tipo: number, rumbo: number, inclinacion: number): void => {
    const variante = azar()
    // La semilla de la flor mueve también su tallo (la misma brisa).
    const semilla = azar()
    cabezas.push([x, 0, z, altura, tamano, tipo, variante, semilla, rumbo * RADIANES, inclinacion * RADIANES])
    tallos.push([x, 0, z, altura, GROSOR_TALLO[tipo], tipo, semilla])
  }

  // Girasoles en los campos de girasol cercanos, en hileras en la dirección de su campo, mirando al
  // este (al Sol de la mañana) con algo de desorden. Más allá, el suelo pinta sus campos.
  const campo = crearCampo()
  const { n } = CAMPOS
  // Un mapa grueso (1,5 m) de a qué manzana pertenece cada sitio y si hay girasoles cerca: así la
  // cuenta exacta se hace sólo donde puede ir un girasol.
  const PASO = 1.5
  const LADO = Math.ceil((2 * GIRASOLES.radio) / PASO)
  const manzanaGruesa = new Int32Array(LADO * LADO).fill(-1)
  for (let b = 0; b < LADO; b += 1) {
    for (let a = 0; a < LADO; a += 1) {
      const x = -GIRASOLES.radio + (a + 0.5) * PASO
      const z = -GIRASOLES.radio + (b + 0.5) * PASO
      if (Math.hypot(x, z) > GIRASOLES.radio + PASO) continue
      campoEn(CELDAS_CAMPOS, x, z, campo)
      // Cerca de un borde (de manzana o de franja) queda como dudoso: allí se hace la cuenta exacta.
      const dudoso = campo.borde < 2 * PASO || campo.bordeFranja < 2 * PASO
      if (campo.cultivo === CULTIVO.girasol || dudoso) manzanaGruesa[b * LADO + a] = dudoso ? -2 : campo.indice
    }
  }
  const puedeSer = (x: number, z: number, k: number): boolean => {
    const a = Math.floor((x + GIRASOLES.radio) / PASO)
    const b = Math.floor((z + GIRASOLES.radio) / PASO)
    if (a < 0 || b < 0 || a >= LADO || b >= LADO) return false
    const m = manzanaGruesa[b * LADO + a]
    return m === -2 || m === k
  }
  for (let j = -n / 2; j < n / 2; j += 1) {
    for (let i = -n / 2; i < n / 2; i += 1) {
      const [sx, sz, k] = sitioCelda(CELDAS_CAMPOS, i, j)
      if (Math.hypot(sx, sz) > GIRASOLES.radio + CAMPOS.alcance) continue
      const tipo = Math.floor(CELDAS_CAMPOS.valores[k + 3])
      if (tipo !== MANZANA.franjas && tipo !== MANZANA.girasoles) continue
      const angulo = CELDAS_CAMPOS.valores[k + 2]
      const [dx, dz] = [Math.cos(angulo), Math.sin(angulo)]
      // El corazón en el marco de la manzana: sólo se recorre lo que cae en el círculo.
      const hu = -sx * dx - sz * dz
      const hv = sx * dz - sz * dx
      const { alcance } = CAMPOS
      const v0 = Math.max(-alcance, hv - GIRASOLES.radio)
      const v1 = Math.min(alcance, hv + GIRASOLES.radio)
      const u0 = Math.max(-alcance, hu - GIRASOLES.radio)
      const u1 = Math.min(alcance, hu + GIRASOLES.radio)
      // Las hileras van a lo largo de las franjas (a lo ancho, cada 0,9 m) desde el punto de la manzana.
      for (let v = Math.ceil(v0 / CAMPO.entreHileras) * CAMPO.entreHileras; v <= v1; v += CAMPO.entreHileras) {
        for (let u = Math.ceil(u0 / CAMPO.entrePlantas) * CAMPO.entrePlantas; u <= u1; u += CAMPO.entrePlantas) {
          const x0 = sx + dx * u - dz * v
          const z0 = sz + dz * u + dx * v
          if (Math.hypot(x0, z0) > GIRASOLES.radio || !puedeSer(x0, z0, k)) continue
          const px = x0 + (azar() - 0.5) * 0.24
          const pz = z0 + (azar() - 0.5) * 0.18
          campoEn(CELDAS_CAMPOS, px, pz, campo)
          if (campo.indice !== k || campo.cultivo !== CULTIVO.girasol || !dentroDelCultivo(campo, px, pz)) continue
          if (azar() < 0.04) continue
          const altura = 1.4 + 0.7 * azar()
          planta(px, pz, altura, 0.15 + 0.06 * azar(), TIPO_FLOR.girasol, 95 + (azar() - 0.5) * 30, 15 + 20 * azar())
          // Hojas grandes en los que quedan cerca de la cámara al final.
          if (Math.hypot(px - FINAL[0], pz - FINAL[2]) < 60) {
            for (let h = 0; h < 3; h += 1) {
              hojas.push([px, altura * (0.3 + 0.2 * h + 0.06 * azar()), pz, 0.2 + 0.12 * azar(), 360 * azar() * RADIANES, (20 + 30 * azar()) * RADIANES, FORMA_HOJA.girasol, altura])
            }
          }
        }
      }
    }
  }

  // El corazón y el ramo, con su propio azar: lo que cambie en los campos no los baraja.
  azar = crearAzar(semilla + 1)

  // Las flores del ramo dentro del corazón, en las proporciones del ramo de las fotos: mucha
  // gipsófila, rosas, claveles de poeta, bocas de dragón, alguna gerbera, lirios con sus capullos y
  // dianthus verdes. Más densas junto a la punta, donde se posa la cámara.
  const reparto: readonly (readonly [number, number])[] = [
    [TIPO_FLOR.gipsofila, 0.25],
    [TIPO_FLOR.rosa, 0.2],
    [TIPO_FLOR.clavelina, 0.2],
    [TIPO_FLOR.bocaDeDragon, 0.12],
    [TIPO_FLOR.gerbera, 0.08],
    [TIPO_FLOR.lirio, 0.05],
    [TIPO_FLOR.capulloLirio, 0.05],
    [TIPO_FLOR.bolaVerde, 0.05],
  ]
  const elegirTipo = (pesos: readonly (readonly [number, number])[] = reparto): number => {
    let r = azar()
    for (const [tipo, peso] of pesos) {
      if (r < peso) return tipo
      r -= peso
    }
    return TIPO_FLOR.gipsofila
  }
  // Alturas y tamaños (radio de la cabeza; en las espigas, su medio ancho) de verdad (m).
  const medidas: Record<number, { altura: [number, number]; tamano: [number, number] }> = {
    [TIPO_FLOR.gerbera]: { altura: [0.34, 0.5], tamano: [0.05, 0.06] },
    [TIPO_FLOR.rosa]: { altura: [0.34, 0.52], tamano: [0.036, 0.048] },
    [TIPO_FLOR.lirio]: { altura: [0.46, 0.66], tamano: [0.075, 0.09] },
    [TIPO_FLOR.clavelina]: { altura: [0.26, 0.4], tamano: [0.038, 0.05] },
    [TIPO_FLOR.bocaDeDragon]: { altura: [0.4, 0.62], tamano: [0.03, 0.04] },
    [TIPO_FLOR.gipsofila]: { altura: [0.3, 0.48], tamano: [0.07, 0.1] },
    [TIPO_FLOR.capulloLirio]: { altura: [0.5, 0.72], tamano: [0.016, 0.022] },
    [TIPO_FLOR.bolaVerde]: { altura: [0.28, 0.4], tamano: [0.022, 0.03] },
  }
  // El ramo en primer plano, delante de la cámara final (en su marco: adelante y a la derecha, m).
  const [adelanteX, adelanteZ] = ADELANTE_FINAL
  const [derechaX, derechaZ] = [-adelanteZ, adelanteX]
  const enMarco = (adelante: number, derecha: number): [number, number] => [
    FINAL[0] + adelanteX * adelante + derechaX * derecha,
    FINAL[2] + adelanteZ * adelante + derechaZ * derecha,
  ]
  /**
   * Las hojas de una planta del corazón, pocas y como las de verdad: las de la gerbera, en roseta a
   * ras del suelo; las del lirio, largas, subiendo por el tallo; las de la rosa, pequeñas y algo
   * caídas; un par de hojas estrechas en las demás. (Hojas sueltas por el suelo, grandes y con tinta
   * negra, cargaban demasiado el suelo.)
   */
  const hojasDePlanta = (x: number, z: number, alto: number, tipo: number): void => {
    const hoja = (altura: number, tamano: number, inclinacion: number, forma: number): void => {
      hojas.push([x + (azar() - 0.5) * 0.02, altura, z + (azar() - 0.5) * 0.02, tamano, 360 * azar() * RADIANES, inclinacion * RADIANES, forma, alto])
    }
    if (tipo === TIPO_FLOR.gerbera) {
      for (let k = 0; k < 3; k += 1) hoja(0.015 + 0.02 * azar(), 0.07 + 0.03 * azar(), 10 + 15 * azar(), FORMA_HOJA.larga)
    } else if (tipo === TIPO_FLOR.lirio || tipo === TIPO_FLOR.capulloLirio) {
      const cuantas = tipo === TIPO_FLOR.lirio ? 2 : 1
      for (let k = 0; k < cuantas; k += 1) hoja(alto * (0.2 + 0.35 * azar()), 0.07 + 0.04 * azar(), 45 + 20 * azar(), FORMA_HOJA.larga)
    } else if (tipo === TIPO_FLOR.rosa) {
      for (let k = 0; k < 2; k += 1) hoja(alto * (0.3 + 0.35 * azar()), 0.028 + 0.014 * azar(), 25 + 20 * azar(), FORMA_HOJA.girasol)
    } else if (tipo === TIPO_FLOR.gipsofila) {
      if (azar() < 0.5) hoja(alto * (0.3 + 0.3 * azar()), 0.025 + 0.01 * azar(), 40 + 20 * azar(), FORMA_HOJA.larga)
    } else {
      for (let k = 0; k < 2; k += 1) hoja(alto * (0.2 + 0.4 * azar()), 0.035 + 0.02 * azar(), 40 + 20 * azar(), FORMA_HOJA.larga)
    }
  }
  /** Una ramita de eucalipto del ramo junto al tallo (hoja redonda gris azulada). */
  const eucalipto = (x: number, z: number, alto: number): void => {
    hojas.push([x + (azar() - 0.5) * 0.05, alto * (0.3 + 0.4 * azar()), z + (azar() - 0.5) * 0.05, 0.035 + 0.02 * azar(), 360 * azar() * RADIANES, (25 + 35 * azar()) * RADIANES, FORMA_HOJA.eucalipto, alto])
  }
  const deFrente = 135 // rumbo (°) de una cara que mira a la cámara final
  // Cómo se ve cada cabeza del ramo desde la cámara final: su dirección (a la derecha y hacia abajo,
  // rad) y su radio aparente (las espigas, más altas que anchas, cuentan el doble).
  const vistas: { adelante: number; x: number; y: number; r: number }[] = []
  const ver = (adelante: number, derecha: number, alto: number, tamano: number, tipo: number) => ({
    adelante,
    x: Math.atan2(derecha, adelante),
    y: Math.atan2(FINAL[1] - alto, adelante),
    r: (tamano * (tipo === TIPO_FLOR.bocaDeDragon || tipo === TIPO_FLOR.capulloLirio ? 2 : 1)) / Math.hypot(adelante, derecha, FINAL[1] - alto),
  })
  for (const [tipo, adelante, derecha, alto, tamano, variante, inclinacion] of RAMO) {
    vistas.push(ver(adelante, derecha, alto, tamano, tipo))
    const [x, z] = enMarco(adelante, derecha)
    cabezas.push([x, 0, z, alto, tamano, tipo, variante, azar(), (deFrente + (azar() - 0.5) * 16) * RADIANES, inclinacion * RADIANES])
    tallos.push([x, 0, z, alto, GROSOR_TALLO[tipo], tipo, cabezas[cabezas.length - 1][7]])
    // Sus hojas y, como en el ramo, eucalipto.
    hojasDePlanta(x, z, alto, tipo)
    eucalipto(x, z, alto)
  }
  // El relleno, de delante atrás: donde taparía a una de delante, no va; tapada del todo, tampoco.
  const [adelante0, adelante1] = RELLENO.adelante
  let puestas = 0
  for (let n = 0; n < RELLENO.intentos && puestas < RELLENO.flores; n += 1) {
    const adelante = adelante0 + (adelante1 - adelante0) * Math.sqrt(azar())
    const u = azar() * 2 - 1
    const derecha = u * (0.4 + 0.5 * (adelante - adelante0))
    const tipo = elegirTipo(REPARTO_RELLENO)
    const { tamano } = medidas[tipo]
    const tam = tamano[0] + (tamano[1] - tamano[0]) * azar()
    const alto = 0.3 + (0.2 * (adelante - adelante0)) / (adelante1 - adelante0) + 0.1 * (1 - u * u) + 0.06 * azar()
    const vista = ver(adelante, derecha, alto, tam, tipo)
    const choca = vistas.some((o) => {
      const d = Math.hypot(vista.x - o.x, vista.y - o.y)
      return adelante < o.adelante ? d < (vista.r + o.r) * 0.75 : d < o.r * 0.7 - vista.r * 0.3
    })
    if (choca) continue
    vistas.push(vista)
    puestas += 1
    const [x, z] = enMarco(adelante, derecha)
    const cara = tipo === TIPO_FLOR.gerbera ? 10 + 20 * azar() : 25 + 20 * azar()
    cabezas.push([x, 0, z, alto, tam, tipo, azar(), azar(), (deFrente + (azar() - 0.5) * 40) * RADIANES, cara * RADIANES])
    tallos.push([x, 0, z, alto, GROSOR_TALLO[tipo], tipo, cabezas[cabezas.length - 1][7]])
    hojasDePlanta(x, z, alto, tipo)
    if (azar() < 0.6) eucalipto(x, z, alto)
  }
  // Las hojas grandes de aspidistra que enmarcan el ramo, como en el de las fotos.
  for (const [adelante, derecha, rumboHoja, tamano] of ASPIDISTRAS) {
    const [x, z] = enMarco(adelante, derecha)
    hojas.push([x, 0.08, z, tamano, rumboHoja * RADIANES, 58 * RADIANES, FORMA_HOJA.aspidistra, 0.4])
  }
  // Densidad (flores por m²): tupida en todo el corazón (se pasea por él) y más junto a la cámara
  // final, como un ramo. Delante de la cámara, sólo el ramo (nada que lo tape).
  const DENSIDAD = { cerca: 36, lejos: 22, alcance: 6 }
  const ladoCaja = 2.4 * CORAZON.escala
  const intentos = Math.round(ladoCaja * ladoCaja * DENSIDAD.cerca)
  for (let n = 0; n < intentos; n += 1) {
    const x = (azar() - 0.5) * ladoCaja
    const z = (azar() - 0.5) * ladoCaja
    const d = distanciaCorazon(x, z)
    if (d > -CORAZON.ribete - 0.2) continue
    const aCamara = Math.hypot(x - FINAL[0], z - FINAL[2])
    const adelante = (x - FINAL[0]) * adelanteX + (z - FINAL[2]) * adelanteZ
    const lateral = (x - FINAL[0]) * derechaX + (z - FINAL[2]) * derechaZ
    // En lo que ve la cámara final hasta 2 m, sólo el ramo (nada que lo tape); pegado a ella, nada.
    // A los lados y detrás, sí: girando la cabeza o mirando abajo se veía el suelo pelado. A sus
    // pies, flores bajas, por debajo del borde de la imagen de la cámara final (su rayo más bajo
    // baja 1 m cada 2).
    if (Math.hypot(adelante, lateral) < 0.45) continue
    const enVista = adelante > 0.15 && adelante < 2.1 && Math.abs(lateral) < 0.35 + 0.85 * adelante
    if (enVista && adelante > 1.15) continue
    const densidad = DENSIDAD.lejos + (DENSIDAD.cerca - DENSIDAD.lejos) * Math.exp(-aCamara / DENSIDAD.alcance)
    if (azar() > densidad / DENSIDAD.cerca) continue
    const tipo = elegirTipo()
    const { altura, tamano } = medidas[tipo]
    let alto = altura[0] + (altura[1] - altura[0]) * azar()
    if (enVista) {
      if (tipo === TIPO_FLOR.bocaDeDragon || tipo === TIPO_FLOR.lirio || tipo === TIPO_FLOR.capulloLirio) continue
      alto = Math.min(alto, FINAL[1] - 0.5 * adelante - tamano[1] - 0.05)
      if (alto < 0.08) continue
    }
    // Miran más hacia arriba y a todos lados que las del ramo: se ven paseando desde cualquier sitio.
    planta(x, z, alto, tamano[0] + (tamano[1] - tamano[0]) * azar(), tipo, 135 + (azar() - 0.5) * 140, 40 + 30 * azar())
    hojasDePlanta(x, z, alto, tipo)
    if (azar() < 0.15) eucalipto(x, z, alto)
  }

  // El ribete: gipsófila blanca y rosa a lo largo del borde del corazón.
  for (let n = 0; n < 120000; n += 1) {
    const x = (azar() - 0.5) * 2.4 * CORAZON.escala
    const z = (azar() - 0.5) * 2.4 * CORAZON.escala
    const d = distanciaCorazon(x, z)
    if (d > 0.1 || d < -CORAZON.ribete) continue
    if (azar() > 0.35) continue
    planta(x, z, 0.3 + 0.2 * azar(), 0.09 + 0.05 * azar(), TIPO_FLOR.gipsofila, 135, 40)
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
    talloForma: plano(tallos, 3, 4, 7),
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
