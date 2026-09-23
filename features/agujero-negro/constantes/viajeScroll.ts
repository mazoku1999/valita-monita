/**
 * Reparto del scroll del viaje completo (progreso 0..1 sobre un carril de `CARRIL_VH`):
 *
 *   0 ── acercamiento ── caída al horizonte ── paso por el agujero de gusano ── sistema solar ── anillo ── 1
 *
 * Los tramos se definen en vh para que alargar uno no cambie el ritmo de los demás; los
 * componentes leen las fracciones de progreso derivadas. El usuario pidió que la entrada fuera
 * un viaje "estilo Interstellar en el agujero de gusano" (con 600vh de túnel le pareció "muy
 * largo": son 300vh) y que al salir el viaje nos llevara a nuestro sistema solar, visto desde
 * lejos, antes del anillo de papel, que queda para el final.
 */
export const CARRIL_VH = 1300

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
  /** Fin del paso por el agujero de gusano: la cámara sale por la boca del otro lado. */
  tunelFin: enProgreso(780),
  /** El sistema solar aparece delante mientras se sale por la boca y está entero aquí. */
  sistemaInicio: enProgreso(740),
  sistemaPleno: enProgreso(830),
  /** El cielo trazado del otro lado del agujero de gusano se funde con el del sistema solar. */
  cieloSistemaInicio: enProgreso(765),
  cieloSistemaPleno: enProgreso(835),
  /** El anillo de papel aparece entre estos dos progresos, con el sistema solar detrás, y se queda. */
  anilloInicio: enProgreso(1150),
  anilloPleno: enProgreso(1250),
} as const
