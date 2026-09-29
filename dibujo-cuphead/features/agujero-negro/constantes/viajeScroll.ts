/**
 * Reparto del scroll del viaje completo (progreso 0..1 sobre un carril de `CARRIL_VH`):
 *
 *   0 ── acercamiento ── caída al horizonte ── agujero de gusano ── sistema solar ── la Tierra ── 1
 *
 * Los tramos se definen en vh para que alargar uno no cambie el ritmo de los demás; los
 * componentes leen las fracciones de progreso derivadas. El usuario pidió que la entrada fuera
 * un viaje "estilo Interstellar en el agujero de gusano" (con 600vh de túnel le pareció "muy
 * largo": son 300vh), que al salir el viaje nos llevara a nuestro sistema solar, visto desde
 * lejos, y que terminara acercándose a la Tierra. El anillo de papel se quitó del final por
 * ahora (`EscenaAnilloFinal` sigue en el repositorio y recibe sus progresos por props).
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
  /**
   * Iris de los dibujos animados de los años 30 (ver PELICULA_FRAG): se cierra sobre la sombra al
   * cruzar el horizonte y se abre sobre el remolino del agujero de gusano.
   */
  irisCierre: { desde: enProgreso(430), hasta: enProgreso(446) },
  irisApertura: { desde: enProgreso(484), hasta: enProgreso(510) },
  /** Fin del paso por el agujero de gusano: la cámara sale por la boca del otro lado. */
  tunelFin: enProgreso(780),
  /** El sistema solar aparece delante mientras se sale por la boca y está entero aquí. */
  sistemaInicio: enProgreso(740),
  sistemaPleno: enProgreso(830),
  /** El cielo trazado del otro lado del agujero de gusano se funde con el del sistema solar. */
  cieloSistemaInicio: enProgreso(765),
  cieloSistemaPleno: enProgreso(835),
  /** Fin del acercamiento al sistema solar: se ve entero, del Sol a la órbita de Neptuno. */
  sistemaEntero: enProgreso(1000),
  /** Viaje final hacia la Tierra: la cámara la busca, se acerca y el tiempo se frena. */
  tierraInicio: enProgreso(1000),
  tierraFin: enProgreso(1240),
} as const
