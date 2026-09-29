import * as THREE from 'three'

/**
 * Dónde está el Sol de caricatura en cada fotograma (lo escribe `components/SistemaSolar.tsx`):
 * posición en el mundo, radio de su disco y cuánto se ve (0 fuera de la escena del sistema solar).
 * El pase de dibujo lo usa para pintar su resplandor de rayos en el cielo.
 */
export const SOL_EN_ESCENA = {
  posicion: new THREE.Vector3(),
  radio: 1,
  visible: 0,
}
