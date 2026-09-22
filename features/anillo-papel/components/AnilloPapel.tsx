'use client'

import { forwardRef, useEffect, useMemo } from 'react'
import * as THREE from 'three'

/**
 * Anillo de papel con un girasol: la banda es una tira de papel crepé verde, el girasol lleva dos
 * coronas de pétalos amarillos rizados, un centro abombado de semillas y sépalos y hojas verdes
 * que abrazan la banda. Todo es geometría y texturas generadas por código (sin assets), así que
 * se puede colocar en cualquier escena de three.js / React Three Fiber.
 *
 * Marco local: la banda es un cilindro de radio `radio` con eje Z (se ve de frente como un aro);
 * el girasol va en lo alto de la banda (+Y) y mira hacia arriba y hacia el espectador (+Z).
 *
 * Uso: `<AnilloPapel radio={1} luces />` dentro de un `<Canvas>`. Con `luces` (por defecto) trae
 * su propia iluminación suave; en una escena ya iluminada, pásale `luces={false}`.
 */
export interface AnilloPapelProps {
  /** Radio de la banda (unidades de la escena). El girasol escala con él. */
  radio?: number
  /** Ancho de la banda a lo largo de su eje, relativo al radio. */
  anchoBanda?: number
  /** Incluir luces propias (hemisférica + principal + relleno). */
  luces?: boolean
  /** Colores en hexadecimal CSS. */
  colores?: Partial<ColoresAnillo>
  /** Semilla del generador de variaciones (pétalos, semillas del centro). */
  semilla?: number
}

export interface ColoresAnillo {
  banda: string
  hoja: string
  petalo: string
  centro: string
}

const COLORES_POR_DEFECTO: ColoresAnillo = {
  banda: '#5f7f3a',
  hoja: '#4f7a34',
  petalo: '#f4b511',
  centro: '#6f4e24',
}

const crearAleatorio = (semilla: number): (() => number) => {
  let estado = semilla >>> 0 || 1
  return () => {
    estado = (estado * 1664525 + 1013904223) >>> 0
    return estado / 4294967296
  }
}

const superficie = (
  fn: (u: number, v: number, destino: THREE.Vector3) => void,
  nu: number,
  nv: number,
): THREE.BufferGeometry => {
  const posiciones: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const p = new THREE.Vector3()
  for (let j = 0; j <= nv; j += 1) {
    const v = j / nv
    for (let i = 0; i <= nu; i += 1) {
      const u = i / nu
      fn(u, v, p)
      posiciones.push(p.x, p.y, p.z)
      uvs.push(u, v)
    }
  }
  for (let j = 0; j < nv; j += 1) {
    for (let i = 0; i < nu; i += 1) {
      const a = j * (nu + 1) + i
      const b = a + nu + 1
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const geometria = new THREE.BufferGeometry()
  geometria.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3))
  geometria.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometria.setIndex(indices)
  geometria.computeVertexNormals()
  return geometria
}

/**
 * Pétalo (u hoja): lámina apuntada que nace en el origen y se extiende por +X, con el ancho en Z.
 * Se riza hacia +Y a lo largo (más en la punta) y se ahueca a lo ancho, como papel curvado con
 * el dedo; `ondulacion` añade un leve rizado del borde.
 */
const crearPetalo = (largo: number, ancho: number, rizo: number, ondulacion: number, fase: number): THREE.BufferGeometry =>
  superficie(
    (u, v, p) => {
      const perfil = Math.pow(Math.sin(Math.PI * Math.min(v, 0.999)), 0.62) * (1 - 0.35 * v)
      const t = u - 0.5
      p.x = v * largo
      p.z = t * ancho * perfil
      p.y = rizo * largo * v * v - 0.9 * ancho * t * t * perfil + ondulacion * ancho * Math.sin(v * 9 + fase) * t * perfil
    },
    6,
    14,
  )

/**
 * Textura de papel crepé: base blanca con arrugas finas paralelas y grano (en gris, el color lo
 * pone el material; si la base llevara el color y el material también, se multiplicarían y el
 * amarillo saldría rojizo).
 */
const crearTexturaCrepe = (contraste: number, aleatorio: () => number): THREE.CanvasTexture => {
  const lienzo = document.createElement('canvas')
  lienzo.width = 256
  lienzo.height = 256
  const ctx = lienzo.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 900; i += 1) {
      const y = aleatorio() * 256
      const x = aleatorio() * 256
      const largo = 12 + aleatorio() * 60
      const claro = aleatorio() > 0.5
      ctx.strokeStyle = claro ? `rgba(255,255,255,${0.05 + contraste * 0.09 * aleatorio()})` : `rgba(0,0,0,${0.05 + contraste * 0.12 * aleatorio()})`
      ctx.lineWidth = 0.6 + aleatorio() * 1.2
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + largo, y + (aleatorio() - 0.5) * 6)
      ctx.stroke()
    }
    const datos = ctx.getImageData(0, 0, 256, 256)
    for (let i = 0; i < datos.data.length; i += 4) {
      const ruido = (aleatorio() - 0.5) * 18 * contraste
      datos.data[i] = Math.max(0, Math.min(255, datos.data[i] + ruido))
      datos.data[i + 1] = Math.max(0, Math.min(255, datos.data[i + 1] + ruido))
      datos.data[i + 2] = Math.max(0, Math.min(255, datos.data[i + 2] + ruido))
    }
    ctx.putImageData(datos, 0, 0)
  }
  const textura = new THREE.CanvasTexture(lienzo)
  textura.wrapS = THREE.RepeatWrapping
  textura.wrapT = THREE.RepeatWrapping
  textura.colorSpace = THREE.SRGBColorSpace
  return textura
}

