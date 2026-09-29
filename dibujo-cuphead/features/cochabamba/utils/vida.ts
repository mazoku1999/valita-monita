import * as THREE from 'three'
import { CAMARA_VALLE, direccionRumbo } from '../constantes/valle'
import { distanciaCorazon } from './flores'
import { alturaValle } from './terreno'

/**
 * Lo que da vida al final en el valle (ver `shaders/vida.ts`), con azar fijo:
 * - Mariposas que revolotean sobre las flores, delante de donde se posa la cámara.
 * - Pétalos que la brisa lleva por el aire delante de la cámara (del ramo y alguno de girasol).
 * - Nubes de dibujo en la mañana: unas agarradas a las faldas del Tunari, delante del monte, y otras
 *   en el cielo del oeste, sobre la cresta; todas donde las ve la cámara al bajar y al posarse.
 * - Eucaliptos: una hilera entre el campo y el Tunari, otras a los lados del campo y bosquecillos.
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

const FINAL = CAMARA_VALLE[CAMARA_VALLE.length - 1]
/** Hacia dónde mira la cámara al final (horizontal) y su derecha, en (x, z). */
const ADELANTE = (() => {
  const x = FINAL.mira[0] - FINAL.posicion[0]
  const z = FINAL.mira[2] - FINAL.posicion[2]
  const l = Math.hypot(x, z)
  return [x / l, z / l] as const
})()
const DERECHA = [-ADELANTE[1], ADELANTE[0]] as const

/**
 * La caja de los pétalos, en el marco de la cámara final: a lo ancho (hacia su derecha), en altura
 * sobre el suelo y hacia delante (m). La brisa los lleva hacia la izquierda y algo hacia el fondo.
 */
export const CAJA_PETALOS = { desde: [-6, 0.2, 0.9], lado: [12, 3.4, 11], viento: [-0.42, -0.09, 0.14] } as const

export interface DatosVida {
  /** Mariposas: ancla (x, y, z) y medio ancho de las alas; azares de su vuelo y especie. */
  mariposaAncla: Float32Array
  mariposaAzar: Float32Array
  mariposas: number
  /** Pétalos: ocho azares (posición en la caja, color, giro, volteo...). */
  petaloAzar: Float32Array
  petaloAzar2: Float32Array
  petalos: number
  /** Nubes: base (x, y, z) y medio ancho; azares de su forma. De la más lejana a la más cercana. */
  nubeCentro: Float32Array
  nubeAzar: Float32Array
  nubes: number
  /** Árboles: pie (x, y, z) y altura; azares de su copa. */
  arbolBase: Float32Array
  arbolAzar: Float32Array
  arboles: number
}

