import * as THREE from 'three'
import { CENTRO_CAJITA, COREOGRAFIA, VISTA_CIELO } from '../constantes/carta'
import { dentroDelCorazon } from '../store/paseo'

/**
 * La cámara al abrir la cajita (ver `store/carta.ts`): desde donde esté, se acerca si hace falta y se
 * pone de pie mirando la cajita; cuando salta la tapa, alza la mirada siguiendo a las estrellitas
 * hasta el cielo del noroeste (`VISTA_CIELO`). El rumbo y la altura de la mirada se interpolan por
 * separado: la cámara nunca se ladea.
 */

const acotar = (x: number): number => Math.min(1, Math.max(0, x))
/** Smootherstep: arranca y para sin brusquedad. */
const suave = (x: number): number => {
  const t = acotar(x)
  return t * t * t * (t * (t * 6 - 15) + 10)
}
const diferenciaAngulo = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b))

export interface Coreografia {
  desde: THREE.Vector3
  rumboDesde: number
  alzadoDesde: number
  hasta: THREE.Vector3
  /** Segundos hasta que la cámara está junto a la cajita, de pie y mirándola. */
  llegada: number
}

/** Rumbo (rad, del eje +z hacia +x) de la vista final del cielo. */
const RUMBO_CIELO = Math.atan2(VISTA_CIELO.rumbo[0], VISTA_CIELO.rumbo[1])

/** La vista final hacia el cielo: derecha, arriba y adelante (columnas), en coordenadas del valle. */
export const marcoVistaCielo = (destino: THREE.Matrix3): THREE.Matrix3 => {
  const { alzado } = VISTA_CIELO
  const [rx, rz] = VISTA_CIELO.rumbo
  const f = new THREE.Vector3(rx * Math.cos(alzado), Math.sin(alzado), rz * Math.cos(alzado))
  const r = new THREE.Vector3(-rz, 0, rx).normalize()
  const u = new THREE.Vector3().crossVectors(r, f)
  return destino.set(r.x, u.x, f.x, r.y, u.y, f.y, r.z, u.z, f.z)
}

export function prepararCoreografia(posicion: THREE.Vector3, direccion: THREE.Vector3): Coreografia {
  const [cx, , cz] = CENTRO_CAJITA
  const dx = posicion.x - cx
  const dz = posicion.z - cz
  const distancia = Math.hypot(dx, dz)
  const hasta = new THREE.Vector3(posicion.x, COREOGRAFIA.ojos, posicion.z)
  if (distancia > COREOGRAFIA.cerca) {
    const k = COREOGRAFIA.acercarse / distancia
    const [x, z] = dentroDelCorazon(cx + dx * k, cz + dz * k)
    hasta.set(x, COREOGRAFIA.ojos, z)
  }
  const recorrido = Math.hypot(hasta.x - posicion.x, hasta.z - posicion.z)
  const d = direccion.clone().normalize()
  return {
    desde: posicion.clone(),
    rumboDesde: Math.atan2(d.x, d.z),
    alzadoDesde: Math.asin(Math.min(1, Math.max(-1, d.y))),
    hasta,
    llegada: Math.min(3.4, 0.8 + recorrido / COREOGRAFIA.velocidad),
  }
}

const haciaCaja = new THREE.Vector3()

/**
 * La pose a los `t` segundos de abrirla: la posición y la dirección de la mirada (unitaria). Devuelve
 * cuánto ha caído la noche (0..1).
 */
export function poseCoreografia(c: Coreografia, t: number, posicion: THREE.Vector3, direccion: THREE.Vector3): number {
  // Primero se pone de pie (pasa por encima de las flores) y a la vez se acerca.
  posicion.lerpVectors(c.desde, c.hasta, suave(t / c.llegada))
  posicion.y = c.desde.y + (c.hasta.y - c.desde.y) * suave(t / (0.45 * c.llegada))
  haciaCaja.set(CENTRO_CAJITA[0], CENTRO_CAJITA[1], CENTRO_CAJITA[2]).sub(posicion).normalize()
  const rumboCaja = Math.atan2(haciaCaja.x, haciaCaja.z)
  const alzadoCaja = Math.asin(Math.min(1, Math.max(-1, haciaCaja.y)))
  const s = t - c.llegada
  let rumbo: number
  let alzado: number
  if (s < COREOGRAFIA.inclinarDesde) {
    const k = suave(t / Math.max(c.llegada * 0.85, 0.5))
    rumbo = c.rumboDesde + diferenciaAngulo(rumboCaja, c.rumboDesde) * k
    alzado = c.alzadoDesde + (alzadoCaja - c.alzadoDesde) * k
  } else {
    const u = suave((s - COREOGRAFIA.inclinarDesde) / COREOGRAFIA.inclinar)
    rumbo = rumboCaja + diferenciaAngulo(RUMBO_CIELO, rumboCaja) * u
    alzado = alzadoCaja + (VISTA_CIELO.alzado - alzadoCaja) * u
  }
  direccion.set(Math.sin(rumbo) * Math.cos(alzado), Math.sin(alzado), Math.cos(rumbo) * Math.cos(alzado))
  return suave((s - COREOGRAFIA.nocheDesde) / COREOGRAFIA.noche)
}

/**
 * La salida (botón de salir o Escape): desde donde esté la cámara (y lo que haya caído la noche), la
 * noche se levanta como una aguada que sube y la mirada baja hasta la cajita, algo por encima de
 * ella (se ve el campo). Al terminar, `EscenaCochabamba` devuelve los mandos con esa pose.
 */
export interface Salida {
  posicion: THREE.Vector3
  rumboDesde: number
  alzadoDesde: number
  nocheDesde: number
  rumboHasta: number
  alzadoHasta: number
}

export const DURACION_SALIDA = 3.0

export function prepararSalida(posicion: THREE.Vector3, direccion: THREE.Vector3, noche: number): Salida {
  const d = direccion.clone().normalize()
  haciaCaja.set(CENTRO_CAJITA[0], CENTRO_CAJITA[1], CENTRO_CAJITA[2]).sub(posicion).normalize()
  return {
    posicion: posicion.clone(),
    rumboDesde: Math.atan2(d.x, d.z),
    alzadoDesde: Math.asin(Math.min(1, Math.max(-1, d.y))),
    nocheDesde: noche,
    rumboHasta: Math.atan2(haciaCaja.x, haciaCaja.z),
    alzadoHasta: Math.max(-0.3, Math.asin(Math.min(1, Math.max(-1, haciaCaja.y))) * 0.55),
  }
}

/** La pose a los `t` segundos de salir. Devuelve la noche que queda (0..1). */
export function poseSalida(c: Salida, t: number, posicion: THREE.Vector3, direccion: THREE.Vector3): number {
  posicion.copy(c.posicion)
  const k = suave((t - 0.2) / (DURACION_SALIDA - 0.5))
  const rumbo = c.rumboDesde + diferenciaAngulo(c.rumboHasta, c.rumboDesde) * k
  const alzado = c.alzadoDesde + (c.alzadoHasta - c.alzadoDesde) * k
  direccion.set(Math.sin(rumbo) * Math.cos(alzado), Math.sin(alzado), Math.cos(rumbo) * Math.cos(alzado))
  return c.nocheDesde * (1 - suave(t / (DURACION_SALIDA * 0.8)))
}
