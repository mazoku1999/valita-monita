import * as THREE from 'three'
import { distanciaCorazon } from './corazon'

/**
 * El valle de las flores alrededor del corazón (Tiquipaya, "la ciudad de las flores"), como se ve
 * desde el aire: manzanas irregulares y alargadas a lo largo del eje del valle (celdas de Voronoi
 * sobre un dominio deformado y estirado), separadas por caminos de tierra, setos de árboles o nada,
 * y cada manzana partida en franjas largas de cultivos distintos que, como las parcelas de verdad
 * junto a sus acequias, siguen casi todas el eje (alguna manzana, de través): girasoles (muchos,
 * sobre todo alrededor del corazón y detrás de él, en la vista final), flores de corte rosadas,
 * lilas, fucsias y blancas, prados, alfalfa, maíz y tierra arada. Algunas manzanas son un solo campo
 * de girasoles, otras invernaderos, huertos o un patio con su casa. Un arroyo con su fila de árboles
 * y, alrededor del corazón, un prado. (Con celdas iguales y cada una en su dirección, desde el aire
 * era un panal de vidriera.)
 *
 * La geometría se calcula igual en la GPU (`shaders/campos.ts`, que pinta el suelo con los bordes
 * nítidos a cualquier altura) y aquí, en la CPU (dónde van los girasoles y los árboles). Los datos
 * de cada manzana (dónde está su punto, su dirección, su tipo y su azar) van en una textura
 * pequeña que las dos leen; la deformación es una suma de senos y el cultivo de cada franja sale de
 * cuentas sencillas con esos datos: las mismas cuentas dan el mismo campo.
 *
 * Coordenadas del valle: metros, x al este, z al sur; el corazón en el origen.
 */
export const CAMPOS = {
  /** Largo (a lo largo del eje) y ancho de las manzanas (m). */
  largo: 230,
  ancho: 125,
  /** El eje del valle (rad, del este hacia el sur): noroeste-sureste, hacia donde mira la cámara al final. */
  eje: Math.PI / 4,
  /** Manzanas por lado (la rejilla va de −n/2 a n/2 − 1). */
  n: 24,
  /** Lo más lejos (m) que queda un punto de su manzana del punto de ésta. */
  alcance: 300,
} as const

const EJE_X = Math.cos(CAMPOS.eje)
const EJE_Z = Math.sin(CAMPOS.eje)

/** Del valle (m, ya deformado) a la rejilla de manzanas, y de vuelta. */
const aRejilla = (x: number, z: number): [number, number] => [(x * EJE_X + z * EJE_Z) / CAMPOS.largo, (-x * EJE_Z + z * EJE_X) / CAMPOS.ancho]
const deRejilla = (qx: number, qz: number): [number, number] => [
  qx * CAMPOS.largo * EJE_X - qz * CAMPOS.ancho * EJE_Z,
  qx * CAMPOS.largo * EJE_Z + qz * CAMPOS.ancho * EJE_X,
]

export const CULTIVO = {
  prado: 0,
  girasol: 1,
  rosado: 2,
  lila: 3,
  fucsia: 4,
  blanco: 5,
  alfalfa: 6,
  maiz: 7,
  arado: 8,
  invernadero: 9,
  huerto: 10,
  patio: 11,
} as const

/** Tipos de manzana: en franjas, un campo de girasoles, invernaderos, huerto o patio con casa. */
export const MANZANA = { franjas: 0, girasoles: 1, invernaderos: 2, huerto: 3, patio: 4 } as const

/** Tipos de borde entre dos manzanas (o ninguno: las franjas de las dos se juntan). */
export const BORDE = { ninguno: 0, camino: 1, seto: 2 } as const

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

const fraccion = (x: number): number => x - Math.floor(x)

const suave = (borde0: number, borde1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - borde0) / (borde1 - borde0)))
  return t * t * (3 - 2 * t)
}

/** La deformación del dominio (m): senos, para que la GPU dé exactamente lo mismo. */
export const ondaCampos = (x: number, z: number): [number, number] => [
  34 * Math.sin(z / 237 + 1.3) + 12 * Math.sin(z / 83 + x / 111 + 4.1),
  34 * Math.sin(x / 251 + 0.7) + 12 * Math.sin(x / 77 - z / 123 + 2.2),
]

