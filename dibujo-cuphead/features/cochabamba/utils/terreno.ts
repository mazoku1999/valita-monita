import * as THREE from 'three'
import { PISO_VALLE, aguaYSal, alturaRegion, humedadRegion } from './region'

/**
 * El relieve del valle de Cochabamba (ver `constantes/valle.ts`) y la malla que lo dibuja.
 * La altura se calcula aquí, en la CPU, al crear la malla; los colores (parcelas, ciudad, laguna,
 * laderas, nieve, el campo de girasoles y el corazón) los pinta el shader por píxel.
 */

/**
 * Altura del terreno (m sobre el fondo del valle) en (x, z): la de la región (ver `region.ts`), la
 * misma que se ve desde el globo al bajar.
 */
export const alturaValle = (x: number, z: number): number => alturaRegion(x / 1000, -z / 1000) - PISO_VALLE

/** Los arreglos de la malla del relieve (se calculan en un hilo aparte, ver `features/segundo-plano`). */
export interface DatosTerreno {
  posiciones: Float32Array
  normales: Float32Array
  /** Por vértice: altura (km sobre el mar), humedad, agua y sal de la región. */
  region: Float32Array
  indices: Uint16Array | Uint32Array
}

/**
 * Malla polar alrededor del campo: anillos cada vez más separados (unos centímetros junto al
 * corazón, cientos de metros en las montañas lejanas) hasta 45 km, 360 radios. Normales por
 * diferencias finitas a la escala de cada anillo (sin el ruido fino que la malla no puede dibujar).
 */
export function calcularTerreno(): DatosTerreno {
  const radios: number[] = [0]
  let r = 1.5
  while (r < 45000) {
    radios.push(r)
    r = r * 1.045 + 1
  }
  const segmentos = 360
  const total = 1 + (radios.length - 1) * segmentos
  const posiciones = new Float32Array(total * 3)
  const normales = new Float32Array(total * 3)
  const region = new Float32Array(total * 4)
  let v = 0
  for (let i = 0; i < radios.length; i += 1) {
    const radio = radios[i]
    const paso = i + 1 < radios.length ? radios[i + 1] - radio : radio * 0.045
    const e = Math.max(2, 0.5 * paso)
    const vueltas = i === 0 ? 1 : segmentos
    for (let j = 0; j < vueltas; j += 1) {
      const angulo = (j / segmentos) * Math.PI * 2
      const x = radio * Math.cos(angulo)
      const z = radio * Math.sin(angulo)
      const alto = alturaValle(x, z)
      posiciones.set([x, alto, z], v * 3)
      const [agua, sal] = aguaYSal(x / 1000, -z / 1000)
      region.set([(alto + PISO_VALLE) / 1000, humedadRegion(x / 1000, -z / 1000), agua, sal], v * 4)
      const nx = alturaValle(x - e, z) - alturaValle(x + e, z)
      const nz = alturaValle(x, z - e) - alturaValle(x, z + e)
      const largo = Math.hypot(nx, 2 * e, nz)
      normales.set([nx / largo, (2 * e) / largo, nz / largo], v * 3)
      v += 1
    }
  }
  const indices = new (total > 65535 ? Uint32Array : Uint16Array)(3 * segmentos + 6 * segmentos * (radios.length - 2))
  let k = 0
  // El centro con el primer anillo.
  for (let j = 0; j < segmentos; j += 1) {
    indices.set([0, 1 + ((j + 1) % segmentos), 1 + j], k)
    k += 3
  }
  for (let i = 1; i + 1 < radios.length; i += 1) {
    const a = 1 + (i - 1) * segmentos
    const b = 1 + i * segmentos
    for (let j = 0; j < segmentos; j += 1) {
      const j2 = (j + 1) % segmentos
      indices.set([a + j, a + j2, b + j, a + j2, b + j2, b + j], k)
      k += 6
    }
  }
  return { posiciones, normales, region, indices }
}

/** La malla del relieve con sus arreglos (ver `calcularTerreno`). */
export function crearTerreno({ posiciones, normales, region, indices }: DatosTerreno): THREE.BufferGeometry {
  const geometria = new THREE.BufferGeometry()
  geometria.setAttribute('position', new THREE.BufferAttribute(posiciones, 3))
  geometria.setAttribute('normal', new THREE.BufferAttribute(normales, 3))
  geometria.setAttribute('aRegion', new THREE.BufferAttribute(region, 4))
  geometria.setIndex(new THREE.BufferAttribute(indices, 1))
  return geometria
}
