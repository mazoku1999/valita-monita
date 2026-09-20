import type * as THREE from 'three'
import { ORDEN_VISTAS, VISTAS_CAMARA, type VistaCamara } from '../constantes/vistasCamara'
import { factorVistaCenital, mezclar, pesoAspecto, senoElevacion } from './elevacionCamara'
import { interpolarFotograma } from './fotogramasCamara'

/**
 * Valores de canto (cámara en el plano del gas, recorrido del scroll): la calibración original,
 * a la que cada vista añade su propio aspecto con la elevación (ver `constantes/vistasCamara.ts`).
 */
export const ASPECTO_CANTO = {
  ganancia: 6.5,
  bloom: { umbral: 1.05, intensidad: 2.0, radio: 0.85 },
  polvoExposicion: 0.9,
  apertura: 1,
  tamanoMaximo: 30,
} as const

/** Aspecto ya resuelto para una cámara concreta: lo que leen los uniformes cada fotograma. */
export interface AspectoEfectivo {
  ganancia: number
  brumaElevada: number
  elevada: number
  cenital: number
  luzArcos: number
  radioGas: number
  dobladillo: number
  brumaCercana: number
  brumaEscala: number
  corona: number
  bloomUmbral: number
  bloomIntensidad: number
  bloomRadio: number
  polvoExposicion: number
  polvoLejano: number
  apertura: number
  tamanoMaximo: number
}

const crearAspecto = (): AspectoEfectivo => ({
  ganancia: ASPECTO_CANTO.ganancia,
  brumaElevada: 0,
  elevada: 0,
  cenital: 0,
  luzArcos: 1,
  radioGas: 40,
  dobladillo: 0,
  brumaCercana: 0,
  brumaEscala: 1,
  corona: 1,
  bloomUmbral: ASPECTO_CANTO.bloom.umbral,
  bloomIntensidad: ASPECTO_CANTO.bloom.intensidad,
  bloomRadio: ASPECTO_CANTO.bloom.radio,
  polvoExposicion: ASPECTO_CANTO.polvoExposicion,
  polvoLejano: 0.5,
  apertura: 1,
  tamanoMaximo: ASPECTO_CANTO.tamanoMaximo,
})

const CLAVES = Object.keys(crearAspecto()) as (keyof AspectoEfectivo)[]

interface Nodo {
  seno: number
  lnDistancia: number
  aspecto: AspectoEfectivo
}

/**
 * Aspecto de una vista en su propia cámara (con el peso de elevación con que se calibró): es el
 * valor exacto que se ve al elegirla, y el nodo que ancla el campo continuo alrededor de ella.
 */
const resolverNodo = (vista: VistaCamara, progreso: number, nodo: Nodo): void => {
  const fotograma = interpolarFotograma(progreso, vista.fotogramas)
  const seno = Math.abs(Math.cos(fotograma.polar))
  const t = pesoAspecto(seno, vista.pesoMinimoAspecto)
  const tFisica = pesoAspecto(seno, vista.pesoMinimoFisica ?? vista.pesoMinimoAspecto)
  const a = vista.aspecto
  const salida = nodo.aspecto
  nodo.seno = seno
  nodo.lnDistancia = Math.log(fotograma.distancia)
  salida.ganancia = mezclar(ASPECTO_CANTO.ganancia, a.ganancia, t)
  salida.brumaElevada = a.bruma * t
  salida.elevada = tFisica
  salida.cenital = 0
  salida.luzArcos = a.luzArcos
  salida.radioGas = a.radioGas
  salida.dobladillo = a.dobladillo
  salida.brumaCercana = a.brumaCercana ?? 0
  salida.brumaEscala = mezclar(1, a.brumaEscala ?? 1, t)
  salida.corona = mezclar(1, a.corona ?? 1, t)
  salida.bloomUmbral = mezclar(ASPECTO_CANTO.bloom.umbral, a.bloom.umbral, t)
  salida.bloomIntensidad = mezclar(ASPECTO_CANTO.bloom.intensidad, a.bloom.intensidad, t)
  salida.bloomRadio = mezclar(ASPECTO_CANTO.bloom.radio, a.bloom.radio, t)
  salida.polvoExposicion = mezclar(ASPECTO_CANTO.polvoExposicion, a.polvoExposicion, t)
  salida.polvoLejano = a.polvoLejano
  salida.apertura = mezclar(1, a.apertura, t)
  salida.tamanoMaximo = mezclar(ASPECTO_CANTO.tamanoMaximo, a.tamanoMaximo, t)
}

const nodos: Nodo[] = ORDEN_VISTAS.map(() => ({ seno: 0, lnDistancia: 0, aspecto: crearAspecto() }))
const pesos = new Float64Array(nodos.length)
const resultado = crearAspecto()
let ultimoSeno = Number.NaN
let ultimaDistancia = Number.NaN
let ultimoProgreso = Number.NaN

/**
 * Métrica del campo: la elevación (seno) manda y la distancia (logarítmica) matiza. Con estas
 * escalas, dos encuadres a la misma distancia y 4.6° de diferencia (anillo e inferior) distan
 * 0.8 y uno de canto a 40 unidades y el anillo a 19.5 distan 2.
 */
const ESCALA_SENO = 0.1
const ESCALA_LN_DISTANCIA = 0.35

/**
 * Aspecto continuo para la cámara real. Cada encuadre calibrado es un nodo en el plano
 * (elevación, distancia); entre ellos el aspecto se interpola por distancia inversa (cúbica), de
 * modo que en el nodo se ve exactamente la calibración y al orbitar, hacer zoom o viajar de un
 * encuadre a otro todo (bruma, bloom, exposición del polvo, física fuera del plano…) se funde con
 * el movimiento de la cámara en vez de aparecer o desaparecer al cambiar de vista.
 */
export function aspectoEnCamara(camara: THREE.Camera, progreso: number): AspectoEfectivo {
  const seno = senoElevacion(camara.position)
  const distancia = camara.position.length()
  if (seno === ultimoSeno && distancia === ultimaDistancia && progreso === ultimoProgreso) return resultado
  ultimoSeno = seno
  ultimaDistancia = distancia
  ultimoProgreso = progreso

  const lnDistancia = Math.log(Math.max(distancia, 1e-3))
  let sumaPesos = 0
  for (let i = 0; i < nodos.length; i += 1) {
    resolverNodo(VISTAS_CAMARA[ORDEN_VISTAS[i]], progreso, nodos[i])
    const dSeno = (seno - nodos[i].seno) / ESCALA_SENO
    const dDistancia = (lnDistancia - nodos[i].lnDistancia) / ESCALA_LN_DISTANCIA
    const d2 = dSeno * dSeno + dDistancia * dDistancia + 1e-6
    pesos[i] = Math.pow(d2, -1.5)
    sumaPesos += pesos[i]
  }
  for (const clave of CLAVES) {
    let valor = 0
    for (let i = 0; i < nodos.length; i += 1) valor += pesos[i] * nodos[i].aspecto[clave]
    resultado[clave] = valor / sumaPesos
  }
  resultado.cenital = factorVistaCenital(seno)
  return resultado
}
