import * as THREE from 'three'

/**
 * Datos del sistema solar. Las órbitas son las REALES: elementos keplerianos medios de J2000 y sus
 * tasas por siglo (tabla de JPL "Keplerian Elements for Approximate Positions of the Major
 * Planets", válida de 1800 a 2050), así que al abrir la página los planetas están donde están hoy
 * y giran con sus periodos de verdad, sólo que acelerados.
 *
 * Lo que NO está a escala, porque desde fuera nada se vería: las distancias se comprimen con una
 * potencia (`radioOrbitaVisible`: Neptuno queda a 4.6 veces la Tierra en vez de a 30) y los
 * planetas se agrandan con la raíz de su radio (`radioVisible`). Todo lo demás (excentricidades,
 * inclinaciones, nodos, perihelios, ejes de giro, proporciones entre ellos) es el real.
 */
export type IdPlaneta = 'mercurio' | 'venus' | 'tierra' | 'marte' | 'jupiter' | 'saturno' | 'urano' | 'neptuno'

export interface Planeta {
  readonly id: IdPlaneta
  /** Semieje mayor (UA), excentricidad, inclinación (°), longitud media (°), longitud del perihelio (°), longitud del nodo ascendente (°). */
  readonly a: number
  readonly e: number
  readonly i: number
  readonly l: number
  readonly perihelio: number
  readonly nodo: number
  /** Tasas por siglo juliano (°/siglo) de la longitud media, el perihelio y el nodo. */
  readonly tasaL: number
  readonly tasaPerihelio: number
  readonly tasaNodo: number
  /** Radio ecuatorial en radios terrestres. */
  readonly radio: number
  /** Inclinación del eje de giro respecto a su órbita (°). */
  readonly oblicuidad: number
  /** Índice del aspecto en el shader de planetas (ver `shaders/sistemaSolar.ts`). */
  readonly aspecto: number
}

export const PLANETAS: readonly Planeta[] = [
  { id: 'mercurio', a: 0.38709927, e: 0.20563593, i: 7.00497902, l: 252.2503235, perihelio: 77.45779628, nodo: 48.33076593, tasaL: 149472.67411175, tasaPerihelio: 0.16047689, tasaNodo: -0.12534081, radio: 0.383, oblicuidad: 0.03, aspecto: 0 },
  { id: 'venus', a: 0.72333566, e: 0.00677672, i: 3.39467605, l: 181.9790995, perihelio: 131.60246718, nodo: 76.67984255, tasaL: 58517.81538729, tasaPerihelio: 0.00268329, tasaNodo: -0.27769418, radio: 0.949, oblicuidad: 177.4, aspecto: 1 },
  { id: 'tierra', a: 1.00000261, e: 0.01671123, i: -0.00001531, l: 100.46457166, perihelio: 102.93768193, nodo: 0, tasaL: 35999.37244981, tasaPerihelio: 0.32327364, tasaNodo: 0, radio: 1, oblicuidad: 23.44, aspecto: 2 },
  { id: 'marte', a: 1.52371034, e: 0.0933941, i: 1.84969142, l: -4.55343205, perihelio: -23.94362959, nodo: 49.55953891, tasaL: 19140.30268499, tasaPerihelio: 0.44441088, tasaNodo: -0.29257343, radio: 0.532, oblicuidad: 25.19, aspecto: 3 },
  { id: 'jupiter', a: 5.202887, e: 0.04838624, i: 1.30439695, l: 34.39644051, perihelio: 14.72847983, nodo: 100.47390909, tasaL: 3034.74612775, tasaPerihelio: 0.21252668, tasaNodo: 0.20469106, radio: 11.21, oblicuidad: 3.13, aspecto: 4 },
  { id: 'saturno', a: 9.53667594, e: 0.05386179, i: 2.48599187, l: 49.95424423, perihelio: 92.59887831, nodo: 113.66242448, tasaL: 1222.49362201, tasaPerihelio: -0.41897216, tasaNodo: -0.28867794, radio: 9.45, oblicuidad: 26.73, aspecto: 5 },
  { id: 'urano', a: 19.18916464, e: 0.04725744, i: 0.77263783, l: 313.23810451, perihelio: 170.9542763, nodo: 74.01692503, tasaL: 428.48202785, tasaPerihelio: 0.40805281, tasaNodo: 0.04240589, radio: 4.01, oblicuidad: 97.77, aspecto: 6 },
  { id: 'neptuno', a: 30.06992276, e: 0.00859048, i: 1.77004347, l: -55.12002969, perihelio: 44.96476227, nodo: 131.78422574, tasaL: 218.45945325, tasaPerihelio: -0.32241464, tasaNodo: -0.00508664, radio: 3.88, oblicuidad: 28.32, aspecto: 7 },
]

/** Escala visible: la Tierra a 9 unidades del Sol y las demás con a^0.45 (Neptuno a 41). */
const ESCALA_ORBITA = 9
const EXPONENTE_ORBITA = 0.45
export const radioOrbitaVisible = (ua: number): number => ESCALA_ORBITA * Math.pow(Math.max(ua, 1e-6), EXPONENTE_ORBITA)

/** Tamaño visible: 0.62 unidades para la Tierra, ∝ √radio (Júpiter 2.1, Mercurio 0.38). */
export const radioVisible = (radiosTerrestres: number): number => 0.62 * Math.sqrt(radiosTerrestres)

