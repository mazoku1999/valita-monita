import type * as THREE from 'three'

/**
 * Elevación de la cámara sobre el plano del disco, como seno del ángulo (0 = en el plano,
 * 1 = cenital). Es la misma magnitud que usan los shaders (`abs(cameraPosition.y) / length`).
 */
export const senoElevacion = (posicion: THREE.Vector3): number => {
  const longitud = posicion.length()
  return longitud > 1e-6 ? Math.abs(posicion.y) / longitud : 0
}

const suavizar = (borde0: number, borde1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - borde0) / (borde1 - borde0)))
  return t * t * (3 - 2 * t)
}

/**
 * Cuánto "mira desde arriba" la cámara, de 0 (recorrido de canto, ≤ 3°) a 1 (≥ 17°). Con esta
 * curva se cruzan las dos exposiciones de la escena: de canto el gas satura en un filamento
 * y el polvo del plano se ve como bruma rasante; desde arriba el disco es una superficie que se
 * expone por su borde interno y cuyo resplandor llena la sombra. El umbral superior coincide con
 * el punto donde el shader de la lente apaga la bruma (elevación 0.28).
 */
export const factorVistaElevada = (seno: number): number => suavizar(0.05, 0.28, seno)

/** Peso con que entra el aspecto de una vista: por elevación, pero nunca por debajo de su mínimo. */
export const pesoAspecto = (seno: number, pesoMinimo: number): number =>
  Math.max(factorVistaElevada(seno), pesoMinimo)

/**
 * Cuánto mira la cámara "desde el cenit", de 0 (≤ 27°) a 1 (≥ 58°). Las asimetrías cercano/lejano
 * de la vista elevada (arcos extinguidos, dobladillo de polvo, bruma que llena la sombra) sólo
 * tienen sentido con la cámara baja: con el disco de frente no hay "detrás del agujero", la
 * sombra vuelve a ser negra y el gas se lee como superficie turbulenta y no como surcos.
 */
export const factorVistaCenital = (seno: number): number => suavizar(0.45, 0.85, seno)

export const mezclar = (a: number, b: number, t: number): number => a + (b - a) * t
