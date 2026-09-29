import { VIAJE } from '../constantes/viajeScroll'
import { VISTAS_CAMARA } from '../constantes/vistasCamara'
import { obtenerVista } from '../store/vistaCamaraStore'
import { suavizar } from './aleatorio'
import { interpolarFotograma } from './fotogramasCamara'

/**
 * Estado de movimiento de la cámara para la óptica relativista (unidades con r_s = 1).
 *
 * Durante la caída la cámara es un observador en caída libre radial que parte del reposo en la
 * distancia del encuadre (el final del acercamiento). Su geodésica tiene energía específica
 * conservada E = √(1 − 1/r_inicio) y velocidad propia hacia dentro K = −dr/dτ = √(E² − 1 + 1/r):
 * nula al soltarse, 0.55 en la ISCO, igual a E en el horizonte y mayor dentro (allí nadie puede
 * quedarse quieto). La lente (`shaders/lenteGravitacional.frag.ts`) y el polvo usan (E, K) para la
 * aberración y el corrimiento de frecuencia de lo que ve la cámara.
 *
 * Antes de la caída se devuelve E = 1, K = 0: la cámara con la que se calibraron los encuadres
 * (dirección de píxel = dirección del rayo). Frente al observador estático de verdad la sombra
 * sale un 1.3 % mayor a 38 unidades; esa diferencia se funde al empezar la caída.
 */
export interface Observador {
  /** Energía específica de la geodésica de la cámara (−u_t). */
  energia: number
  /** Velocidad propia de caída, −dr/dτ (≥ 0). */
  caida: number
}

const CAMARA_CALIBRADA: Readonly<Observador> = { energia: 1, caida: 0 }
const resultado: Observador = { energia: 1, caida: 0 }

/** Fracción inicial de la caída en la que la cámara calibrada pasa a ser el observador físico. */
const FUNDIDO_INICIAL = 0.12

/** Distancia desde la que se suelta la cámara: la del encuadre activo al terminar el acercamiento. */
const distanciaInicialCaida = (): number =>
  interpolarFotograma(VIAJE.acercamientoFin, VISTAS_CAMARA[obtenerVista()].fotogramas).distancia

export function observadorEnCamara(distancia: number, progreso: number): Readonly<Observador> {
  if (progreso <= VIAJE.acercamientoFin) return CAMARA_CALIBRADA
  const tramo = VIAJE.caidaFin - VIAJE.acercamientoFin
  const fundido = suavizar(VIAJE.acercamientoFin, VIAJE.acercamientoFin + FUNDIDO_INICIAL * tramo, progreso)
  const rInicio = distanciaInicialCaida()
  const r = Math.max(distancia, 1e-3)
  const energia = Math.sqrt(1 - 1 / rInicio)
  const caida = Math.sqrt(Math.max(0, 1 / r - 1 / rInicio))
  resultado.energia = 1 + (energia - 1) * fundido
  resultado.caida = caida * fundido
  return resultado
}

/**
 * Velocidad de la cámara respecto al observador estático del mismo punto (fracción de c): el
 * factor de Lorentz entre ambos es E/√(1 − 1/r) y, con E² − K² = 1 − 1/r, v = K/E. Dentro del
 * horizonte no hay observadores estáticos (K > E) y se acota por debajo de 1.
 */
export const velocidadRespectoEstatico = (observador: Readonly<Observador>): number =>
  Math.min(observador.caida / observador.energia, 0.999)

/** Parámetro de impacto crítico (el de la esfera de fotones) con r_s = 1: 3√3/2. */
const B_CRITICO = 1.5 * Math.sqrt(3)
const R_FOTON = 1.5

/**
 * Corrimiento g con que llega a la cámara la luz del borde de la sombra, donde se apilan el anillo
 * de fotones y las imágenes lensadas del disco: la exposición de la cámara en caída lo sigue.
 *
 * El borde es la dirección α (desde la de avance, hacia el agujero) cuyo parámetro de impacto
 * r·sen α/(E − K·cos α) es el crítico b_c. Con c = cos α queda una cuadrática,
 * (r² + b_c²K²)·c² − 2·b_c²·E·K·c + b_c²E² − r² = 0, de discriminante r²·(r² − b_c²(E² − K²)).
 * Fuera de la esfera de fotones el borde es la raíz mayor (rayos que bajan hacia el agujero y
 * rozan la esfera de fotones); por dentro, y también dentro del horizonte, la menor (rayos que
 * suben y apenas no escapan). En r = 1.5 ambas coinciden. Fuera de la caída (E = 1, K = 0) g = 1.
 */
export function gBordeSombra(observador: Readonly<Observador>, distancia: number): number {
  const { energia: e, caida: k } = observador
  const r = Math.max(distancia, 1e-3)
  const b2 = B_CRITICO * B_CRITICO
  const raiz = Math.sqrt(Math.max(0, r * r * (r * r - b2 * (e * e - k * k))))
  const coseno = (b2 * e * k + (r >= R_FOTON ? raiz : -raiz)) / (r * r + b2 * k * k)
  return 1 / Math.max(e - k * Math.min(1, coseno), 1e-3)
}

/**
 * Reloj de lo que ve la cámara: la luz del disco llega comprimida en el tiempo por el mismo
 * factor g que la azula, así que al caer el gas y los escombros se ven girar más deprisa (×2 a 3
 * unidades, ×3.8 en el horizonte). Se integra el reloj real con la g del borde de la sombra; la
 * lente y el polvo lo leen en el mismo fotograma con el mismo valor (fuera de la caída, g = 1).
 */
let ultimoReloj = Number.NaN
let tiempoAcumulado = 0

export function tiempoVisto(reloj: number, gReferencia: number): number {
  if (!Number.isFinite(ultimoReloj)) {
    ultimoReloj = reloj
    tiempoAcumulado = reloj
  }
  if (reloj !== ultimoReloj) {
    // Mismo tope de paso que la cámara: volver de una pestaña en segundo plano no da un salto.
    const paso = Math.min(Math.max(reloj - ultimoReloj, 0), 0.25)
    tiempoAcumulado += paso * gReferencia
    ultimoReloj = reloj
  }
  return tiempoAcumulado
}
