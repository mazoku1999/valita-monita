/**
 * Ritmo del dibujo animado. Como en el propio Cuphead, lo dibujado a mano va "a dibujos" (el hervor
 * de la tinta, el titileo de las estrellas, la película y los lienzos pintados cambian 24 veces por
 * segundo, o 12) mientras la cámara y el scroll se mueven fluidos, a la velocidad de la pantalla.
 * Antes todo se dibujaba a 24 por segundo, y en una pantalla de 60 Hz eso son fotogramas desparejos
 * (unos duran tres refrescos y otros dos): al deslizar, en un móvil, el movimiento temblaba.
 *
 * La pantalla se dibuja a 60 por segundo (cada refresco en 60 Hz, uno de cada dos en 120 Hz). Si el
 * aparato no llega (se pierden muchos fotogramas durante un par de segundos), baja un escalón de
 * calidad (`ESCALONES`) y se queda ahí: primero la resolución del dibujo (en un móvil lo que más
 * cuesta es pintar cada píxel: el trazado de rayos del agujero y los pases del dibujo; el grano de la
 * película disimula la diferencia) y, si aun así no llega, 30 por segundo, también parejos. En el
 * iPhone va de sobra en el primero; en muchos Android hacía falta bajar. Los fotogramas que no toca
 * dibujar no cuestan nada: ni el trazado de rayos del agujero ni el dibujo se calculan.
 *
 * Un `useFrame` con prioridad negativa (el primero de cada fotograma) llama a `avanzarRitmo`; el
 * resto consulta `tocaDibujar()` (si se dibuja la pantalla) y `numeroDeDibujo()` / `cambiaDibujo()`
 * (el dibujo animado, a 24 por segundo); `ResolucionAdaptable` aplica la resolución del escalón.
 */
export const RITMO_DIBUJO = {
  /** Los dibujos del dibujo animado por segundo (tinta, estrellas, película, lienzos pintados). */
  dibujosPorSegundo: 24,
  /** Para bajar de escalón: tras este arranque (s), si en una ventana de este tiempo (s) se pierde esta parte de los refrescos. */
  arranque: 4,
  ventana: 2,
  perdidos: 0.2,
  /** Tras bajar, lo que se espera (s) antes de volver a medir (cambiar la resolución traba un momento). */
  calma: 1.5,
} as const

/**
 * Los escalones de calidad, de mejor a peor: la resolución (parte de la máxima del aparato, ver
 * `AgujeroNegroCanvas`) y los dibujos por segundo de la pantalla.
 */
export const ESCALONES = [
  { resolucion: 1, pantalla: 60 },
  { resolucion: 0.82, pantalla: 60 },
  { resolucion: 0.68, pantalla: 60 },
  { resolucion: 0.68, pantalla: 30 },
] as const

let tiempoAnterior = -1
let ultimoDibujo = -1
let nivel = 0
let toca = true

let dibujoActual = -1
let cambia = true

let inicioVentana = -1
let muestras = 0
let lentos = 0
let cambioDeNivel = -Infinity

export function avanzarRitmo(tiempo: number): void {
  const paso = tiempoAnterior < 0 || tiempoAnterior > tiempo ? 0 : tiempo - tiempoAnterior
  tiempoAnterior = tiempo
  const objetivo = ESCALONES[nivel].pantalla

  // Se dibuja en cuanto han pasado tres cuartos del intervalo que toca: así cae siempre en el mismo
  // refresco (cada uno en 60 Hz, uno de cada dos en 120 Hz…) aunque los fotogramas lleguen con algo
  // de desorden (con carga, el reloj de cada fotograma no llega a intervalos exactos).
  toca = ultimoDibujo < 0 || tiempo < ultimoDibujo || tiempo - ultimoDibujo >= 0.75 / objetivo
  if (toca) ultimoDibujo = tiempo

  // ¿Va el aparato a este ritmo? Un fotograma que tarda bastante más de lo que toca es un fotograma
  // perdido; si se pierden muchos (a 45 por segundo en una pantalla de 60 Hz los fotogramas salen
  // desparejos), se baja al escalón siguiente.
  const midiendo = tiempo > RITMO_DIBUJO.arranque && tiempo - cambioDeNivel > RITMO_DIBUJO.calma
  if (midiendo && paso > 0 && paso < 0.25 && nivel < ESCALONES.length - 1) {
    if (inicioVentana < 0) inicioVentana = tiempo
    muestras++
    if (paso > 1.35 / objetivo) lentos++
    if (tiempo - inicioVentana >= RITMO_DIBUJO.ventana) {
      if (muestras > 10 && lentos / muestras > RITMO_DIBUJO.perdidos) {
        nivel++
        cambioDeNivel = tiempo
      }
      inicioVentana = -1
      muestras = 0
      lentos = 0
    }
  }

  const dibujo = Math.floor(tiempo * RITMO_DIBUJO.dibujosPorSegundo)
  cambia = dibujo !== dibujoActual
  dibujoActual = dibujo
}

/** Si en este fotograma de pantalla toca dibujar (la cámara y lo que se mueve). */
export function tocaDibujar(): boolean {
  return toca
}

/** Número del dibujo del dibujo animado (24 por segundo: el temblor de la tinta, el titileo de las estrellas). */
export function numeroDeDibujo(): number {
  return dibujoActual
}

/** Si en este fotograma empieza un dibujo nuevo del dibujo animado (para repintar los lienzos). */
export function cambiaDibujo(): boolean {
  return cambia
}

/** A cuántos fotogramas por segundo se quiere dibujar la pantalla ahora (para medir). */
export function ritmoDePantalla(): number {
  return ESCALONES[nivel].pantalla
}

/** La resolución del escalón actual (parte de la máxima del aparato). */
export function resolucionDePantalla(): number {
  return ESCALONES[nivel].resolucion
}

/**
 * Latido del estilo rubber hose: en los dibujos animados de los años 30 todo "baila" al compás de
 * la música (las cosas se estiran, rebotan y respiran). Un compás de foxtrot (112 por minuto), con
 * pulsos marcados; se evalúa con el tiempo del dibujo, así que avanza a saltos como el resto.
 */
export const COMPAS = { pulsacionesPorMinuto: 112 } as const

/** Pulsaciones transcurridas (el pulso cae en cada entero). */
export function pulsaciones(tiempo: number): number {
  return (tiempo * COMPAS.pulsacionesPorMinuto) / 60
}

export function latido(tiempo: number): number {
  const onda = 0.5 + 0.5 * Math.cos(2 * Math.PI * pulsaciones(tiempo))
  return onda * onda * onda
}
