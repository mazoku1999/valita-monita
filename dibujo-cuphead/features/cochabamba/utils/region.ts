/**
 * La geografía de la región de Cochabamba, en un plano tangente centrado en el corazón de flores
 * (Tiquipaya), en km: x hacia el este, y hacia el norte. Una sola función de altura (m sobre el
 * nivel del mar) para todo: el mapa de la Tierra (su textura, `texturaRegion.ts`), el relieve 3D
 * que se ve al bajar y el valle. De geografía real, simplificada y de dibujo:
 *
 * - El frente de los Andes, donde la cordillera cae a las tierras bajas: del Beni por el Chapare
 *   (Villa Tunari, al noreste, ya en el llano) hasta el oeste de Santa Cruz, con las serranías
 *   subandinas paralelas.
 * - La Cordillera Oriental entre el frente y el Altiplano: sierras de 4.000–5.000 m (la Real, cerca
 *   de La Paz, supera los 6.000) y valles interandinos; en su centro, el valle de Cochabamba (a
 *   2.570 m) con el Tunari al norte (ver `valleLocal`).
 * - El Altiplano al oeste (3.700–3.850 m, llano), con el Titicaca, el Poopó y los salares de Uyuni
 *   y Coipasa, y la Cordillera Occidental de volcanes en la frontera con Chile.
 */

/** Centro del plano: el corazón de flores, 8,2 km al oeste y 1,6 km al norte del centro de la ciudad. */
export const ORIGEN_REGION = { latitud: -17.3756, longitud: -66.2375 } as const

/** El fondo del valle de Cochabamba (m sobre el nivel del mar): la altura 0 de la escena del valle. */
export const PISO_VALLE = 2570

/** km por grado de latitud y de longitud en el centro del plano. */
export const KM_POR_GRADO = { latitud: 111.2, longitud: 111.2 * Math.cos((ORIGEN_REGION.latitud * Math.PI) / 180) } as const

export const enKm = (latitud: number, longitud: number): [number, number] => [
  (longitud - ORIGEN_REGION.longitud) * KM_POR_GRADO.longitud,
  (latitud - ORIGEN_REGION.latitud) * KM_POR_GRADO.latitud,
]

type Punto = readonly [number, number]

/** El frente de los Andes (de noroeste a sureste): la cordillera queda a su derecha (suroeste). */
const FRENTE: readonly Punto[] = [
  [-700, 1500], [-500, 1100], [-330, 760], [-230, 520], [-160, 360], [-137, 326], [-38, 197], [36, 97], [87, 45], [152, 20], [237, -19], [280, -69], [296, -181], [301, -347], [290, -436], [282, -520], [262, -760], [245, -1100], [225, -1500],
]
/** Borde este del Altiplano (de norte a sur): el Altiplano queda a su derecha (oeste). */
const ALTIPLANO: readonly Punto[] = [
  [-900, 1500], [-650, 1000], [-470, 640], [-360, 420], [-275, 215], [-247, 172], [-165, 81], [-113, 42], [-102, -25], [-75, -100], [-65, -200], [-70, -320], [-85, -440], [-95, -520], [-110, -760], [-125, -1100], [-140, -1500],
]
/** La Cordillera Occidental, de volcanes (de norte a sur). */
const OCCIDENTAL: readonly Punto[] = [
  [-1050, 1500], [-800, 800], [-600, 420], [-440, 150], [-388, 42], [-346, -14], [-282, -80], [-261, -236], [-230, -340], [-208, -436], [-195, -520], [-180, -760], [-170, -1100], [-160, -1500],
]
/** La costa del Pacífico (de norte a sur): el mar queda a su derecha (oeste). */
const COSTA: readonly Punto[] = [
  [-1200, 1500], [-900, 300], [-714, 97], [-613, 38], [-541, -29], [-433, -123], [-415, -314], [-420, -500], [-441, -698], [-450, -1000], [-440, -1500],
]
/** Volcanes y nevados notables: posición (km), altura (m) y radio (km). */
const CUMBRES: readonly (readonly [number, number, number, number])[] = [
  [-282, -80, 6540, 5], // Sajama
  [-247, 172, 6360, 6], // Illampu
  [-165, 81, 6430, 6], // Illimani
  [-213, 128, 6090, 5], // Huayna Potosí
  [-300, -130, 6100, 4.5], // Parinacota y Pomerape
  [-240, -300, 5400, 4.5], // Tunupa
]

