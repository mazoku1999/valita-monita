/**
 * Reparto del scroll del viaje completo (progreso 0..1 sobre un carril de `CARRIL_VH`):
 *
 *   0 ──── acercamiento ──── caída al horizonte ──── túnel (agujero de gusano) ──── destello ── anillo ── 1
 *
 * Los tramos se definen en vh para que alargar uno no cambie el ritmo de los demás; los
 * componentes leen las fracciones de progreso derivadas. El usuario pidió que la entrada fuera
 * un viaje "estilo Interstellar en el agujero de gusano" y que el anillo de papel apareciera
 * sólo al final, más pequeño; con 600vh de túnel le pareció "muy largo": ahora son 300vh.
 */
export const CARRIL_VH = 1000

const enProgreso = (vh: number): number => vh / CARRIL_VH

export const VIAJE = {
  /** Distancia inicial de la cámara: el agujero muy lejos (el anillo de fotones mide un 5 % de la altura). */
  distanciaInicial: 140,
  /** Fin del acercamiento: la cámara llega a la distancia calibrada del encuadre. */
  acercamientoFin: enProgreso(300),
  /** Fin de la caída: la cámara ha cruzado el horizonte y queda a `distanciaInterior` del centro. */
  caidaFin: enProgreso(480),
  /** Distancia final al centro durante el interior (el horizonte está en 1). */
  distanciaInterior: 0.35,
  /** Elevación mínima durante la caída (radianes sobre el plano): se pasa por encima del gas, no a través. */
  elevacionMinima: 0.17,
  /** Fin del túnel: la luz de la salida llena la pantalla (destello). */
  tunelFin: enProgreso(780),
  /** El destello de salida se ha apagado del todo. */
  destelloFin: enProgreso(820),
  /** El anillo de papel aparece entre estos dos progresos y se queda hasta el final. */
  anilloInicio: enProgreso(800),
  anilloPleno: enProgreso(900),
} as const
