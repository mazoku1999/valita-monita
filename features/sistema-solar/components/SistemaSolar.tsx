'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  ANILLOS_SATURNO,
  CINTURONES,
  PLANETAS,
  RADIO_SOL,
  ROTACION,
  aEscalaVisible,
  anomaliaEnFecha,
  direccionEcliptica,
  posicionHeliocentrica,
  radioOrbitaVisible,
  radioVisible,
  siglosDesdeJ2000,
  type IdPlaneta,
} from '../datos/planetas'
import {
  ANILLOS_FRAG,
  ANILLOS_VERT,
  CINTURON_FRAG,
  CINTURON_VERT,
  ORBITA_FRAG,
  ORBITA_VERT,
  PLANETA_FRAG,
  PLANETA_VERT,
  SOL_FRAG,
} from '../shaders/sistemaSolar'

/**
 * Nuestro sistema solar, todo generado por código (sin imágenes): el Sol con su corona, los ocho
 * planetas en sus órbitas reales (elementos de JPL, posiciones del día de hoy) girando con sus
 * periodos de Kepler acelerados, sus ejes y días reales, los anillos de Saturno con la sombra del
 * planeta, el cinturón de asteroides con sus huecos de Kirkwood y el de Kuiper, y la estela de
 * cada órbita. Distancias y tamaños comprimidos para que se vea (ver `datos/planetas.ts`).
 *
 * Marco local: el Sol en el origen, la eclíptica en el plano XZ y el norte eclíptico en +Y.
 * Uso: `<SistemaSolar />` dentro de un `<Canvas>`; no necesita luces de la escena (cada material
 * se ilumina con la posición del Sol) ni las altera.
 */
export interface SistemaSolarProps {
  /** Fundido de todo el sistema (0..1), leído en cada fotograma (p. ej. ligado al scroll). */
  aparicion?: { readonly current: number }
  /** Segundos de pantalla que dura un año terrestre. */
  segundosPorAnio?: number
  /** Fecha de las posiciones de partida (hoy por defecto). */
  fecha?: Date
  /** Detiene el movimiento (movimiento reducido). */
  quieto?: boolean
  /**
   * Factor de tamaño de los planetas (1 = el de `radioVisible`), leído en cada fotograma. Desde
   * muy lejos conviene reducirlo: a escala real los planetas no serían más que puntos.
   */
  escalaPlanetas?: { readonly current: number }
  /**
   * Distancia de la cámara al Sol a la que los cinturones lucen con su brillo pleno; más lejos se
   * atenúan (sus granos se dibujan con un tamaño fijo en píxeles y si no, desde lejos, el
   * cinturón de asteroides se vería como un anillo macizo).
   */
  distanciaReferencia?: number
}

/** Tinte de la estela de cada órbita: el color del planeta, apagado. */
const TINTE_ORBITA: Readonly<Record<IdPlaneta, readonly [number, number, number]>> = {
  mercurio: [0.62, 0.58, 0.54],
  venus: [0.8, 0.7, 0.5],
  tierra: [0.42, 0.6, 0.95],
  marte: [0.9, 0.48, 0.32],
  jupiter: [0.85, 0.72, 0.55],
  saturno: [0.88, 0.8, 0.6],
  urano: [0.55, 0.82, 0.88],
  neptuno: [0.4, 0.55, 0.95],
}

const PUNTOS_ORBITA = 256