/** El arroyo (m): una polilínea de noroeste a sur, al oeste del corazón, con meandros. */
export const ARROYO: readonly (readonly [number, number])[] = [
  [-760, -1150],
  [-560, -760],
  [-330, -420],
  [-290, -120],
  [-360, 220],
  [-250, 560],
  [-60, 980],
]

export const distanciaArroyo = (x: number, z: number): number => {
  const qx = x + 26 * Math.sin(z / 61 + 0.4) + 11 * Math.sin(z / 23 + 1.7)
  const qz = z + 14 * Math.sin(x / 57 + 2.1)
  let mejor = Number.POSITIVE_INFINITY
  for (let i = 0; i + 1 < ARROYO.length; i += 1) {
    const [ax, az] = ARROYO[i]
    const [bx, bz] = ARROYO[i + 1]
    const abx = bx - ax
    const abz = bz - az
    const h = Math.min(1, Math.max(0, ((qx - ax) * abx + (qz - az) * abz) / (abx * abx + abz * abz)))
    mejor = Math.min(mejor, Math.hypot(qx - ax - abx * h, qz - az - abz * h))
  }
  return mejor
}

/** El prado alrededor del corazón: distancia (m, negativa dentro) a su borde, que ondula. */
export const distanciaPrado = (x: number, z: number): number => {
  const angulo = Math.atan2(z, x)
  return distanciaCorazon(x, z) - (13 + 4 * Math.sin(angulo * 5 + 1.3) + 2 * Math.sin(angulo * 11 + 0.4))
}

export interface DatosCeldas {
  /**
   * Por manzana: desplazamiento de su punto (0..1, 0..1), dirección de las franjas (rad) y el tipo
   * de manzana más su azar (tipo + azar·0,999).
   */
  valores: Float32Array
}

/**
 * El punto de la manzana (i, j): en el mundo (m, la deformación evaluada en él) y en la rejilla.
 * Se guarda (la cuenta tiene senos y se pide muchas veces).
 */
const sitios = new Map<number, [number, number, number, number, number]>()
const sitioDe = (valores: Float32Array, i: number, j: number): [number, number, number, number, number] => {
  const clave = (i + 4096) * 8192 + (j + 4096)
  const guardado = sitios.get(clave)
  if (guardado) return guardado
  const { n } = CAMPOS
  const k = (Math.min(n - 1, Math.max(0, j + n / 2)) * n + Math.min(n - 1, Math.max(0, i + n / 2))) * 4
  const qx = i + valores[k]
  const qz = j + valores[k + 1]
  const [wx, wz] = deRejilla(qx, qz)
  const [ox, oz] = ondaCampos(wx, wz)
  const sitio: [number, number, number, number, number] = [wx - ox, wz - oz, k, qx, qz]
  sitios.set(clave, sitio)
  return sitio
}

export const sitioCelda = ({ valores }: DatosCeldas, i: number, j: number): [number, number, number] => {
  const [x, z, k] = sitioDe(valores, i, j)
  return [x, z, k]
}

/**
 * El cultivo de la franja `franja` de una manzana, a partir de su azar, lo cerca que está del
 * corazón (0..1) y si queda detrás de él en la vista final: la misma cuenta que en la GPU.
 */
export const cultivoFranja = (semilla: number, franja: number, cerca: number, vista: number): number => {
  // Las franjas van en grupos de una a tres del mismo cultivo (todas distintas, desde el aire era un
  // arcoíris).
  const grupo = Math.floor(franja / (1 + Math.floor(fraccion(semilla * 5.3) * 3)))
  const h = fraccion(semilla * 97.13 + grupo * 0.618034)
  const pesos = [
    0.2 + 0.25 * cerca + 0.45 * vista,
    0.07 + 0.05 * cerca,
    0.06 + 0.04 * cerca,
    0.05 + 0.03 * cerca,
    0.04 + 0.02 * cerca,
    0.08,
    0.17 - 0.07 * cerca,
    0.14 - 0.06 * cerca,
    0.09 - 0.04 * cerca,
  ]
  const cultivos = [CULTIVO.girasol, CULTIVO.rosado, CULTIVO.lila, CULTIVO.fucsia, CULTIVO.blanco, CULTIVO.prado, CULTIVO.alfalfa, CULTIVO.maiz, CULTIVO.arado]
  let total = 0
  for (const peso of pesos) total += peso
  let u = h * total
  for (let i = 0; i < pesos.length; i += 1) {
    if (u < pesos[i]) return cultivos[i]
    u -= pesos[i]
  }
  return CULTIVO.arado
}

