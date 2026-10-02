import * as THREE from 'three'
import { RADIO_TIERRA_KM } from '../constantes/destino'
import { PISO_VALLE, aguaYSal, alturaRegion, humedadRegion } from './region'

/**
 * El relieve de la región en 3D sobre el globo (ver `region.ts`): una malla polar de
 * `RADIO_PARCHE_KM` alrededor del corazón de flores, con anillos cada vez más separados (decenas
 * de metros cerca del valle, km en el borde), hija de la malla de la Tierra (en radios
 * terrestres, con la curvatura del planeta). En el borde, la malla se hunde bajo la esfera: allí el
 * mapa pinta lo mismo desde su textura. Lleva además, por vértice, su posición en el valle (m: x
 * al este, altura sobre el fondo del valle, z al sur), la normal en ese marco y la región (altura
 * en km sobre el mar, humedad, agua y sal) para pintarla (ver `shaders/suelo.ts`).
 */
export const RADIO_PARCHE_KM = 300
/** Tramo del borde (km) en que la malla se aplana y se hunde bajo la esfera. */
const BORDE_PARCHE = { aplanar: [230, 290], hundir: [288, 300] } as const

const suave = (borde0: number, borde1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - borde0) / (borde1 - borde0)))
  return t * t * (3 - 2 * t)
}

type Vector = readonly [number, number, number]

export interface BaseRegion {
  /** Vector unitario del centro, el este y el norte en el marco de la malla de la Tierra. */
  origen: Vector
  este: Vector
  norte: Vector
}

/** Los arreglos de la malla (se calculan en un hilo aparte, ver `features/segundo-plano`). */
export interface DatosParche {
  posiciones: Float32Array
  valle: Float32Array
  normales: Float32Array
  region: Float32Array
  indices: Uint16Array | Uint32Array
}

export function calcularParcheRegion({ origen, este, norte }: BaseRegion): DatosParche {
  const radios: number[] = [0]
  let r = 0.02
  while (r < RADIO_PARCHE_KM) {
    radios.push(r)
    r = r * 1.05 + 0.02
  }
  radios.push(RADIO_PARCHE_KM)
  const segmentos = 256
  const total = 1 + (radios.length - 1) * segmentos
  const posiciones = new Float32Array(total * 3)
  const valle = new Float32Array(total * 3)
  const normales = new Float32Array(total * 3)
  const region = new Float32Array(total * 4)

  const escribir = (indice: number, x: number, y: number, paso: number): void => {
    const distancia = Math.hypot(x, y)
    const h = alturaRegion(x, y)
    // Normal a la escala de la malla (sin el ruido fino que no puede dibujar), del relieve sin aplanar.
    const e = Math.max(0.015, 0.5 * paso)
    const dx = (alturaRegion(x + e, y) - alturaRegion(x - e, y)) / (2 * e * 1000)
    const dy = (alturaRegion(x, y + e) - alturaRegion(x, y - e)) / (2 * e * 1000)
    // Marco del valle: x al este, y arriba, z al sur (la pendiente al norte es −dz).
    const nx = -dx
    const ny = 1
    const nz = dy
    const largo = Math.hypot(nx, ny, nz)
    normales.set([nx / largo, ny / largo, nz / largo], indice * 3)
    const [agua, sal] = aguaYSal(x, y)
    region.set([h / 1000, humedadRegion(x, y), agua, sal], indice * 4)
    valle.set([x * 1000, h - PISO_VALLE, -y * 1000], indice * 3)
    // En la esfera, con la curvatura: se aplana y se hunde en el borde.
    const alto = (h * (1 - suave(BORDE_PARCHE.aplanar[0], BORDE_PARCHE.aplanar[1], distancia)) - 4000 * suave(BORDE_PARCHE.hundir[0], BORDE_PARCHE.hundir[1], distancia)) / 1000
    const px = origen[0] + (este[0] * x + norte[0] * y) / RADIO_TIERRA_KM
    const py = origen[1] + (este[1] * x + norte[1] * y) / RADIO_TIERRA_KM
    const pz = origen[2] + (este[2] * x + norte[2] * y) / RADIO_TIERRA_KM
    const escala = (1 + alto / RADIO_TIERRA_KM) / (Math.hypot(px, py, pz) || 1)
    posiciones.set([px * escala, py * escala, pz * escala], indice * 3)
  }

  escribir(0, 0, 0, radios[1])
  for (let anillo = 1; anillo < radios.length; anillo += 1) {
    const radio = radios[anillo]
    const paso = anillo + 1 < radios.length ? radios[anillo + 1] - radio : radio - radios[anillo - 1]
    for (let j = 0; j < segmentos; j += 1) {
      const angulo = (j / segmentos) * Math.PI * 2
      escribir(1 + (anillo - 1) * segmentos + j, radio * Math.cos(angulo), radio * Math.sin(angulo), Math.max(paso, (radio * Math.PI * 2) / segmentos))
    }
  }
  const indices = new (total > 65535 ? Uint32Array : Uint16Array)(3 * segmentos + 6 * segmentos * (radios.length - 2))
  let k = 0
  for (let j = 0; j < segmentos; j += 1) {
    indices.set([0, 1 + j, 1 + ((j + 1) % segmentos)], k)
    k += 3
  }
  for (let i = 1; i + 1 < radios.length; i += 1) {
    const a = 1 + (i - 1) * segmentos
    const b = 1 + i * segmentos
    for (let j = 0; j < segmentos; j += 1) {
      const j2 = (j + 1) % segmentos
      indices.set([a + j, b + j, a + j2, a + j2, b + j, b + j2], k)
      k += 6
    }
  }
  return { posiciones, valle, normales, region, indices }
}

/** La malla del relieve de la región con sus arreglos (ver `calcularParcheRegion`). */
export function crearParcheRegion({ posiciones, valle, normales, region, indices }: DatosParche): THREE.BufferGeometry {
  const geometria = new THREE.BufferGeometry()
  geometria.setAttribute('position', new THREE.BufferAttribute(posiciones, 3))
  geometria.setAttribute('aValle', new THREE.BufferAttribute(valle, 3))
  geometria.setAttribute('aNormalValle', new THREE.BufferAttribute(normales, 3))
  geometria.setAttribute('aRegion', new THREE.BufferAttribute(region, 4))
  geometria.setIndex(new THREE.BufferAttribute(indices, 1))
  return geometria
}
