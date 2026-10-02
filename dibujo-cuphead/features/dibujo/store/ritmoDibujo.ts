/**
 * Ritmo del dibujo animado. Como en el propio Cuphead, lo dibujado a mano va "a dibujos" (el hervor
 * de la tinta, el titileo de las estrellas, la película y los lienzos pintados cambian 24 veces por
 * segundo, o 12) mientras la cámara y el scroll se mueven fluidos, a la velocidad de la pantalla.
 * Antes todo se dibujaba a 24 por segundo, y en una pantalla de 60 Hz eso son fotogramas desparejos
 * (unos duran tres refrescos y otros dos): al deslizar, en un móvil, el movimiento temblaba.
 *
 * La pantalla se dibuja a 60 por segundo (cada refresco en 60 Hz, uno de cada dos en 120 Hz). Si el
 * aparato no llega (pierde muchos fotogramas durante un par de segundos), baja un escalón de calidad
 * (`ESCALONES`): primero, un poco la resolución del dibujo (en un móvil lo que más cuesta es pintar
 * cada píxel; el grano de la película disimula la diferencia) y, si aun así no llega, 30 por segundo,
 * también parejos. Si el navegador mismo va a 30 (el iPhone en ahorro de energía, por ejemplo: casi
 * todos los fotogramas llegan cada 1/30 s), se dibuja a 30 sin tocar la resolución (bajarla no
 * ayudaría). Cada tramo del viaje tiene su escalón (`TRAMOS`): lo que más cuesta, el trazado de rayos
 * del agujero negro, no le baja la calidad a la letra de la canción ni al resto (el usuario: "se bajó
 * demasiado la calidad, cosas que no se leen"). Los fotogramas que no toca dibujar no cuestan nada.
 *
 * Un `useFrame` con prioridad negativa (el primero de cada fotograma) llama a `avanzarRitmo`; el
 * resto consulta `tocaDibujar()` (si se dibuja la pantalla) y `numeroDeDibujo()` / `cambiaDibujo()`
 * (el dibujo animado, a 24 por segundo); `ResolucionAdaptable` aplica la resolución del escalón.
 */
export const RITMO_DIBUJO = {
  /** Los dibujos del dibujo animado por segundo (tinta, estrellas, película, lienzos pintados). */
  dibujosPorSegundo: 24,
  /** Para bajar de escalón: tras este arranque (s), si en una ventana de este tiempo (s) se pierde esta parte de los refrescos. */
  arranque: 6,
  ventana: 2.5,
  perdidos: 0.3,
  /** Tras bajar (o al cambiar de tramo), lo que se espera (s) antes de volver a medir (cambiar la resolución traba un momento). */
  calma: 2,
  /** Si al menos esta parte de los fotogramas llega cada 1/30 s, el navegador va a 30: se dibuja a 30. */
  treinta: 0.7,
} as const

/**
 * Los escalones de calidad, de mejor a peor: la resolución (parte de la máxima del aparato, ver
 * `AgujeroNegroCanvas`) y los dibujos por segundo de la pantalla.
 */
export const ESCALONES = [
  { resolucion: 1, pantalla: 60 },
  { resolucion: 0.9, pantalla: 60 },
  { resolucion: 0.8, pantalla: 60 },
  { resolucion: 0.8, pantalla: 30 },
] as const

/** Dónde empieza cada tramo (vh): el agujero negro, desde la caída la canción y su túnel, y desde la salida el resto. */
const TRAMOS = [0, 480, 780] as const

let tiempoAnterior = -1
let ultimoDibujo = -1
let toca = true
const niveles = TRAMOS.map(() => 0)
let tramo = 0
let aTreinta = false

let dibujoActual = -1
let cambia = true

let inicioVentana = -1
let muestras = 0
let lentos = 0
let cada30 = 0
let cambioDeNivel = -Infinity

const reiniciarVentana = (): void => {
  inicioVentana = -1
  muestras = 0
  lentos = 0
  cada30 = 0
}

export function avanzarRitmo(tiempo: number, vh: number): void {
  const paso = tiempoAnterior < 0 || tiempoAnterior > tiempo ? 0 : tiempo - tiempoAnterior
  tiempoAnterior = tiempo

  let nuevoTramo = 0
  while (nuevoTramo + 1 < TRAMOS.length && vh >= TRAMOS[nuevoTramo + 1]) nuevoTramo++
  if (nuevoTramo !== tramo) {
    tramo = nuevoTramo
    cambioDeNivel = tiempo
    reiniciarVentana()
  }
  const objetivo = ritmoDePantalla()

  // Se dibuja en cuanto han pasado tres cuartos del intervalo que toca: así cae siempre en el mismo
  // refresco (cada uno en 60 Hz, uno de cada dos en 120 Hz…) aunque los fotogramas lleguen con algo
  // de desorden (con carga, el reloj de cada fotograma no llega a intervalos exactos).
  toca = ultimoDibujo < 0 || tiempo < ultimoDibujo || tiempo - ultimoDibujo >= 0.75 / objetivo
  if (toca) ultimoDibujo = tiempo

  // ¿Va el aparato a este ritmo? Un fotograma que tarda bastante más de lo que toca es un fotograma
  // perdido; si se pierden muchos, se baja al escalón siguiente (o, si llegan parejos cada 1/30 s, a 30).
  const nivel = niveles[tramo]
  const midiendo = tiempo > RITMO_DIBUJO.arranque && tiempo - cambioDeNivel > RITMO_DIBUJO.calma
  if (midiendo && paso > 0 && paso < 0.25 && nivel < ESCALONES.length - 1) {
    if (inicioVentana < 0) inicioVentana = tiempo
    muestras++
    if (paso > 1.35 / objetivo) lentos++
    if (paso > 0.029 && paso < 0.0375) cada30++
    if (tiempo - inicioVentana >= RITMO_DIBUJO.ventana) {
      if (muestras > 10) {
        if (!aTreinta && objetivo > 30 && cada30 / muestras > RITMO_DIBUJO.treinta) {
          aTreinta = true
          cambioDeNivel = tiempo
        } else if (lentos / muestras > RITMO_DIBUJO.perdidos) {
          niveles[tramo]++
          cambioDeNivel = tiempo
        }
      }
      reiniciarVentana()
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

/** A cuántos fotogramas por segundo se quiere dibujar la pantalla ahora. */
export function ritmoDePantalla(): number {
  return aTreinta ? 30 : ESCALONES[niveles[tramo]].pantalla
}

/** La resolución del escalón del tramo actual (parte de la máxima del aparato). */
export function resolucionDePantalla(): number {
  return ESCALONES[niveles[tramo]].resolucion
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
