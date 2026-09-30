import * as THREE from 'three'
import type { IdPlaneta } from '../datos/planetas'

/**
 * Los letreros de los planetas: el nombre en letra de época (una didona en cursiva, como los
 * rótulos de los dibujos de los años 30), crema con el contorno de tinta; el de la Tierra, rosado y
 * con un corazón delante: es el destino del viaje. Se pintan en un lienzo y el pase de dibujo los
 * coloca bajo cada planeta (ver `store/rotulos.ts`).
 */
export const NOMBRES_PLANETAS: Readonly<Record<IdPlaneta, string>> = {
  mercurio: 'Mercurio',
  venus: 'Venus',
  tierra: 'Tierra',
  marte: 'Marte',
  jupiter: 'Júpiter',
  saturno: 'Saturno',
  urano: 'Urano',
  neptuno: 'Neptuno',
}

/** Si dos letreros se tapan se queda el primero: la Tierra y luego los que más se ven. */
export const PRIORIDAD_PLANETAS: Readonly<Record<IdPlaneta, number>> = {
  tierra: 0,
  saturno: 1,
  jupiter: 2,
  neptuno: 3,
  urano: 4,
  marte: 5,
  venus: 6,
  mercurio: 7,
}

const FUENTE = 'italic 700 64px "Didot", "Bodoni 72", "Playfair Display", "Iowan Old Style", Georgia, serif'
const ALTO = 112
const TINTA = '#1b120d'

const trazarCorazon = (contexto: CanvasRenderingContext2D, cx: number, cy: number, s: number): void => {
  contexto.beginPath()
  contexto.moveTo(cx, cy + s * 0.42)
  contexto.bezierCurveTo(cx - s * 0.95, cy - s * 0.2, cx - s * 0.5, cy - s * 0.95, cx, cy - s * 0.42)
  contexto.bezierCurveTo(cx + s * 0.5, cy - s * 0.95, cx + s * 0.95, cy - s * 0.2, cx, cy + s * 0.42)
  contexto.closePath()
}

export function crearTexturaNombre(texto: string, destino: boolean): { textura: THREE.CanvasTexture; aspecto: number } {
  const medidor = document.createElement('canvas').getContext('2d')
  if (!medidor) throw new Error('Sin contexto 2D para los letreros')
  medidor.font = FUENTE
  const margen = 26
  const corazon = destino ? 62 : 0
  const ancho = Math.ceil(medidor.measureText(texto).width + 2 * margen + corazon)
  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = ALTO
  const contexto = lienzo.getContext('2d')
  if (!contexto) throw new Error('Sin contexto 2D para los letreros')
  contexto.lineJoin = 'round'
  contexto.lineCap = 'round'
  let x = margen
  if (destino) {
    trazarCorazon(contexto, x + 22, ALTO / 2 + 2, 42)
    contexto.lineWidth = 9
    contexto.strokeStyle = TINTA
    contexto.stroke()
    contexto.fillStyle = '#f2628f'
    contexto.fill()
    // Brillo de barniz.
    contexto.beginPath()
    contexto.ellipse(x + 11, ALTO / 2 - 7, 6, 4, -0.6, 0, Math.PI * 2)
    contexto.fillStyle = 'rgba(255, 236, 242, 0.9)'
    contexto.fill()
    x += corazon
  }
  contexto.font = FUENTE
  contexto.textBaseline = 'middle'
  contexto.lineWidth = 13
  contexto.strokeStyle = TINTA
  contexto.strokeText(texto, x, ALTO / 2 + 4)
  contexto.fillStyle = destino ? '#ffdbe7' : '#fbf0d4'
  contexto.fillText(texto, x, ALTO / 2 + 4)
  const textura = new THREE.CanvasTexture(lienzo)
  textura.minFilter = THREE.LinearMipmapLinearFilter
  textura.magFilter = THREE.LinearFilter
  textura.generateMipmaps = true
  textura.anisotropy = 4
  return { textura, aspecto: ancho / ALTO }
}
