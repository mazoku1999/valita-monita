import type * as THREE from 'three'

/**
 * Buffer HDR donde `components/LenteGravitacionalQuad.tsx` traza el gas cada fotograma (lente,
 * disco, anillo de fotones y bruma). El efecto de posproceso del gas (`utils/efectoGas.ts`) lo
 * compone sobre la escena y le aplica su propio bloom ancho, separado del de las chispas.
 */
export const refBufferGas: { current: THREE.WebGLRenderTarget | null } = { current: null }
