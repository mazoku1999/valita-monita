import * as THREE from 'three'
import { BANDA_POLVO, VIA_LACTEA } from '../constantes/dibujo'

/**
 * Estrellas y destellos de caricatura que se dibujan encima del dibujo (ver `DESTELLO_VERT`). El
 * usuario quería el cielo tan bonito como el de la versión realista (miles de estrellitas finas y
 * un río de chispas doradas por la banda) pero pintado como el resto: puntos de pintura sin
 * contorno de tinta (con tinta, los puntos pequeños parecían cuentas de un collar) y unas pocas
 * estrellas de cuatro puntas.
 *
 * - Estrellas del cielo: direcciones fijas en la esfera celeste (en el infinito), casi todas
 *   puntitos tenues de uno o dos píxeles y unas pocas más grandes y claras, que son destellos de
 *   cuatro puntas. Un tercio se junta a lo largo de una Vía Láctea (la aguada clara del cielo, ver
 *   `CIELO_ACUARELA_GLSL`). Titilan a mano y de vez en cuando una se enciende ("¡ting!").
 * - Granos de la banda de polvo: puntos del plano del disco (entre 13 y 100 unidades), más densos
 *   cerca del agujero, que orbitan despacio y se esconden detrás de él; algunos sueltos por encima
 *   y por debajo (la falda). Unos pocos se abren en destellos de cuatro puntas a tiempo con el
 *   compás. La luz de la banda, pintada en aguadas, la pone el cielo (`bandaPintada`, mismo reparto).
 * - Una estrella fugaz de dibujo animado (la última instancia) que cruza el cielo de vez en cuando.
 *
 * Atributos por instancia: `aPosicion` (xyz; w = 0 dirección, 1 punto del mundo, 2 estrella
 * fugaz), `aForma` (tamaño en px a 720 de alto, fase, ritmo del titileo, tipo: 0 punto,
 * 1 destello de cuatro puntas, 3 estrella fugaz) y `aBrillo` (0–1).
 */
export const DESTELLOS = {
  /** En toda la esfera: con el campo de visión del viaje se ve una de cada diecisiete, unas 380. */
  estrellas: 6500,
  /** Las que se juntan a lo largo de la Vía Láctea (ver `VIA_LACTEA`). */
  fraccionViaLactea: 0.36,
  /** Tamaño (px a 720 de alto): casi todas cerca del mínimo (tamaño = mín + (máx − mín)·u^exponente). */
  tamanoEstrella: { minimo: 1.5, maximo: 7, exponente: 4.2 },
  /** Tamaño a partir del que una estrella es un destello de cuatro puntas. */
  tipoEstrella: { cuatroPuntas: 3.6 },
  banda: 7000,
  tamanoBanda: { minimo: 1.4, maximo: 3.4, exponente: 2.2 },
  /** Granos que pueden abrirse en destello (fracción) y su tamaño. */
  destellosBanda: { fraccion: 0.035, minimo: 4.4, maximo: 7 },
  /** Granos sueltos por encima y por debajo de la banda (fracción) y cuánto más se apartan del plano. */
  faldaBanda: { fraccion: 0.22, apertura: 3.5 },
} as const

/** Espesor (σ, unidades) de la banda a un radio. */
const espesorBanda = (radio: number): number => BANDA_POLVO.espesorBase + BANDA_POLVO.espesorPendiente * radio