/** Mulberry32: el mismo cinturón en cada carga. */
const crearAleatorio = (semilla: number): (() => number) => {
  let estado = semilla >>> 0
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0
    let t = estado
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const gaussiano = (aleatorio: () => number): number =>
  Math.sqrt(-2 * Math.log(Math.max(aleatorio(), 1e-9))) * Math.cos(2 * Math.PI * aleatorio())

/** Corona del Sol: textura radial con un núcleo intenso y dos faldas cada vez más anchas. */
const crearTexturaCorona = (): THREE.CanvasTexture => {
  const lado = 256
  const lienzo = document.createElement('canvas')
  lienzo.width = lado
  lienzo.height = lado
  const contexto = lienzo.getContext('2d')
  if (contexto) {
    const imagen = contexto.createImageData(lado, lado)
    for (let y = 0; y < lado; y += 1) {
      for (let x = 0; x < lado; x += 1) {
        const rho = Math.hypot(x + 0.5 - lado / 2, y + 0.5 - lado / 2) / (lado / 2)
        const valor = Math.min(1, 0.85 * Math.exp(-(rho * rho) / 0.01) + 0.3 * Math.exp(-(rho * rho) / 0.05) + 0.08 * Math.exp(-(rho * rho) / 0.25)) * (1 - Math.min(1, rho) ** 4)
        const indice = (y * lado + x) * 4
        imagen.data[indice] = 255
        imagen.data[indice + 1] = 255
        imagen.data[indice + 2] = 255
        imagen.data[indice + 3] = Math.round(255 * valor)
      }
    }
    contexto.putImageData(imagen, 0, 0)
  }
  const textura = new THREE.CanvasTexture(lienzo)
  textura.colorSpace = THREE.NoColorSpace
  return textura
}

/** Puntos de un cinturón: radio real (UA), fase, altura visible y brillo por grano. */
const crearCinturon = (
  desde: number,
  hasta: number,
  cantidad: number,
  aceptar: (ua: number, aleatorio: () => number) => boolean,
  inclinacion: number,
  semilla: number,
): THREE.BufferGeometry => {
  const aleatorio = crearAleatorio(semilla)
  const radios = new Float32Array(cantidad)
  const fases = new Float32Array(cantidad)
  const alturas = new Float32Array(cantidad)
  const brillos = new Float32Array(cantidad)
  let n = 0
  while (n < cantidad) {
    const ua = desde + (hasta - desde) * aleatorio()
    if (!aceptar(ua, aleatorio)) continue
    radios[n] = ua
    fases[n] = aleatorio() * Math.PI * 2
    // Inclinaciones con reparto gaussiano: la altura es la del radio visible por el seno.
    alturas[n] = 9 * Math.pow(ua, 0.45) * Math.sin(gaussiano(aleatorio) * inclinacion)
    brillos[n] = 0.25 + 0.75 * Math.pow(aleatorio(), 2.2)
    n += 1
  }
  const geometria = new THREE.BufferGeometry()
  geometria.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cantidad * 3), 3))
  geometria.setAttribute('aRadio', new THREE.BufferAttribute(radios, 1))
  geometria.setAttribute('aFase', new THREE.BufferAttribute(fases, 1))
  geometria.setAttribute('aAltura', new THREE.BufferAttribute(alturas, 1))
  geometria.setAttribute('aBrillo', new THREE.BufferAttribute(brillos, 1))
  return geometria
}