/** Anillos de Saturno en radios de Saturno: C 1.24–1.53, B 1.53–1.95, Cassini, A 2.03–2.27. */
export const ANILLOS_SATURNO = { interior: 1.24, exterior: 2.27 } as const

const GRADO = Math.PI / 180
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0)
const MS_POR_SIGLO = 36525 * 86400 * 1000

/** Siglos julianos desde J2000 para una fecha. */
export const siglosDesdeJ2000 = (fecha: Date): number => (fecha.getTime() - J2000_MS) / MS_POR_SIGLO

/** Anomalía excéntrica: Kepler (M = E − e·sen E) por Newton. */
const anomaliaExcentrica = (m: number, e: number): number => {
  let ex = m + e * Math.sin(m)
  for (let k = 0; k < 6; k += 1) ex -= (ex - e * Math.sin(ex) - m) / (1 - e * Math.cos(ex))
  return ex
}

/**
 * Posición heliocéntrica REAL (UA) en la eclíptica J2000, pasada a los ejes de la escena: la
 * eclíptica es el plano XZ y el polo norte eclíptico +Y (los planetas giran en sentido antihorario
 * vistos desde +Y). `anomalia` permite recorrer la órbita entera para dibujarla (en radianes de
 * anomalía excéntrica); sin ella se usa la posición del planeta en la fecha.
 */
export function posicionHeliocentrica(planeta: Planeta, siglos: number, destino: THREE.Vector3, anomalia?: number): THREE.Vector3 {
  const l = planeta.l + planeta.tasaL * siglos
  const perihelio = planeta.perihelio + planeta.tasaPerihelio * siglos
  const nodo = (planeta.nodo + planeta.tasaNodo * siglos) * GRADO
  const argumento = perihelio * GRADO - nodo
  const inclinacion = planeta.i * GRADO
  const e = planeta.e
  const media = ((((l - perihelio) % 360) + 540) % 360 - 180) * GRADO
  const ex = anomalia ?? anomaliaExcentrica(media, e)
  const xOrb = planeta.a * (Math.cos(ex) - e)
  const yOrb = planeta.a * Math.sqrt(1 - e * e) * Math.sin(ex)
  const cw = Math.cos(argumento)
  const sw = Math.sin(argumento)
  const cn = Math.cos(nodo)
  const sn = Math.sin(nodo)
  const ci = Math.cos(inclinacion)
  const si = Math.sin(inclinacion)
  const x = (cw * cn - sw * sn * ci) * xOrb + (-sw * cn - cw * sn * ci) * yOrb
  const y = (cw * sn + sw * cn * ci) * xOrb + (-sw * sn + cw * cn * ci) * yOrb
  const z = sw * si * xOrb + cw * si * yOrb
  return destino.set(x, z, -y)
}

/** Comprime una posición heliocéntrica real (UA) a la escala visible, conservando la dirección. */
export function aEscalaVisible(posicion: THREE.Vector3): THREE.Vector3 {
  const r = posicion.length()
  if (r < 1e-9) return posicion
  return posicion.multiplyScalar(radioOrbitaVisible(r) / r)
}

/** Anomalía excéntrica del planeta en la fecha (radianes, en [0, 2π)): la de su estela en la órbita. */
export function anomaliaEnFecha(planeta: Planeta, siglos: number): number {
  const l = planeta.l + planeta.tasaL * siglos
  const perihelio = planeta.perihelio + planeta.tasaPerihelio * siglos
  const media = ((((l - perihelio) % 360) + 540) % 360 - 180) * GRADO
  const ex = anomaliaExcentrica(media, planeta.e)
  return ((ex % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
}

/**
 * Polo norte de giro de cada planeta en coordenadas eclípticas (longitud, latitud en grados),
 * convertido de los polos de la IAU (ascensión recta y declinación J2000). Venus y Urano giran al
 * revés (periodo negativo). El periodo es el real en horas, mostrado en segundos: un día de la
 * Tierra dura 24 s en pantalla, Júpiter gira en 10 s.
 */
export const ROTACION: Readonly<Record<IdPlaneta, { polo: readonly [number, number]; periodo: number }>> = {
  mercurio: { polo: [318.2, 83.0], periodo: 1407.6 },
  venus: { polo: [30.3, 88.8], periodo: -5832.5 },
  tierra: { polo: [90.0, 66.56], periodo: 23.93 },
  marte: { polo: [352.9, 63.3], periodo: 24.62 },
  jupiter: { polo: [247.8, 87.8], periodo: 9.93 },
  saturno: { polo: [79.5, 61.9], periodo: 10.66 },
  urano: { polo: [257.6, 7.7], periodo: -17.24 },
  neptuno: { polo: [319.2, 62.0], periodo: 16.11 },
}

/** Dirección de escena (eclíptica: XZ, norte +Y) de una longitud y latitud eclípticas en grados. */
export function direccionEcliptica(longitud: number, latitud: number, destino: THREE.Vector3): THREE.Vector3 {
  const l = longitud * GRADO
  const b = latitud * GRADO
  return destino.set(Math.cos(b) * Math.cos(l), Math.sin(b), -Math.cos(b) * Math.sin(l))
}
