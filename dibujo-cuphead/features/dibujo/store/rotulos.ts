import type * as THREE from 'three'

/**
 * Los nombres de los planetas y la marca del destino (la Tierra), para el pase de dibujo, que los
 * pinta sobre la imagen ya compuesta, antes de la película antigua (así llevan su grano, su
 * viñeta y su iris). Los registra `SistemaSolar`; el viaje (`EscenaSistemaSolar`) fija cuánto se
 * ven. La posición en pantalla la calcula el propio pase al pintar, con las matrices del mismo
 * fotograma (calculada antes, iban un fotograma por detrás de los planetas).
 */
export interface RotuloPlaneta {
  /** La malla del planeta: su posición y su tamaño en el mundo dan dónde va el letrero. */
  objeto: THREE.Object3D
  /** El nombre dibujado en un lienzo, y la relación ancho/alto del letrero. */
  textura: THREE.Texture
  aspecto: number
  /** Si dos letreros se tapan, se queda el de menor prioridad. */
  prioridad: number
  /** El destino: además del nombre, un anillo con un corazón. */
  destino: boolean
  /** Opacidad con la que se está viendo (se funde sin saltos). */
  opacidad: number
  opacidadMarca: number
}

export const ROTULOS = {
  planetas: [] as RotuloPlaneta[],
  /** Cuánto se ven los nombres (0..1) y la marca del destino. */
  nombres: 0,
  destino: 0,
}
