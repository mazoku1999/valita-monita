import * as THREE from 'three'
import { aguaYSal, alturaRegion, humedadRegion } from './region'

/**
 * La región alrededor de Cochabamba en una textura (ver `region.ts`), para el mapa de la Tierra:
 * un cuadrado de `LADO_REGION` km centrado en el corazón de flores (de la costa del Pacífico a la
 * selva, de Perú al norte de Argentina), con la altura (km sobre el mar, R), la humedad (G), el
 * agua de los lagos (B) y la sal de los salares (A). Un texel mide unos 4,7 km: de cerca, el
 * relieve lo pone la malla 3D de la región. Media precisión (se filtra linealmente en cualquier
 * GPU). Se calcula en un hilo aparte (ver `features/segundo-plano`), sin trabar la página.
 */
export const LADO_REGION = 2400
export const TEXELES_REGION = 512

/** Los texeles de la textura de la región (RGBA en media precisión). */
export function calcularTexturaRegion(): Uint16Array {
  const n = TEXELES_REGION
  const datos = new Uint16Array(n * n * 4)
  const aMedia = THREE.DataUtils.toHalfFloat
  for (let fila = 0; fila < n; fila += 1) {
    const y = -LADO_REGION / 2 + (LADO_REGION * (fila + 0.5)) / n
    for (let i = 0; i < n; i += 1) {
      const x = -LADO_REGION / 2 + (LADO_REGION * (i + 0.5)) / n
      const [agua, sal] = aguaYSal(x, y)
      const k = (fila * n + i) * 4
      // Con texels de casi 5 km bastan tres octavas de sierras.
      datos[k] = aMedia(Math.max(0, alturaRegion(x, y, 3)) / 1000)
      datos[k + 1] = aMedia(humedadRegion(x, y))
      datos[k + 2] = aMedia(agua)
      datos[k + 3] = aMedia(sal)
    }
  }
  return datos
}

export function crearTexturaRegion(datos: Uint16Array): THREE.DataTexture {
  const n = TEXELES_REGION
  const textura = new THREE.DataTexture(datos, n, n, THREE.RGBAFormat, THREE.HalfFloatType)
  textura.minFilter = THREE.LinearFilter
  textura.magFilter = THREE.LinearFilter
  textura.wrapS = THREE.ClampToEdgeWrapping
  textura.wrapT = THREE.ClampToEdgeWrapping
  textura.needsUpdate = true
  return textura
}
