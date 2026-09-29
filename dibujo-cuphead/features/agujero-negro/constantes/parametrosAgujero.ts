/**
 * Inclinación aparente del disco en pantalla (radianes), aplicada como roll de cámara.
 * El disco vive en el plano XZ del mundo; al rodar la cámara en vez de rotar el disco,
 * la línea del gas asciende hacia la derecha con el mismo ángulo en cualquier azimut.
 * Medido en la referencia: 26.5°.
 */
export const INCLINACION_PANTALLA = 0.4625

/**
 * Posición del agujero en pantalla como desplazamiento NDC respecto al centro
 * (x positivo = derecha, y positivo = arriba). Centrado en todas las vistas por petición del
 * usuario (las referencias lo encuadraban a un lado y algo alto: 51–56 % del ancho, 32–41 % de
 * la altura).
 */
export const ENCUADRE_PANTALLA = { x: 0, y: 0 } as const

export const CAMARA_AGUJERO = {
  fov: 45,
  cerca: 0.1,
  lejos: 1400,
} as const