/** Cerca del corazón (0..1) y detrás de él en la vista final (0..1), según el punto de la manzana. */
export const cercaYVista = (sx: number, sz: number): [number, number] => {
  const r = Math.hypot(sx, sz)
  const haciaNoroeste = (-sx - sz) * Math.SQRT1_2
  return [1 - suave(140, 620, r), suave(-60, 20, haciaNoroeste) * (1 - suave(260, 380, r))]
}

export function generarCeldas(semilla = 20261010): DatosCeldas {
  const azar = crearAzar(semilla)
  const { n, eje } = CAMPOS
  const valores = new Float32Array(n * n * 4)
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const jx = 0.12 + 0.76 * azar()
      const jz = 0.12 + 0.76 * azar()
      const [x, z] = deRejilla(i - n / 2 + jx, j - n / 2 + jz)
      const r = Math.hypot(x, z)
      const lejos = suave(200, 700, r)
      const u = azar()
      let tipo: number = MANZANA.franjas
      if (r > 110) {
        const girasoles = 0.12 + 0.1 * (1 - lejos)
        if (u < girasoles) tipo = MANZANA.girasoles
        else if (u < girasoles + 0.07 * lejos) tipo = MANZANA.invernaderos
        else if (u < girasoles + 0.07 * lejos + 0.06) tipo = MANZANA.huerto
        else if (u < girasoles + 0.13 * lejos + 0.06) tipo = MANZANA.patio
      }
      // Las franjas siguen el eje (alguna manzana, de través), cada una un poco torcida.
      const angulo = eje + (azar() < 0.28 ? Math.PI / 2 : 0) + (azar() - 0.5) * 0.14
      valores.set([jx, jz, angulo, tipo + 0.999 * azar()], (j * n + i) * 4)
    }
  }
  return { valores }
}

export interface Campo {
  cultivo: number
  /** Dirección de las franjas e hileras (rad) y el punto de la manzana (m). */
  angulo: number
  sitioX: number
  sitioZ: number
  /** Distancia (m) al borde de la manzana y qué borde es (camino o seto). */
  borde: number
  tipoBorde: number
  /** Distancia (m) al borde de la franja, tipo de manzana, índice de la manzana y de la franja. */
  bordeFranja: number
  tipoManzana: number
  indice: number
  franja: number
}

export const crearCampo = (): Campo => ({
  cultivo: 0,
  angulo: 0,
  sitioX: 0,
  sitioZ: 0,
  borde: 0,
  tipoBorde: 0,
  bordeFranja: 0,
  tipoManzana: 0,
  indice: 0,
  franja: 0,
})

/** El ancho de las franjas de una manzana (m), de su azar. */
export const anchoFranjas = (semilla: number): number => 18 + 27 * fraccion(semilla * 7.31)

