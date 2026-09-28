import type * as THREE from 'three'
import { TRANSICION_POLVO } from '../constantes/parametrosAgujero'
import { grosorEn } from './generarPolvoEstelar'

/**
 * Columna de escombros entre la cámara y el agujero, con la MISMA ley de densidad con la que se
 * genera el campo de polvo (`generarPolvoEstelar.ts`: peso ∝ (13/r)^1.15 desde que los escombros
 * sobreviven como grano, r ≥ 8.5, y altura gaussiana con la escala de altura de los anillos).
 * Es lo que hace que la luz del disco llegue a la cámara envuelta en un resplandor mayor cuanto
 * más polvo atraviesa: la cámara del recorrido de canto está DENTRO del sistema de anillos (38
 * unidades, en el plano) y ve el haz envuelto en un halo ancho (captura 22); a 19.5 unidades hay
 * la mitad de polvo por delante y el halo se reduce a un pedestal (capturas Ring); una cámara
 * elevada sale de la capa de escombros y apenas tiene polvo delante. Se normaliza a 1 para la
 * cámara de la captura 22.
 */
const MUESTRAS = 64

const suavizar = (borde0: number, borde1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - borde0) / (borde1 - borde0)))
  return t * t * (3 - 2 * t)
}

const densidadEscombros = (r: number, y: number): number => {
  const supervivencia = suavizar(TRANSICION_POLVO.inicio, TRANSICION_POLVO.plenitud, r)
  if (supervivencia <= 0 || r > TRANSICION_POLVO.radioFinal) return 0
  const h = grosorEn(r)
  return Math.pow(TRANSICION_POLVO.referenciaBrillo / r, 1.15) * supervivencia * Math.exp(-(y * y) / (2 * h * h))
}

const columnaBruta = (x: number, y: number, z: number): number => {
  const largo = Math.hypot(x, y, z)
  if (largo < 1e-3) return 0
  const paso = largo / MUESTRAS
  let columna = 0
  for (let i = 0; i < MUESTRAS; i += 1) {
    const f = 1 - (i + 0.5) / MUESTRAS
    const r = Math.hypot(x * f, z * f)
    columna += densidadEscombros(r, y * f) * paso
  }
  return columna
}

/** Columna de la cámara de la captura 22 (38 unidades, en el plano): la referencia del halo. */
const COLUMNA_REFERENCIA = columnaBruta(0, 0, 38)

/** Columna de polvo delante de la cámara, relativa a la de la captura 22 (1 = la misma). */
export const columnaPolvo = (camara: THREE.Vector3): number =>
  columnaBruta(camara.x, camara.y, camara.z) / COLUMNA_REFERENCIA