const materialCinturon = (color: THREE.Vector3): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    vertexShader: CINTURON_VERT,
    fragmentShader: CINTURON_FRAG,
    uniforms: {
      uAnios: { value: 0 },
      uTamano: { value: 2 },
      uAparicion: { value: 0 },
      uEscalaOrbita: { value: 9 },
      uExponenteOrbita: { value: 0.45 },
      uColor: { value: color },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

interface PlanetaEnEscena {
  readonly id: IdPlaneta
  readonly datos: (typeof PLANETAS)[number]
  readonly malla: THREE.Mesh
  readonly material: THREE.ShaderMaterial
  readonly inclinacion: THREE.Quaternion
  readonly materialOrbita: THREE.ShaderMaterial
}

function crearSistema(fecha: Date) {
  const raiz = new THREE.Group()
  const liberables: { dispose: () => void }[] = []
  const siglosIniciales = siglosDesdeJ2000(fecha)

  // Sol: fotosfera HDR (florece con el bloom de la escena) y corona aditiva detrás.
  const materialSol = new THREE.ShaderMaterial({
    vertexShader: PLANETA_VERT,
    fragmentShader: SOL_FRAG,
    uniforms: { uAparicion: { value: 0 }, uTiempo: { value: 0 } },
  })
  const geometriaSol = new THREE.SphereGeometry(RADIO_SOL, 64, 32)
  const sol = new THREE.Mesh(geometriaSol, materialSol)
  raiz.add(sol)
  const texturaCorona = crearTexturaCorona()
  const materialCorona = new THREE.SpriteMaterial({
    map: texturaCorona,
    color: new THREE.Color(0, 0, 0),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  })
  const corona = new THREE.Sprite(materialCorona)
  corona.scale.setScalar(RADIO_SOL * 6)
  raiz.add(corona)
  liberables.push(materialSol, geometriaSol, texturaCorona, materialCorona)

  const geometriaPlaneta = new THREE.SphereGeometry(1, 64, 32)
  liberables.push(geometriaPlaneta)
  const arriba = new THREE.Vector3(0, 1, 0)
  const polo = new THREE.Vector3()
  const punto = new THREE.Vector3()

  const planetas: PlanetaEnEscena[] = PLANETAS.map((datos) => {
    const material = new THREE.ShaderMaterial({
      vertexShader: PLANETA_VERT,
      fragmentShader: PLANETA_FRAG,
      uniforms: {
        uAspecto: { value: datos.aspecto },
        uSol: { value: new THREE.Vector3() },
        uAparicion: { value: 0 },
        uTiempo: { value: 0 },
      },
    })
    const malla = new THREE.Mesh(geometriaPlaneta, material)
    malla.scale.setScalar(radioVisible(datos.radio))
    raiz.add(malla)
    const [longitudPolo, latitudPolo] = ROTACION[datos.id].polo
    const inclinacion = new THREE.Quaternion().setFromUnitVectors(arriba, direccionEcliptica(longitudPolo, latitudPolo, polo))

    // Órbita: 256 puntos por anomalía excéntrica, comprimidos a la escala visible.
    const posiciones = new Float32Array(PUNTOS_ORBITA * 3)
    const anomalias = new Float32Array(PUNTOS_ORBITA)
    for (let k = 0; k < PUNTOS_ORBITA; k += 1) {
      const anomalia = (k / PUNTOS_ORBITA) * Math.PI * 2
      aEscalaVisible(posicionHeliocentrica(datos, siglosIniciales, punto, anomalia))
      posiciones.set([punto.x, punto.y, punto.z], k * 3)
      anomalias[k] = anomalia
    }
    const geometriaOrbita = new THREE.BufferGeometry()
    geometriaOrbita.setAttribute('position', new THREE.BufferAttribute(posiciones, 3))
    geometriaOrbita.setAttribute('aAnomalia', new THREE.BufferAttribute(anomalias, 1))
    const [r, g, b] = TINTE_ORBITA[datos.id]
    const materialOrbita = new THREE.ShaderMaterial({
      vertexShader: ORBITA_VERT,
      fragmentShader: ORBITA_FRAG,
      uniforms: {
        uColor: { value: new THREE.Vector3(r, g, b) },
        uAnomaliaPlaneta: { value: 0 },
        uAparicion: { value: 0 },
        // El planeta ocupa radio/distancia radianes de su órbita vista desde el Sol.
        uHueco: { value: (1.3 * radioVisible(datos.radio)) / radioOrbitaVisible(datos.a) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const orbita = new THREE.LineLoop(geometriaOrbita, materialOrbita)
    orbita.frustumCulled = false
    raiz.add(orbita)
    liberables.push(material, geometriaOrbita, materialOrbita)
    return { id: datos.id, datos, malla, material, inclinacion, materialOrbita }
  })

  // Anillos de Saturno en su plano ecuatorial, con la sombra del planeta.
  const saturno = planetas.find((planeta) => planeta.id === 'saturno')
  const geometriaAnillos = new THREE.RingGeometry(ANILLOS_SATURNO.interior, ANILLOS_SATURNO.exterior, 256, 1)
  const materialAnillos = new THREE.ShaderMaterial({
    vertexShader: ANILLOS_VERT,
    fragmentShader: ANILLOS_FRAG,
    uniforms: {
      uSol: { value: new THREE.Vector3() },
      uCentroPlaneta: { value: new THREE.Vector3() },
      uRadioPlaneta: { value: 1 },
      uAparicion: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const anillos = new THREE.Mesh(geometriaAnillos, materialAnillos)
  raiz.add(anillos)
  liberables.push(geometriaAnillos, materialAnillos)
  const tumbarAnillo = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)

  // Cinturón de asteroides (con los huecos de Kirkwood, resonancias con Júpiter a 2.50, 2.82 y
  // 2.95 UA) y cinturón de Kuiper (más poblado en los plutinos, a 39.4 UA, y entre 42 y 48).
  const huecosKirkwood = [2.5, 2.82, 2.95, 3.27]
  const geometriaAsteroides = crearCinturon(
    CINTURONES.asteroides.desde,
    CINTURONES.asteroides.hasta,
    CINTURONES.asteroides.cantidad,
    (ua) => huecosKirkwood.every((hueco) => Math.abs(ua - hueco) > 0.025),
    (5 * Math.PI) / 180,
    20260922,
  )
  const geometriaKuiper = crearCinturon(
    CINTURONES.kuiper.desde,
    CINTURONES.kuiper.hasta,
    CINTURONES.kuiper.cantidad,
    (ua, aleatorio) => aleatorio() < 0.35 + 0.65 * Math.max(Math.exp(-(((ua - 39.4) / 0.8) ** 2)), ua > 42 && ua < 48 ? 1 : 0),
    (8 * Math.PI) / 180,
    20260923,
  )
  // Tenues: a esta distancia ningún asteroide se vería; son un polvo fino que dibuja el cinturón.
  const materialAsteroides = materialCinturon(new THREE.Vector3(0.9, 0.82, 0.7).multiplyScalar(0.38))
  const materialKuiper = materialCinturon(new THREE.Vector3(0.6, 0.68, 0.85).multiplyScalar(0.3))
  const asteroides = new THREE.Points(geometriaAsteroides, materialAsteroides)
  const kuiper = new THREE.Points(geometriaKuiper, materialKuiper)
  asteroides.frustumCulled = false
  kuiper.frustumCulled = false
  raiz.add(asteroides, kuiper)
  liberables.push(geometriaAsteroides, geometriaKuiper, materialAsteroides, materialKuiper)

  const posicionSol = new THREE.Vector3()
  const giro = new THREE.Quaternion()

  /** Coloca todo en `anios` de simulación desde la fecha de partida y aplica el fundido. */
  const actualizar = (
    anios: number,
    segundos: number,
    aparicion: number,
    pixeles: number,
    escala: number,
    brilloCinturones: number,
  ): void => {
    const siglos = siglosIniciales + anios / 100
    raiz.updateWorldMatrix(true, false)
    sol.getWorldPosition(posicionSol)
    materialSol.uniforms.uAparicion.value = aparicion
    materialSol.uniforms.uTiempo.value = segundos
    materialCorona.color.setRGB(0.9, 0.62, 0.36).multiplyScalar(aparicion)

    for (const planeta of planetas) {
      aEscalaVisible(posicionHeliocentrica(planeta.datos, siglos, planeta.malla.position))
      planeta.malla.scale.setScalar(radioVisible(planeta.datos.radio) * escala)
      const periodo = ROTACION[planeta.id].periodo
      giro.setFromAxisAngle(arriba, ((2 * Math.PI * segundos) / periodo) % (2 * Math.PI))
      planeta.malla.quaternion.copy(planeta.inclinacion).multiply(giro)
      const uniformes = planeta.material.uniforms
      uniformes.uSol.value.copy(posicionSol)
      uniformes.uAparicion.value = aparicion
      uniformes.uTiempo.value = segundos
      planeta.materialOrbita.uniforms.uAnomaliaPlaneta.value = anomaliaEnFecha(planeta.datos, siglos)
      planeta.materialOrbita.uniforms.uAparicion.value = aparicion
    }

    if (saturno) {
      anillos.position.copy(saturno.malla.position)
      anillos.quaternion.copy(saturno.inclinacion).multiply(tumbarAnillo)
      anillos.scale.setScalar(saturno.malla.scale.x)
      anillos.updateWorldMatrix(true, false)
      saturno.malla.getWorldPosition(materialAnillos.uniforms.uCentroPlaneta.value)
      materialAnillos.uniforms.uRadioPlaneta.value = saturno.malla.scale.x
      materialAnillos.uniforms.uSol.value.copy(posicionSol)
      materialAnillos.uniforms.uAparicion.value = aparicion
    }

    for (const [material, tamano] of [
      [materialAsteroides, 1.3],
      [materialKuiper, 1.2],
    ] as const) {
      material.uniforms.uAnios.value = anios
      material.uniforms.uTamano.value = Math.max(1, tamano * pixeles)
      material.uniforms.uAparicion.value = aparicion * brilloCinturones
    }
  }

  return {
    raiz,
    actualizar,
    liberar: () => liberables.forEach((recurso) => recurso.dispose()),
  }
}

export function SistemaSolar({
  aparicion,
  segundosPorAnio = 40,
  fecha,
  quieto = false,
  escalaPlanetas,
  distanciaReferencia = 90,
}: SistemaSolarProps) {
  const sistema = useMemo(() => crearSistema(fecha ?? new Date()), [fecha])
  const segundos = useRef(0)
  const posiciones = useRef({ camara: new THREE.Vector3(), sol: new THREE.Vector3() })

  useEffect(() => () => sistema.liberar(), [sistema])

  useFrame(({ gl, camera }, delta) => {
    const valor = aparicion?.current ?? 1
    sistema.raiz.visible = valor > 0.002
    if (!sistema.raiz.visible) return
    // El reloj sólo corre mientras se ve: al aparecer, los planetas están donde están hoy.
    if (!quieto) segundos.current += Math.min(delta, 0.25)
    const { camara, sol } = posiciones.current
    camera.getWorldPosition(camara)
    sistema.raiz.getWorldPosition(sol)
    const brilloCinturones = Math.min(1, Math.pow(distanciaReferencia / Math.max(camara.distanceTo(sol), 1e-3), 0.9))
    sistema.actualizar(
      segundos.current / segundosPorAnio,
      segundos.current,
      valor,
      gl.getPixelRatio(),
      escalaPlanetas?.current ?? 1,
      brilloCinturones,
    )
  })

  return <primitive object={sistema.raiz} />
}