/** Lagos (centro, semiejes, giro en rad y altura del agua en m) y salares. */
export const LAGOS: readonly { centro: Punto; semiejes: Punto; giro: number; nivel: number }[] = [
  { centro: [-330, 170], semiejes: [88, 32], giro: 0.94, nivel: 3810 }, // Titicaca
  { centro: [-277, 106], semiejes: [22, 16], giro: 0.5, nivel: 3810 }, // Wiñaymarka
  { centro: [-86, -153], semiejes: [15, 27], giro: 0.2, nivel: 3686 }, // Poopó
  { centro: [-92, -75], semiejes: [7, 9], giro: 0, nivel: 3690 }, // Uru Uru
  { centro: [38, 16], semiejes: [4.5, 1.8], giro: 0.35, nivel: 3220 }, // Corani
]
export const SALARES: readonly { centro: Punto; semiejes: Punto; giro: number; nivel: number }[] = [
  { centro: [-144, -308], semiejes: [68, 50], giro: 0.25, nivel: 3656 }, // Uyuni
  { centro: [-208, -219], semiejes: [26, 20], giro: 0.4, nivel: 3657 }, // Coipasa
]

const suave = (borde0: number, borde1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - borde0) / (borde1 - borde0)))
  return t * t * (3 - 2 * t)
}

/** Azar entero determinista (0..1) de una celda. */
const azar = (x: number, y: number): number => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export const ruido = (x: number, y: number): number => {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = azar(xi, yi)
  const b = azar(xi + 1, yi)
  const c = azar(xi, yi + 1)
  const d = azar(xi + 1, yi + 1)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}

export const fbm = (x: number, y: number): number =>
  (0.5 * ruido(x, y) + 0.25 * ruido(2.03 * x + 17.1, 2.03 * y + 5.3) + 0.125 * ruido(4.1 * x + 3.7, 4.1 * y + 29.9)) / 0.875

/** Ruido de crestas (1 en las crestas): las quebradas y los filos de la cordillera. */
export const crestas = (x: number, y: number): number => {
  const a = 1 - Math.abs(2 * ruido(x, y) - 1)
  const b = 1 - Math.abs(2 * ruido(2.1 * x + 9.2, 2.1 * y + 1.7) - 1)
  return 0.65 * a * a + 0.35 * b * b
}

/**
 * Montañas: crestas multifractales (cada octava sólo se suma donde la anterior ya es cresta, como
 * los filos de una cordillera erosionada, con valles anchos y suaves) sobre un dominio deformado
 * (sin rejillas ni costuras). Devuelve 0..1 (1 en los filos).
 */
export const montanas = (x: number, y: number, longitudOnda: number, octavas = 5): number => {
  const deformacion = longitudOnda * 0.45
  const u = x + deformacion * (fbm(x / (longitudOnda * 1.6), y / (longitudOnda * 1.6)) - 0.5) * 2
  const v = y + deformacion * (fbm(x / (longitudOnda * 1.6) + 5.2, y / (longitudOnda * 1.6) + 9.4) - 0.5) * 2
  let frecuencia = 1 / longitudOnda
  let amplitud = 1
  let suma = 0
  let total = 0
  let peso = 1
  for (let k = 0; k < octavas; k += 1) {
    let n = 1 - Math.abs(2 * ruido(u * frecuencia + k * 7.31, v * frecuencia + k * 3.17) - 1)
    n *= n
    n *= peso
    peso = Math.min(1, Math.max(0, n * 1.7))
    suma += n * amplitud
    total += amplitud
    frecuencia *= 2.15
    amplitud *= 0.52
  }
  return suma / total
}

/** Distancia (km) de p al segmento ab, y de qué lado queda (1: a la izquierda de a→b). */
const aSegmento = (px: number, py: number, a: Punto, b: Punto): [number, number] => {
  const abx = b[0] - a[0]
  const aby = b[1] - a[1]
  const apx = px - a[0]
  const apy = py - a[1]
  const h = Math.min(1, Math.max(0, (apx * abx + apy * aby) / (abx * abx + aby * aby)))
  const dx = apx - abx * h
  const dy = apy - aby * h
  return [Math.hypot(dx, dy), abx * apy - aby * apx > 0 ? 1 : -1]
}

/** Distancia con signo a una polilínea (positiva a su izquierda) y el rumbo del tramo más cercano. */
const aPolilinea = (px: number, py: number, linea: readonly Punto[]): [number, number] => {
  let mejor = Number.POSITIVE_INFINITY
  let signo = 1
  let giro = 0
  for (let i = 0; i + 1 < linea.length; i += 1) {
    const [d, lado] = aSegmento(px, py, linea[i], linea[i + 1])
    if (d < mejor) {
      mejor = d
      signo = lado
      giro = Math.atan2(linea[i + 1][1] - linea[i][1], linea[i + 1][0] - linea[i][0])
    }
  }
  return [mejor * signo, giro]
}

