import * as THREE from 'three'
import { CERRO_SAN_PEDRO } from '../constantes/valle'

/**
 * El relieve del valle de Cochabamba (ver `constantes/valle.ts`) y la malla que lo dibuja.
 * La altura se calcula aquí, en la CPU, al crear la malla; los colores (parcelas, ciudad, laguna,
 * laderas, nieve, el campo de girasoles y el corazón) los pinta el shader por píxel.
 */

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

const ruido = (x: number, y: number): number => {
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

const fbm = (x: number, y: number): number =>
  (0.5 * ruido(x, y) + 0.25 * ruido(2.03 * x + 17.1, 2.03 * y + 5.3) + 0.125 * ruido(4.1 * x + 3.7, 4.1 * y + 29.9)) / 0.875

/** Ruido de crestas (1 en las crestas): las quebradas y los filos de la cordillera. */
const crestas = (x: number, y: number): number => {
  const a = 1 - Math.abs(2 * ruido(x, y) - 1)
  const b = 1 - Math.abs(2 * ruido(2.1 * x + 9.2, 2.1 * y + 1.7) - 1)
  return 0.65 * a * a + 0.35 * b * b
}

/** Altura del terreno (m sobre el fondo del valle) en (x, z). */
export const alturaValle = (x: number, z: number): number => {
  // El Tunari, al norte: el pie ondulado a ~2 km del campo y la cresta a ~9 km.
  const alNorte = -z - 2100 - 420 * Math.sin(x / 5300 + 1.3) - 230 * Math.sin(x / 2100 + 0.4)
  const subida = suave(0, 7400, alNorte)
  const cresta = 2250 + 840 * (fbm(x / 5200, 3.1) - 0.5)
  let h = Math.pow(subida, 1.35) * cresta + (crestas(x / 1700, z / 1700) - 0.45) * 520 * subida
  // Serranías bajas del sur.
  const alSur = z - 9500 - 700 * Math.sin(x / 4100 + 2.0)
  h = Math.max(h, Math.pow(suave(0, 5500, alSur), 1.2) * (620 + 300 * (fbm(x / 3000, z / 3000 + 7) - 0.5)))
  // Cierre del valle al este y al oeste.
  const aLosLados = Math.abs(x - 2500) - 21000
  h = Math.max(h, suave(0, 7000, aLosLados) * (720 + 320 * (fbm(x / 2500 + 3, z / 2500) - 0.5)))
  // El cerro de San Pedro, con el Cristo de la Concordia.
  const dx = x - CERRO_SAN_PEDRO.centro[0]
  const dz = z - CERRO_SAN_PEDRO.centro[1]
  h += CERRO_SAN_PEDRO.altura * Math.exp(-(dx * dx + dz * dz) / (2 * CERRO_SAN_PEDRO.radio * CERRO_SAN_PEDRO.radio))
  // Lomas suaves en el fondo del valle; llano alrededor del campo de flores.
  h += 34 * (fbm(x / 1600, z / 1600) - 0.45) * suave(700, 2600, Math.hypot(x, z))
  return h
}

/**
 * Malla polar alrededor del campo: anillos cada vez más separados (unos centímetros junto al
 * corazón, cientos de metros en las montañas lejanas) hasta 45 km, 360 radios. Normales por
 * diferencias finitas a la escala de cada anillo (sin el ruido fino que la malla no puede dibujar).
 */
export function crearTerreno(): THREE.BufferGeometry {
  const radios: number[] = [0]
  let r = 1.5
  while (r < 45000) {
    radios.push(r)
    r = r * 1.045 + 1
  }
  const segmentos = 360
  const posiciones: number[] = []
  const normales: number[] = []
  const normal = new THREE.Vector3()
  for (let i = 0; i < radios.length; i += 1) {
    const radio = radios[i]
    const paso = i + 1 < radios.length ? radios[i + 1] - radio : radio * 0.045
    const e = Math.max(2, 0.5 * paso)
    const vueltas = i === 0 ? 1 : segmentos
    for (let j = 0; j < vueltas; j += 1) {
      const angulo = (j / segmentos) * Math.PI * 2
      const x = radio * Math.cos(angulo)
      const z = radio * Math.sin(angulo)
      posiciones.push(x, alturaValle(x, z), z)
      normal.set(alturaValle(x - e, z) - alturaValle(x + e, z), 2 * e, alturaValle(x, z - e) - alturaValle(x, z + e)).normalize()
      normales.push(normal.x, normal.y, normal.z)
    }
  }
  const indices: number[] = []
  // El centro con el primer anillo.
  for (let j = 0; j < segmentos; j += 1) indices.push(0, 1 + ((j + 1) % segmentos), 1 + j)
  for (let i = 1; i + 1 < radios.length; i += 1) {
    const a = 1 + (i - 1) * segmentos
    const b = 1 + i * segmentos
    for (let j = 0; j < segmentos; j += 1) {
      const j2 = (j + 1) % segmentos
      indices.push(a + j, a + j2, b + j, a + j2, b + j2, b + j)
    }
  }
  const geometria = new THREE.BufferGeometry()
  geometria.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3))
  geometria.setAttribute('normal', new THREE.Float32BufferAttribute(normales, 3))
  geometria.setIndex(indices)
  return geometria
}
