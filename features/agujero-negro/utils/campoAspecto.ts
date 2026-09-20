import type * as THREE from 'three'
import { ORDEN_VISTAS, VISTAS_CAMARA } from '../constantes/vistasCamara'
import { interpolarFotograma } from './fotogramasCamara'

/**
 * Ajustes de CÁMARA de cada encuadre (exposición del gas y óptica del polvo). Son lo único que
 * cambia de una vista a otra: el mundo (disco, niebla, anillo, polvo, cielo) es el mismo modelo
 * desde cualquier ángulo. Entre encuadres se interpolan con la posición real de la cámara, así
 * que al orbitar o hacer zoom la exposición se acomoda suavemente, como un auto-exposure.
 */
export interface AspectoCamara {
  /** Ganancia del gas (exposición). */
  ganancia: number
  /** Factor de apertura de la profundidad de campo del polvo (1 = la de canto). */
  apertura: number
  /** Tamaño máximo de un grano en px por píxel de dispositivo. */
  tamanoMaximo: number
}

export const ASPECTO_CANTO: Readonly<AspectoCamara> = { ganancia: 6.5, apertura: 1, tamanoMaximo: 30 }

const CLAVES = ['ganancia', 'apertura', 'tamanoMaximo'] as const

interface Nodo {
  seno: number
  lnDistancia: number
  aspecto: AspectoCamara
}

const nodos: Nodo[] = ORDEN_VISTAS.map((id) => ({ seno: 0, lnDistancia: 0, aspecto: { ...VISTAS_CAMARA[id].aspecto } }))
const pesos = new Float64Array(nodos.length)
const resultado: AspectoCamara = { ...ASPECTO_CANTO }
let ultimoSeno = Number.NaN
let ultimaDistancia = Number.NaN
let ultimoProgreso = Number.NaN

/** Métrica del campo: la elevación (seno) manda y la distancia (logarítmica) matiza. */
const ESCALA_SENO = 0.1
const ESCALA_LN_DISTANCIA = 0.35

const senoElevacion = (posicion: THREE.Vector3): number => {
  const longitud = posicion.length()
  return longitud > 1e-6 ? Math.abs(posicion.y) / longitud : 0
}

/** Ajustes de cámara para la cámara real: interpolación por distancia inversa (cúbica) entre encuadres. */
export function aspectoEnCamara(camara: THREE.Camera, progreso: number): Readonly<AspectoCamara> {
  const seno = senoElevacion(camara.position)
  const distancia = camara.position.length()
  if (seno === ultimoSeno && distancia === ultimaDistancia && progreso === ultimoProgreso) return resultado
  ultimoSeno = seno
  ultimaDistancia = distancia
  ultimoProgreso = progreso

  const lnDistancia = Math.log(Math.max(distancia, 1e-3))
  let sumaPesos = 0
  for (let i = 0; i < nodos.length; i += 1) {
    const vista = VISTAS_CAMARA[ORDEN_VISTAS[i]]
    const fotograma = interpolarFotograma(progreso, vista.fotogramas)
    nodos[i].seno = Math.abs(Math.cos(fotograma.polar))
    nodos[i].lnDistancia = Math.log(fotograma.distancia)
    const dSeno = (seno - nodos[i].seno) / ESCALA_SENO
    const dDistancia = (lnDistancia - nodos[i].lnDistancia) / ESCALA_LN_DISTANCIA
    const d2 = dSeno * dSeno + dDistancia * dDistancia + 1e-6
    pesos[i] = Math.pow(d2, -1.5)
    sumaPesos += pesos[i]
  }
  for (const clave of CLAVES) {
    let valor = 0
    for (let i = 0; i < nodos.length; i += 1) valor += pesos[i] * nodos[i].aspecto[clave]
    resultado[clave] = valor / sumaPesos
  }
  return resultado
}