/** Dentro de una elipse (distancia normalizada: < 1 dentro). */
const enElipse = (x: number, y: number, e: { centro: Punto; semiejes: Punto; giro: number }): number => {
  const dx = x - e.centro[0]
  const dy = y - e.centro[1]
  const c = Math.cos(e.giro)
  const s = Math.sin(e.giro)
  const u = (c * dx + s * dy) / e.semiejes[0]
  const v = (-s * dx + c * dy) / e.semiejes[1]
  // Contorno irregular, lobulado, como el de los salares y lagos de verdad.
  return Math.hypot(u, v) * (1 + 0.32 * (fbm(x / 14, y / 14) - 0.5) + 0.12 * (fbm(x / 4, y / 4) - 0.5))
}

/**
 * El valle de Cochabamba y el Tunari (m sobre el fondo del valle; x hacia el este y z hacia el sur,
 * en m): el pie del Tunari a ~2 km del campo y su cresta a ~9 km, más allá de la cual el monte baja
 * hacia los valles del norte; serranías al sur; el valle se cierra al este y al oeste; el cerro de
 * San Pedro; lomas suaves en el fondo, llano alrededor del campo de flores.
 */
const valleLocal = (x: number, z: number): number => {
  const alNorte = -z - 2100 - 420 * Math.sin(x / 5300 + 1.3) - 230 * Math.sin(x / 2100 + 0.4)
  const subida = suave(0, 7400, alNorte)
  const cresta = 2250 + 840 * (fbm(x / 5200, 3.1) - 0.5)
  let h = Math.pow(subida, 1.35) * cresta + (crestas(x / 1700, z / 1700) - 0.45) * 520 * subida
  // Pasada la cresta, el monte baja despacio hacia los valles del norte.
  h *= 1 - 0.4 * suave(9000, 32000, alNorte)
  const alSur = z - 9500 - 700 * Math.sin(x / 4100 + 2.0)
  h = Math.max(h, Math.pow(suave(0, 5500, alSur), 1.2) * (620 + 300 * (fbm(x / 3000, z / 3000 + 7) - 0.5)))
  // La cuenca se cierra al este y al oeste con un borde irregular (no en línea recta).
  const bx = (x - 2500) / 25000
  const bz = (z - 2000) / 12500
  const cuenca = Math.hypot(bx, bz) - 1 + 0.22 * (fbm(x / 6500 + 3, z / 6500) - 0.5) + 0.08 * (fbm(x / 1800, z / 1800 + 5) - 0.5)
  h = Math.max(h, suave(0, 0.32, cuenca) * (780 + 360 * (fbm(x / 2500 + 3, z / 2500) - 0.5)))
  const dx = x - 9800
  const dz = z - 3600
  h += 290 * Math.exp(-(dx * dx + dz * dz) / (2 * 520 * 520))
  h += 34 * (fbm(x / 1600, z / 1600) - 0.45) * suave(700, 2600, Math.hypot(x, z))
  return h
}