/** Textura del centro del girasol: semillas apretadas, pardas con brillos y sombras. */
const crearTexturaSemillas = (color: string, aleatorio: () => number): THREE.CanvasTexture => {
  const lienzo = document.createElement('canvas')
  lienzo.width = 256
  lienzo.height = 256
  const ctx = lienzo.getContext('2d')
  if (ctx) {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 1400; i += 1) {
      const x = aleatorio() * 256
      const y = aleatorio() * 256
      const r = 2 + aleatorio() * 4
      const tono = aleatorio()
      ctx.fillStyle = tono < 0.45 ? `rgba(40,24,10,${0.35 + 0.4 * aleatorio()})` : tono < 0.8 ? `rgba(150,110,60,${0.3 + 0.4 * aleatorio()})` : `rgba(215,185,120,${0.25 + 0.35 * aleatorio()})`
      ctx.beginPath()
      ctx.ellipse(x, y, r, r * (0.6 + 0.4 * aleatorio()), aleatorio() * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  const textura = new THREE.CanvasTexture(lienzo)
  textura.wrapS = THREE.RepeatWrapping
  textura.wrapT = THREE.RepeatWrapping
  textura.colorSpace = THREE.SRGBColorSpace
  return textura
}

interface Recursos {
  grupo: THREE.Group
  liberar: () => void
}

const construir = (radio: number, anchoBanda: number, colores: ColoresAnillo, semilla: number): Recursos => {
  const aleatorio = crearAleatorio(semilla)
  const grupo = new THREE.Group()
  const geometrias: THREE.BufferGeometry[] = []
  const materiales: THREE.Material[] = []
  const texturas: THREE.Texture[] = []

  const texturaBanda = crearTexturaCrepe(1, aleatorio)
  texturaBanda.repeat.set(6, 1)
  const texturaHoja = crearTexturaCrepe(0.8, aleatorio)
  const texturaPetalo = crearTexturaCrepe(0.55, aleatorio)
  const texturaCentro = crearTexturaSemillas(colores.centro, aleatorio)
  texturas.push(texturaBanda, texturaHoja, texturaPetalo, texturaCentro)

  const materialPapel = (mapa: THREE.Texture, color: string, bump: number): THREE.MeshStandardMaterial => {
    const material = new THREE.MeshStandardMaterial({
      color,
      map: mapa,
      bumpMap: mapa,
      bumpScale: bump,
      roughness: 0.96,
      metalness: 0,
      side: THREE.DoubleSide,
      transparent: true,
    })
    materiales.push(material)
    return material
  }
  const materialBanda = materialPapel(texturaBanda, colores.banda, 0.9)
  const materialHoja = materialPapel(texturaHoja, colores.hoja, 0.7)
  const materialCentro = materialPapel(texturaCentro, '#ffffff', 1.4)

  // Banda: corona circular extruida (una tira de papel cerrada), eje Z.
  const grosor = 0.07 * radio
  const forma = new THREE.Shape()
  forma.absarc(0, 0, radio, 0, Math.PI * 2, false)
  const hueco = new THREE.Path()
  hueco.absarc(0, 0, radio - grosor, 0, Math.PI * 2, true)
  forma.holes.push(hueco)
  const geometriaBanda = new THREE.ExtrudeGeometry(forma, { depth: anchoBanda * radio, bevelEnabled: false, curveSegments: 72 })
  geometriaBanda.translate(0, 0, -0.5 * anchoBanda * radio)
  geometrias.push(geometriaBanda)
  grupo.add(new THREE.Mesh(geometriaBanda, materialBanda))

  // Girasol en lo alto de la banda, mirando arriba y algo hacia el espectador.
  const flor = new THREE.Group()
  flor.position.set(0, radio - 0.01 * radio, 0)
  flor.rotation.x = 0.55
  grupo.add(flor)

  const colocarLamina = (
    padre: THREE.Object3D,
    geometria: THREE.BufferGeometry,
    material: THREE.Material,
    angulo: number,
    inclinacion: number,
    radioBase: number,
    altura: number,
  ): void => {
    const malla = new THREE.Mesh(geometria, material)
    malla.position.set(Math.cos(angulo) * radioBase, altura, Math.sin(angulo) * radioBase)
    malla.rotation.y = -angulo
    malla.rotateZ(inclinacion)
    padre.add(malla)
  }

  const rCentro = 0.24 * radio
  // Sépalos y hojas bajo la flor.
  const hojaLarga = crearPetalo(0.62 * radio, 0.26 * radio, 0.1, 0.03, 1.3)
  const hojaCorta = crearPetalo(0.46 * radio, 0.2 * radio, 0.12, 0.03, 2.1)
  geometrias.push(hojaLarga, hojaCorta)
  const hojas = [
    { angulo: 0.55, largo: true, inclinacion: -0.75 },
    { angulo: Math.PI - 0.55, largo: true, inclinacion: -0.75 },
    { angulo: Math.PI / 2 + 0.25, largo: false, inclinacion: -0.45 },
    { angulo: -Math.PI / 2 - 0.2, largo: false, inclinacion: -0.6 },
    { angulo: 0.05, largo: false, inclinacion: -0.35 },
    { angulo: Math.PI + 0.1, largo: false, inclinacion: -0.35 },
  ]
  for (const hoja of hojas) {
    colocarLamina(flor, hoja.largo ? hojaLarga : hojaCorta, materialHoja, hoja.angulo, hoja.inclinacion, rCentro * 0.5, -0.02 * radio)
  }
  const sepalo = crearPetalo(0.34 * radio, 0.11 * radio, 0.18, 0.02, 0.4)
  geometrias.push(sepalo)
  for (let i = 0; i < 10; i += 1) {
    const angulo = (i / 10) * Math.PI * 2 + 0.2
    colocarLamina(flor, sepalo, materialHoja, angulo, -0.28 + (aleatorio() - 0.5) * 0.2, rCentro * 0.7, -0.005 * radio)
  }

  // Pétalos: corona exterior de 13 y corona interior de 11, con variación de tono y rizo.
  const coronas = [
    { n: 13, largo: 0.48, ancho: 0.2, inclinacion: -0.12, altura: 0.0, desfase: 0 },
    { n: 11, largo: 0.39, ancho: 0.17, inclinacion: 0.28, altura: 0.02, desfase: 0.29 },
  ]
  for (const corona of coronas) {
    for (let i = 0; i < corona.n; i += 1) {
      const angulo = (i / corona.n) * Math.PI * 2 + corona.desfase
      const geometria = crearPetalo(
        corona.largo * radio * (0.9 + 0.2 * aleatorio()),
        corona.ancho * radio * (0.9 + 0.2 * aleatorio()),
        0.35 + 0.35 * aleatorio(),
        0.06,
        aleatorio() * 6.28,
      )
      geometrias.push(geometria)
      const color = new THREE.Color(colores.petalo).offsetHSL((aleatorio() - 0.5) * 0.02, 0, (aleatorio() - 0.5) * 0.08)
      const material = materialPapel(texturaPetalo, `#${color.getHexString()}`, 0.5)
      colocarLamina(flor, geometria, material, angulo, corona.inclinacion + (aleatorio() - 0.5) * 0.16, rCentro * 0.82, corona.altura * radio)
    }
  }

  // Centro: casquete abombado de semillas con el borde ligeramente levantado.
  const geometriaCentro = new THREE.SphereGeometry(rCentro, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.5)
  geometriaCentro.scale(1, 0.42, 1)
  geometrias.push(geometriaCentro)
  const centro = new THREE.Mesh(geometriaCentro, materialCentro)
  centro.position.y = 0.01 * radio
  flor.add(centro)
  const geometriaBorde = new THREE.TorusGeometry(rCentro * 0.96, rCentro * 0.09, 10, 48)
  geometriaBorde.rotateX(Math.PI / 2)
  geometrias.push(geometriaBorde)
  const borde = new THREE.Mesh(geometriaBorde, materialCentro)
  borde.position.y = 0.012 * radio
  flor.add(borde)

  const liberar = (): void => {
    geometrias.forEach((g) => g.dispose())
    materiales.forEach((m) => m.dispose())
    texturas.forEach((t) => t.dispose())
  }
  return { grupo, liberar }
}

export const AnilloPapel = forwardRef<THREE.Group, AnilloPapelProps>(function AnilloPapel(
  { radio = 1, anchoBanda = 0.3, luces = true, colores, semilla = 7 },
  ref,
) {
  const paleta = useMemo(() => ({ ...COLORES_POR_DEFECTO, ...colores }), [colores])
  const recursos = useMemo(() => construir(radio, anchoBanda, paleta, semilla), [radio, anchoBanda, paleta, semilla])

  useEffect(() => () => recursos.liberar(), [recursos])

  return (
    <group ref={ref}>
      <primitive object={recursos.grupo} />
      {luces && (
        <>
          <hemisphereLight args={['#fff6e8', '#5a4630', 2.2]} />
          <directionalLight position={[1.6 * radio, 2.6 * radio, 2.2 * radio]} intensity={4.5} color="#fff1da" />
          <directionalLight position={[-2.2 * radio, 0.8 * radio, 1.4 * radio]} intensity={1.6} color="#dfe8ff" />
        </>
      )}
    </group>
  )
})
