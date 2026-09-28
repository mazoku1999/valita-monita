import * as THREE from 'three'

/**
 * Estrellas y destellos de caricatura que se dibujan encima del dibujo (ver `DESTELLO_VERT`):
 *
 * - Estrellas del cielo: direcciones fijas en la esfera celeste (en el infinito), casi todas
 *   pequeñas; las mayores son destellos de cuatro puntas con contorno de tinta y las menores,
 *   puntitos. Titilan de un dibujo a otro.
 * - Destellos de la banda de polvo: puntos del plano del disco (entre 14 y 95 unidades) que orbitan
 *   despacio alrededor del agujero, como las chispas del original, y se esconden detrás del gas y
 *   de la sombra.
 *
 * Atributos por instancia: `aPosicion` (xyz; w = 0 dirección, 1 punto del mundo), `aForma` (tamaño
 * en px a 720 de alto, fase, ritmo del titileo, tipo: 0 punto, 1 destello de cuatro puntas).
 */
export const DESTELLOS = {
  estrellas: 200,
  tamanoEstrella: { minimo: 4.5, maximo: 24 },
  banda: 480,
  tamanoBanda: { minimo: 3.4, maximo: 13 },
  radioBanda: { minimo: 14, maximo: 95 },
} as const

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
  total: number
}

export const generarDestellos = (semilla = 1930): DatosDestellos => {
  const azar = generador(semilla)
  const total = DESTELLOS.estrellas + DESTELLOS.banda
  const posiciones = new Float32Array(total * 4)
  const formas = new Float32Array(total * 4)
  for (let i = 0; i < DESTELLOS.estrellas; i++) {
    const z = 2 * azar() - 1
    const phi = 2 * Math.PI * azar()
    const r = Math.sqrt(1 - z * z)
    posiciones.set([r * Math.cos(phi), z, r * Math.sin(phi), 0], 4 * i)
    const t = Math.pow(azar(), 2.4)
    const tamano = DESTELLOS.tamanoEstrella.minimo + (DESTELLOS.tamanoEstrella.maximo - DESTELLOS.tamanoEstrella.minimo) * t
    formas.set([tamano, 2 * Math.PI * azar(), 0.6 + 1.4 * azar(), tamano > 7.5 ? 1 : 0], 4 * i)
  }
  for (let k = 0; k < DESTELLOS.banda; k++) {
    const i = DESTELLOS.estrellas + k
    // Más densos cerca del agujero, como el polvo del original.
    const u = azar()
    const radio = DESTELLOS.radioBanda.minimo * Math.pow(DESTELLOS.radioBanda.maximo / DESTELLOS.radioBanda.minimo, Math.pow(u, 1.3))
    const angulo = 2 * Math.PI * azar()
    const altura = (azar() + azar() + azar() - 1.5) * (0.12 + 0.012 * radio)
    posiciones.set([radio * Math.cos(angulo), altura, radio * Math.sin(angulo), 1], 4 * i)
    const t = Math.pow(azar(), 2.0)
    const tamano = DESTELLOS.tamanoBanda.minimo + (DESTELLOS.tamanoBanda.maximo - DESTELLOS.tamanoBanda.minimo) * t
    formas.set([tamano, 2 * Math.PI * azar(), 0.8 + 1.6 * azar(), tamano > 6.2 ? 1 : 0], 4 * i)
  }
  return { posiciones, formas, total }
}

/** Geometría instanciada: un quad por destello. */
export const crearGeometriaDestellos = (datos: DatosDestellos): THREE.InstancedBufferGeometry => {
  const geometria = new THREE.InstancedBufferGeometry()
  geometria.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3))
  geometria.setIndex([0, 1, 2, 0, 2, 3])
  geometria.setAttribute('aPosicion', new THREE.InstancedBufferAttribute(datos.posiciones, 4))
  geometria.setAttribute('aForma', new THREE.InstancedBufferAttribute(datos.formas, 4))
  geometria.instanceCount = datos.total
  return geometria
}