/** Altura regional (m sobre el nivel del mar), sin el valle de Cochabamba; `octavas` de sierras. */
const alturaRegional = (x: number, y: number, octavas: number): number => {
  const [dFrente] = aPolilinea(x, y, FRENTE)
  const [dAltiplano] = aPolilinea(x, y, ALTIPLANO)
  const [dOccidental] = aPolilinea(x, y, OCCIDENTAL)
  // Dentro de la cordillera, a la derecha del frente; el Altiplano, a la derecha de su borde.
  const dentro = -dFrente
  const enAltiplano = -dAltiplano

  // Las tierras bajas, casi llanas, con lomas suaves.
  let h = 200 + 140 * fbm(x / 70, y / 70) + 60 * fbm(x / 12, y / 12)
  // La Cordillera Oriental: sube desde el frente (la ladera de las yungas, en 40 km) a una base de
  // 2.300–3.300 m de mesetas y valles, con sierras multifractales encima (los valles quedan
  // anchos y los filos, afilados), más altas junto al Altiplano (la Real, el Tunari).
  const cordillera = suave(-6, 42, dentro)
  const base = 2300 + 1000 * fbm(x / 90 + 3.3, y / 90 + 1.1)
  const relieve = montanas(x, y, 55, octavas)
  const junto = Math.exp(-(((enAltiplano + 22) / 32) ** 2))
  const oriental = base + relieve * (1900 + 1500 * junto) - 350
  h += (oriental - h) * Math.pow(cordillera, 0.9)
  // Serranías subandinas: filos largos norte-sur en los primeros 70 km, hacia Santa Cruz.
  if (y < 20 && dentro > -5 && dentro < 90) {
    const filo = 1 - Math.abs(2 * ruido(x / 7 + 3.1, y / 45 + 7.7) - 1)
    const subandina = 900 * filo * filo * suave(0, 10, dentro) * (1 - suave(55, 85, dentro)) * suave(20, -30, y)
    h = Math.max(h, 600 + subandina + 500 * suave(0, 60, dentro))
  }
  // El Altiplano: llano, a 3.700–3.850 m, con lomas bajas.
  const altiplano = suave(-4, 20, enAltiplano)
  const meseta = 3740 + 110 * fbm(x / 30, y / 30) + 380 * Math.max(0, montanas(x, y, 40, Math.min(3, octavas)) - 0.35)
  h += (meseta - h) * altiplano
  // La Cordillera Occidental: una franja de 4.000–4.600 m con volcanes nevados sueltos.
  const occidental = Math.exp(-((dOccidental / 26) ** 2))
  if (occidental > 0.02) h = Math.max(h, 3760 + 750 * occidental * (0.5 + 0.9 * montanas(x, y, 30, Math.min(3, octavas))))
  for (const [cx, cy, alto, radio] of CUMBRES) {
    const d = Math.hypot(x - cx, y - cy)
    if (d < radio * 3) h = Math.max(h, alto - (alto - 4000) * Math.min(1, Math.pow(d / (radio * 2.2), 0.6)))
  }
  // Hacia el Pacífico, el desierto de Atacama baja hasta la costa.
  const [dCosta] = aPolilinea(x, y, COSTA)
  if (dCosta < 160) h *= suave(-10, 160, dCosta)
  // Lagos y salares, llanos a su nivel.
  for (const lago of LAGOS) {
    const e = enElipse(x, y, lago)
    if (e < 1.25) h += (lago.nivel - 8 - h) * (1 - suave(0.98, 1.25, e))
  }
  for (const salar of SALARES) {
    const e = enElipse(x, y, salar)
    if (e < 1.3) h += (salar.nivel - h) * (1 - suave(0.95, 1.3, e))
  }
  return h
}

/**
 * Altura (m sobre el nivel del mar) en (x, y) km: la regional y, en el centro, el valle. Con menos
 * `octavas` es más rápida (para la textura de lejos, donde un texel mide km).
 */
export const alturaRegion = (x: number, y: number, octavas = 5): number => {
  const r = Math.hypot(x, y)
  const regional = r > 32 ? alturaRegional(x, y, octavas) : 0
  if (r >= 48) return regional
  const local = PISO_VALLE + valleLocal(x * 1000, -y * 1000)
  if (r <= 32) return local
  const w = suave(32, 48, r)
  return local + (regional - local) * w
}

/**
 * Humedad (0 seco, 1 húmedo): alta en las tierras bajas y las laderas que miran al noreste (las
 * yungas del Chapare), baja en el Altiplano y hacia el Chaco, al sur.
 */
export const humedadRegion = (x: number, y: number): number => {
  const [dFrente] = aPolilinea(x, y, FRENTE)
  const [dAltiplano] = aPolilinea(x, y, ALTIPLANO)
  const [dCosta] = aPolilinea(x, y, COSTA)
  const dentro = -dFrente
  let m = 0.35 + 0.6 * (1 - suave(10, 110, dentro))
  // Los valles y sierras de Cochabamba, templados, son más verdes que el sur seco.
  m += 0.16 * (1 - suave(80, 200, Math.hypot(x, y)))
  m -= 0.3 * suave(-30, 30, -dAltiplano)
  m *= 1 - 0.45 * suave(-120, -320, y) * suave(-40, 20, -dentro)
  // El desierto de Atacama, entre la Occidental y el mar.
  m *= 0.2 + 0.8 * suave(60, 260, dCosta)
  m += 0.18 * (fbm(x / 45 + 11, y / 45) - 0.5)
  return Math.min(1, Math.max(0, m))
}

/**
 * Agua de los lagos y sal de los salares: una rampa ancha (0,5 en la orilla, 1 bien dentro) para
 * que la textura, de casi 5 km por texel, dibuje la orilla redonda (con un escalón, salía en
 * dientes de sierra).
 */
export const aguaYSal = (x: number, y: number): [number, number] => {
  let agua = 0
  for (const lago of LAGOS) agua = Math.max(agua, Math.min(1, Math.max(0, (1.3 - enElipse(x, y, lago)) / 0.6)))
  let sal = 0
  for (const salar of SALARES) sal = Math.max(sal, Math.min(1, Math.max(0, (1.25 - enElipse(x, y, salar)) / 0.5)))
  return [agua, sal]
}
