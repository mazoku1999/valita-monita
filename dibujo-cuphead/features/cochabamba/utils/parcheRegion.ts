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

export interface BaseRegion {
  /** Vector unitario del centro, el este y el norte en el marco de la malla de la Tierra. */
  origen: THREE.Vector3
  este: THREE.Vector3
  norte: THREE.Vector3
}

export function crearParcheRegion({ origen, este, norte }: BaseRegion): Promise<THREE.BufferGeometry> {
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
  const punto = new THREE.Vector3()

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
    punto
      .copy(origen)
      .addScaledVector(este, x / RADIO_TIERRA_KM)
      .addScaledVector(norte, y / RADIO_TIERRA_KM)
      .normalize()
      .multiplyScalar(1 + alto / RADIO_TIERRA_KM)
    posiciones.set([punto.x, punto.y, punto.z], indice * 3)
  }

  return new Promise((resolver) => {
    escribir(0, 0, 0, radios[1])
    let anillo = 1
    const tanda = (): void => {
      const inicio = performance.now()
      while (anillo < radios.length && performance.now() - inicio < 12) {
        const radio = radios[anillo]
        const paso = anillo + 1 < radios.length ? radios[anillo + 1] - radio : radio - radios[anillo - 1]
        for (let j = 0; j < segmentos; j += 1) {
          const angulo = (j / segmentos) * Math.PI * 2
          escribir(1 + (anillo - 1) * segmentos + j, radio * Math.cos(angulo), radio * Math.sin(angulo), Math.max(paso, (radio * Math.PI * 2) / segmentos))
        }
        anillo += 1
      }
      if (anillo < radios.length) {
        window.setTimeout(tanda, 0)
        return
      }
      const indices: number[] = []
      for (let j = 0; j < segmentos; j += 1) indices.push(0, 1 + j, 1 + ((j + 1) % segmentos))
      for (let i = 1; i + 1 < radios.length; i += 1) {
        const a = 1 + (i - 1) * segmentos
        const b = 1 + i * segmentos
        for (let j = 0; j < segmentos; j += 1) {
          const j2 = (j + 1) % segmentos
          indices.push(a + j, b + j, a + j2, a + j2, b + j, b + j2)
        }
      }
      const geometria = new THREE.BufferGeometry()
      geometria.setAttribute('position', new THREE.BufferAttribute(posiciones, 3))
      geometria.setAttribute('aValle', new THREE.BufferAttribute(valle, 3))
      geometria.setAttribute('aNormalValle', new THREE.BufferAttribute(normales, 3))
      geometria.setAttribute('aRegion', new THREE.BufferAttribute(region, 4))
      geometria.setIndex(indices)
      resolver(geometria)
    }
    tanda()
  })
}