/** El campo en (x, z): la misma cuenta que `campoEn` de `shaders/campos.ts`. */
export const campoEn = ({ valores }: DatosCeldas, x: number, z: number, destino: Campo): Campo => {
  const { largo, ancho: anchoManzana } = CAMPOS
  const [ox, oz] = ondaCampos(x, z)
  const [qx, qz] = aRejilla(x + ox, z + oz)
  const gi = Math.floor(qx)
  const gj = Math.floor(qz)
  let mejor = Number.POSITIVE_INFINITY
  let mejorI = 0
  let mejorJ = 0
  let elegido: [number, number, number, number, number] = [0, 0, 0, 0, 0]
  for (let dj = -1; dj <= 1; dj += 1) {
    for (let di = -1; di <= 1; di += 1) {
      const s = sitioDe(valores, gi + di, gj + dj)
      const d = (s[3] - qx) * (s[3] - qx) + (s[4] - qz) * (s[4] - qz)
      if (d < mejor) {
        mejor = d
        mejorI = gi + di
        mejorJ = gj + dj
        elegido = s
      }
    }
  }
  // Distancia al borde de la manzana (m): la menor a las mediatrices con las vecinas (rectas también
  // en el valle, con su normal deshecho el estiramiento).
  let borde = Number.POSITIVE_INFINITY
  let vecinoK = elegido[2]
  for (let dj = -2; dj <= 2; dj += 1) {
    for (let di = -2; di <= 2; di += 1) {
      if (di === 0 && dj === 0) continue
      const s = sitioDe(valores, mejorI + di, mejorJ + dj)
      const nx = s[3] - elegido[3]
      const nz = s[4] - elegido[4]
      const enMetros = Math.hypot(nx / largo, nz / anchoManzana)
      if (enMetros < 1e-9) continue
      const d = -(((qx - (elegido[3] + s[3]) / 2) * nx + (qz - (elegido[4] + s[4]) / 2) * nz) / enMetros)
      if (d < borde) {
        borde = d
        vecinoK = s[2]
      }
    }
  }
  const k = elegido[2]
  const angulo = valores[k + 2]
  const tipoYSemilla = valores[k + 3]
  const tipoManzana = Math.floor(tipoYSemilla)
  const semilla = fraccion(tipoYSemilla)
  const azarBorde = fraccion((valores[k + 3] + valores[vecinoK + 3]) * 4.7 + (valores[k] + valores[vecinoK]) * 1.3)
  // Las franjas, a lo ancho de la dirección de la manzana.
  const nx = -Math.sin(angulo)
  const nz = Math.cos(angulo)
  const ancho = anchoFranjas(semilla)
  const u = (x - elegido[0]) * nx + (z - elegido[1]) * nz
  const franja = Math.floor(u / ancho)
  const enFranja = u - franja * ancho
  const [cerca, vista] = cercaYVista(elegido[0], elegido[1])
  let cultivo: number
  if (tipoManzana === MANZANA.girasoles) cultivo = CULTIVO.girasol
  else if (tipoManzana === MANZANA.invernaderos) cultivo = CULTIVO.invernadero
  else if (tipoManzana === MANZANA.huerto) cultivo = CULTIVO.huerto
  else if (tipoManzana === MANZANA.patio) cultivo = CULTIVO.patio
  else cultivo = cultivoFranja(semilla, franja, cerca, vista)
  destino.cultivo = cultivo
  destino.angulo = angulo
  destino.sitioX = elegido[0]
  destino.sitioZ = elegido[1]
  destino.borde = borde
  destino.tipoBorde = azarBorde < 0.28 ? BORDE.camino : azarBorde < 0.58 ? BORDE.seto : BORDE.ninguno
  destino.bordeFranja = tipoManzana === MANZANA.franjas ? Math.min(enFranja, ancho - enFranja) : Number.POSITIVE_INFINITY
  destino.tipoManzana = tipoManzana
  destino.indice = k
  destino.franja = franja
  return destino
}

/** Si en (x, z) puede ir una planta del cultivo de su campo (lejos de bordes, arroyo y prado). */
export const dentroDelCultivo = (campo: Campo, x: number, z: number): boolean => {
  const margen = campo.tipoBorde === BORDE.camino ? 2.8 : campo.tipoBorde === BORDE.seto ? 4.6 : 0.8
  if (campo.borde < margen || campo.bordeFranja < 0.7) return false
  if (distanciaPrado(x, z) < 0) return false
  if (distanciaArroyo(x, z) < 9) return false
  return true
}

/** Las manzanas del valle (las mismas en la GPU y en la CPU). */
export const CELDAS_CAMPOS = generarCeldas()

let texturaCeldas: THREE.DataTexture | null = null

/** La textura de las manzanas para la GPU (se lee con texelFetch: valores exactos), compartida. */
export const obtenerTexturaCeldas = (): THREE.DataTexture => {
  if (texturaCeldas) return texturaCeldas
  texturaCeldas = new THREE.DataTexture(CELDAS_CAMPOS.valores, CAMPOS.n, CAMPOS.n, THREE.RGBAFormat, THREE.FloatType)
  texturaCeldas.minFilter = THREE.NearestFilter
  texturaCeldas.magFilter = THREE.NearestFilter
  texturaCeldas.needsUpdate = true
  return texturaCeldas
}
