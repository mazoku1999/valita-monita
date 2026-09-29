import * as THREE from 'three'

/**
 * El valle de Cochabamba en cada fotograma (lo escribe `components/EscenaCochabamba.tsx`), para el
 * pase de dibujo: cuánto es de día (0 en el espacio, 1 en el valle: el cielo de la mañana en vez del
 * nocturno y sin estrellas), la rotación de las direcciones del mundo a las del valle (el cielo se
 * pinta en las del valle) y hacia dónde está el Sol en el valle.
 */
export const VALLE_EN_ESCENA = {
  dia: 0,
  rotacion: new THREE.Matrix3(),
  sol: new THREE.Vector3(0, 1, 0),
}

/**
 * Plano de recorte cercano que pide la entrada en la Tierra (lo escribe `EscenaSistemaSolar`): al
 * final la cámara baja a unos cientos de km del mapa, más cerca que el plano del viaje por el
 * espacio. `EscenaCochabamba` lo aplica mientras no se ve el valle.
 */
export const RECORTE_ENTRADA = { cerca: Number.POSITIVE_INFINITY }