const generador = (semilla: number) => {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface DatosDestellos {
  posiciones: Float32Array
  formas: Float32Array
  brillos: Float32Array
  total: number
}

export const generarDestellos = (semilla = 1930): DatosDestellos => {
  const azar = generador(semilla)
  const gauss = (): number => Math.sqrt(-2 * Math.log(Math.max(azar(), 1e-9))) * Math.cos(2 * Math.PI * azar())
  const total = DESTELLOS.estrellas + DESTELLOS.banda + 1
  const posiciones = new Float32Array(total * 4)
  const formas = new Float32Array(total * 4)
  const brillos = new Float32Array(total)

  // Base del círculo de la Vía Láctea.
  const n = new THREE.Vector3(...VIA_LACTEA.normal).normalize()
  const u = new THREE.Vector3(1, 0, 0).cross(n).normalize()
  const v = n.clone().cross(u)
  const dir = new THREE.Vector3()

  for (let i = 0; i < DESTELLOS.estrellas; i++) {
    if (azar() < DESTELLOS.fraccionViaLactea) {
      const fi = 2 * Math.PI * azar()
      const latitud = gauss() * VIA_LACTEA.anchura
      dir
        .copy(u)
        .multiplyScalar(Math.cos(fi) * Math.cos(latitud))
        .addScaledVector(v, Math.sin(fi) * Math.cos(latitud))
        .addScaledVector(n, Math.sin(latitud))
        .normalize()
    } else {
      const z = 2 * azar() - 1
      const phi = 2 * Math.PI * azar()
      const r = Math.sqrt(1 - z * z)
      dir.set(r * Math.cos(phi), z, r * Math.sin(phi))
    }
    posiciones.set([dir.x, dir.y, dir.z, 0], 4 * i)
    const { minimo, maximo, exponente } = DESTELLOS.tamanoEstrella
    const t = Math.pow(azar(), exponente)
    const tamano = minimo + (maximo - minimo) * t
    const tipo = tamano > DESTELLOS.tipoEstrella.cuatroPuntas ? 1 : 0
    formas.set([tamano, 2 * Math.PI * azar(), 0.6 + 1.4 * azar(), tipo], 4 * i)
    // Las grandes, claras; las pequeñas, de todo un poco (las más tenues dan la profundidad).
    brillos[i] = Math.min(1, 0.45 + 0.4 * azar() + t)
  }

  for (let k = 0; k < DESTELLOS.banda; k++) {
    const i = DESTELLOS.estrellas + k
    // Más densos cerca del agujero, como el polvo del original.
    const { radioMinimo: rMin, radioMaximo: rMax } = BANDA_POLVO
    const radio = rMin * Math.pow(rMax / rMin, Math.pow(azar(), 1.3))
    const angulo = 2 * Math.PI * azar()
    const falda = azar() < DESTELLOS.faldaBanda.fraccion ? DESTELLOS.faldaBanda.apertura : 1
    const altura = gauss() * espesorBanda(radio) * falda
    posiciones.set([radio * Math.cos(angulo), altura, radio * Math.sin(angulo), 1], 4 * i)
    const destello = azar() < DESTELLOS.destellosBanda.fraccion
    let tamano: number
    if (destello) {
      const { minimo, maximo } = DESTELLOS.destellosBanda
      tamano = minimo + (maximo - minimo) * azar()
    } else {
      const { minimo, maximo, exponente } = DESTELLOS.tamanoBanda
      tamano = minimo + (maximo - minimo) * Math.pow(azar(), exponente)
    }
    formas.set([tamano, 2 * Math.PI * azar(), 0.8 + 1.6 * azar(), destello ? 1 : 0], 4 * i)
    // Más claros cerca del agujero; los de la falda, más tenues.
    brillos[i] = Math.min(1, Math.pow(rMin / radio, 0.3) * (0.75 + 0.25 * azar()) * (falda > 1 ? 0.75 : 1) + (destello ? 0.3 : 0))
  }

  // La estrella fugaz, al final para que pase por delante de todo (su camino lo decide el shader).
  posiciones.set([0, 0, 0, 2], 4 * (total - 1))
  formas.set([0, 0, 0, 3], 4 * (total - 1))
  brillos[total - 1] = 1
  return { posiciones, formas, brillos, total }
}

/** Geometría instanciada: un quad por destello. */
export const crearGeometriaDestellos = (datos: DatosDestellos): THREE.InstancedBufferGeometry => {
  const geometria = new THREE.InstancedBufferGeometry()
  geometria.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3))
  geometria.setIndex([0, 1, 2, 0, 2, 3])
  geometria.setAttribute('aPosicion', new THREE.InstancedBufferAttribute(datos.posiciones, 4))
  geometria.setAttribute('aForma', new THREE.InstancedBufferAttribute(datos.formas, 4))
  geometria.setAttribute('aBrillo', new THREE.InstancedBufferAttribute(datos.brillos, 1))
  geometria.instanceCount = datos.total
  return geometria
}
