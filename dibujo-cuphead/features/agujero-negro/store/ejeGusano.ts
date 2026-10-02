import * as THREE from 'three'

/**
 * Hacia dónde va el eje del agujero de gusano (dirección en el mundo), es decir, dónde está el fondo
 * del túnel en pantalla. Lo actualiza `TunelAgujeroGusano` en cada fotograma; la canción centra ahí
 * el portal por el que se ven sus escenas (ver `features/cancion`).
 */
export const EJE_GUSANO = new THREE.Vector3(0, 0, -1)