export function generarVida(semilla = 20260930): DatosVida {
  const azar = crearAzar(semilla)

  // Mariposas: delante de la cámara final, por encima de las flores.
  const mariposas = 12
  const mariposaAncla = new Float32Array(mariposas * 4)
  const mariposaAzar = new Float32Array(mariposas * 4)
  for (let i = 0; i < mariposas; i += 1) {
    const adelante = 2.4 + 7.5 * Math.pow(azar(), 1.4)
    const lado = (azar() - 0.5) * 1.1 * adelante
    mariposaAncla.set(
      [
        FINAL.posicion[0] + ADELANTE[0] * adelante + DERECHA[0] * lado,
        0.75 + 0.8 * azar(),
        FINAL.posicion[2] + ADELANTE[1] * adelante + DERECHA[1] * lado,
        0.05 + 0.03 * azar(),
      ],
      i * 4,
    )
    mariposaAzar.set([azar(), azar(), azar(), azar()], i * 4)
  }

  const petalos = 110
  const petaloAzar = new Float32Array(petalos * 4)
  const petaloAzar2 = new Float32Array(petalos * 4)
  for (let i = 0; i < petalos; i += 1) {
    petaloAzar.set([azar(), azar(), azar(), azar()], i * 4)
    petaloAzar2.set([azar(), azar(), azar(), azar()], i * 4)
  }

  // Nubes. Rumbos (grados) que ve la cámara al final: del oeste al norte. Las del cielo llevan una
  // marca (el último azar, más 1): el shader les da la profundidad del cielo.
  const nubes: [number, number, number, number, number, number, number, number][] = []
  // Agarradas a las faldas del Tunari: en cada rumbo se busca dónde la ladera llega a su altura y se
  // posa la base por encima del terreno a todo su ancho (una base plana cortada por la ladera se
  // veía rara).
  for (let i = 0; i < 8; i += 1) {
    const [dx, dz] = direccionRumbo(286 + (62 * (i + azar())) / 8)
    const altura = 260 + 1150 * Math.pow(azar(), 0.8)
    let d = 1500
    while (d < 30000 && alturaValle(FINAL.posicion[0] + dx * d, FINAL.posicion[2] + dz * d) < altura) d += 60
    if (d >= 30000) continue
    const ancho = 300 + 330 * azar()
    const x = FINAL.posicion[0] + dx * d
    const z = FINAL.posicion[2] + dz * d
    let base = 0
    for (let k = -2; k <= 2; k += 1) base = Math.max(base, alturaValle(x - dz * ancho * 0.4 * k, z + dx * ancho * 0.4 * k))
    nubes.push([x, base + 20, z, ancho, azar(), azar(), azar(), azar()])
  }
  // En el cielo del oeste y del noroeste, bajas sobre la cresta (altas, tapaban lo alto del cuadro).
  for (let i = 0; i < 8; i += 1) {
    const [dx, dz] = direccionRumbo(262 + (76 * (i + azar())) / 8)
    const d = 18000 + 16000 * azar()
    nubes.push([FINAL.posicion[0] + dx * d, 2400 + 1000 * azar(), FINAL.posicion[2] + dz * d, 900 + 1100 * azar(), azar(), azar(), azar(), 1 + azar()])
  }
  // De atrás adelante: las del cielo comparten profundidad y se tapan por orden de dibujo.
  const distanciaFinal = (n: (typeof nubes)[number]): number => Math.hypot(n[0] - FINAL.posicion[0], n[2] - FINAL.posicion[2])
  nubes.sort((a, b) => distanciaFinal(b) - distanciaFinal(a))

  // Eucaliptos.
  const arboles: number[] = []
  const arbolAzar: number[] = []
  const arbol = (x: number, z: number): void => {
    if (Math.abs(x) < 165 && Math.abs(z) < 165) return
    if (distanciaCorazon(x, z) < 20) return
    arboles.push(x, alturaValle(x, z) - 0.5, z, 15 + 17 * Math.pow(azar(), 0.8))
    arbolAzar.push(azar(), azar(), azar(), azar())
  }
  // Hilera entre el campo y el Tunari, y otras a los lados del campo, junto a los caminos: tramos de
  // árboles con claros entre ellos (una hilera sin huecos parecía un muro).
  const hilera = (desde: number, hasta: number, plantar: (t: number) => void): void => {
    let t = desde
    while (t < hasta) {
      const fin = t + 40 + 130 * azar()
      for (; t < Math.min(fin, hasta); t += 6 + 7 * azar()) plantar(t)
      t += 14 + 40 * azar()
    }
  }
  hilera(-1100, 1100, (x) => arbol(x + (azar() - 0.5) * 3, -238 + (azar() - 0.5) * 6))
  hilera(-232, 420, (z) => arbol(-212 + (azar() - 0.5) * 4, z))
  hilera(-232, 420, (z) => arbol(215 + (azar() - 0.5) * 4, z))
  // Bosquecillos sueltos por el valle.
  for (let g = 0; g < 34; g += 1) {
    const cx = (azar() - 0.5) * 6000
    const cz = (azar() - 0.5) * 3800 + 300
    const n = 5 + Math.floor(azar() * 14)
    for (let k = 0; k < n; k += 1) arbol(cx + (azar() - 0.5) * 110, cz + (azar() - 0.5) * 110)
  }

  return {
    mariposaAncla,
    mariposaAzar,
    mariposas,
    petaloAzar,
    petaloAzar2,
    petalos,
    nubeCentro: new Float32Array(nubes.flatMap((n) => n.slice(0, 4))),
    nubeAzar: new Float32Array(nubes.flatMap((n) => n.slice(4, 8))),
    nubes: nubes.length,
    arbolBase: new Float32Array(arboles),
    arbolAzar: new Float32Array(arbolAzar),
    arboles: arboles.length / 4,
  }
}

/** Marco de la cámara final: su posición, hacia delante y su derecha (en x, z). */
export const MARCO_FINAL = { posicion: FINAL.posicion, adelante: ADELANTE, derecha: DERECHA } as const

/**
 * Las dos alas de una mariposa, instanciadas: dos quads que comparten el cuerpo. Cada vértice lleva
 * en x lo que se aleja del cuerpo (0..1), en y lo que va de la cola a las antenas (-1..1.3) y en z
 * el lado (-1 izquierda, 1 derecha).
 */
export const crearAlasInstanciadas = (ancla: Float32Array, azares: Float32Array, instancias: number): THREE.InstancedBufferGeometry => {
  const geometria = new THREE.InstancedBufferGeometry()
  const vertices: number[] = []
  for (const lado of [-1, 1]) vertices.push(0, -1, lado, 1, -1, lado, 1, 1.3, lado, 0, 1.3, lado)
  geometria.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometria.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])
  geometria.setAttribute('aAncla', new THREE.InstancedBufferAttribute(ancla, 4))
  geometria.setAttribute('aAzar', new THREE.InstancedBufferAttribute(azares, 4))
  geometria.instanceCount = instancias
  return geometria
}
