import type * as THREE from 'three'

/**
 * Buffer donde `components/LenteGravitacionalQuad.tsx` traza el agujero de caricatura en cada
 * dibujo: [0] su color, [1] qué objeto hay en cada píxel. El pase de dibujo
 * (`features/dibujo/utils/PasoDibujo.ts`) lo compone sobre la escena y lo entinta.
 */
export const refBufferGas: { current: THREE.WebGLRenderTarget | null } = { current: null }
