'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  ANILLOS_SATURNO,
  PLANETAS,
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
  ATMOSFERA_FRAG,
  ORBITA_FRAG,
  ORBITA_VERT,
  PLANETA_FRAG,
  PLANETA_VERT,
  SOL_FRAG,
  SOL_VERT,
  TIERRA_FRAG,
} from '../shaders/sistemaSolar'
import { DESTINO, RADIO_TIERRA_KM } from '@/features/cochabamba/constantes/destino'
import { CAMPO, CIUDAD, CORAZON, LAGUNA, SOL_MANANA, direccionRumbo, direccionSol } from '@/features/cochabamba/constantes/valle'
import { PARCHE_FRAG, PARCHE_VERT } from '@/features/cochabamba/shaders/suelo'
import { crearParcheRegion } from '@/features/cochabamba/utils/parcheRegion'
import { ORIGEN_REGION, PISO_VALLE } from '@/features/cochabamba/utils/region'
import { LADO_REGION, crearTexturaRegion } from '@/features/cochabamba/utils/texturaRegion'
import { NUBE_BOLA_FRAG, NUBE_BOLA_VERT } from '@/features/cochabamba/shaders/nubesBolas'
import {
  crearBolasInstanciadas,
  crearTexturaSombras,
  distanciaANubes,
  esteNorte,
  generarCumulos,
  nieblaEnNubes,
  nubesEnGlobo,
  puntoTierra,
  SOMBRAS_NUBES,
} from '@/features/cochabamba/utils/nubesDestino'
import { NIEBLA } from '@/features/dibujo/store/niebla'
import { SOL_EN_ESCENA } from '../store/solEnEscena'
import { crearTexturasTierra, type TexturasTierra } from '../utils/texturaTierra'

/**
 * Nuestro sistema solar dibujado como un dibujo animado de los años 30, todo generado por código
 * (sin imágenes): el Sol como un disco dorado rodeado de rayos que giran despacio; los ocho
 * planetas en sus órbitas reales (elementos de JPL, posiciones del día de hoy) girando con sus
 * periodos de Kepler acelerados, sus ejes y días reales, con colores planos, sombra de color y
 * brillo de barniz; los anillos de Saturno entintados con la sombra del planeta, y cada órbita como
 * un camino de puntitos. La Tierra lleva su mapa real (continentes, desiertos, hielo) con las
 * costas entintadas, nubes en borreguitos, atmósfera en un aro y las luces de las ciudades, para
 * verla de cerca; la Luna la acompaña en su órbita. Distancias y tamaños comprimidos para que se vea
 * (ver `datos/planetas.ts`), pero con la perspectiva de una cámara real: nada cambia de tamaño al
 * acercarse salvo por la distancia. Todo sale ya dibujado (ver `shaders/sistemaSolar.ts`).
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
  /** Multiplicador del reloj de las órbitas (1 = `segundosPorAnio`); los giros bajan menos. */
  ritmo?: { readonly current: number }
  /** Visibilidad de las guías (las órbitas), 0..1. */
  guias?: { readonly current: number }
  /** Visibilidad de la Luna, 0..1 (su órbita real dura tres segundos a ritmo 1: sólo se muestra despacio). */
  luna?: { readonly current: number }
  /** Recibe la malla de la Tierra (su `position` está en el marco del sistema) para seguirla. */
  tierra?: { current: THREE.Object3D | null }
  /**
   * Cuánto se ajusta el giro de la Tierra (0..1) para que en Cochabamba amanezca: con 1 queda
   * fija a esa hora (el tiempo, al final del viaje, está casi detenido).
   */
  alineacionTierra?: { readonly current: number }
  /**
   * Recibe la región de Cochabamba en el marco del sistema: la vertical, el este y el norte en el
   * corazón de flores (unitarios) y la distancia (km) de la cámara a la nube más cercana.
   */
  region?: { current: RegionEnSistema }
}

/** La región de Cochabamba vista desde el sistema (ver `SistemaSolarProps.region`). */
export interface RegionEnSistema {
  vertical: THREE.Vector3
  este: THREE.Vector3
  norte: THREE.Vector3
  distanciaNubesKm: number
}

/** Estado de un fotograma del sistema. */
interface EstadoFotograma {
  anios: number
  segundos: number
  segundosGiro: number
  /** Segundos de pantalla desde el fotograma anterior. */
  paso: number
  alineacionTierra: number
  aparicion: number
  /** Alto del lienzo en píxeles de dispositivo (los puntos de las órbitas crecen con él). */
  altoPixeles: number
  /** Posición de la cámara en el mundo y tangente de la mitad de su campo vertical. */
  camara: THREE.Vector3
  tanMitadFov: number
  guias: number
  luna: number
}

/**
 * El Sol de caricatura: radio fijo en el mundo, medio lado del cartel con sus rayos (en radios) y
 * tope de su radio en pantalla (px a 720 de alto).
 */
const SOL = { radio: 3.0, medioLado: 1.75, topePx: 34 } as const

/**
 * Tope del radio en pantalla de los planetas lejanos (px a 720 de alto; la Tierra y la Luna no lo
 * tienen). Las distancias están comprimidas: a escala real, ir de la vista del sistema entero hasta
 * la Tierra apenas cambiaría la distancia al Sol o a Júpiter, y su tamaño aparente casi no variaría.
 * Comprimidas, el Sol y los planetas que quedan cerca del camino se hinchaban al pasar. Con el tope
 * se comportan como lo que son, astros lejanos; con el sistema entero a la vista ninguno llega a él.
 */
const TOPE_PLANETAS_PX = 22

/** Cochabamba (Bolivia) y la hora solar a la que llega la cámara (ver `DESTINO`). */
const COCHABAMBA = DESTINO

/** Ángulo llevado a (−π, π]. */
const envolver = (angulo: number): number => angulo - 2 * Math.PI * Math.round(angulo / (2 * Math.PI))

/** La Luna: radio real relativo a la Tierra y órbita comprimida (a escala serían 60 radios). */
const LUNA = {
  radio: 0.273,
  distancia: 4.5,
  periodoAnios: 27.32 / 365.25,
  inclinacion: (5.1 * Math.PI) / 180,
} as const

/** Color de los puntitos de cada órbita (sRGB): crema teñido del color del planeta. */
const TINTE_ORBITA: Readonly<Record<IdPlaneta, readonly [number, number, number]>> = {
  mercurio: [0.9, 0.86, 0.84],
  venus: [1.0, 0.9, 0.7],
  tierra: [0.72, 0.86, 1.0],
  marte: [1.0, 0.76, 0.64],
  jupiter: [1.0, 0.88, 0.72],
  saturno: [1.0, 0.92, 0.72],
  urano: [0.74, 0.96, 0.96],
  neptuno: [0.7, 0.8, 1.0],
}

/** Separación entre los puntitos de una órbita (unidades del sistema) y tamaño del punto (px a 720 de alto). */
const PUNTITOS_ORBITA = { separacion: 0.9, minimo: 40, maximo: 400, tamano: 2.4 } as const

interface PlanetaEnEscena {
  readonly id: IdPlaneta
  readonly datos: (typeof PLANETAS)[number]
  readonly malla: THREE.Mesh
  readonly material: THREE.ShaderMaterial
  readonly inclinacion: THREE.Quaternion
  readonly materialOrbita: THREE.ShaderMaterial
  readonly orbita: THREE.Points
}

function crearSistema(fecha: Date) {
  const raiz = new THREE.Group()
  const liberables: { dispose: () => void }[] = []
  const siglosIniciales = siglosDesdeJ2000(fecha)

  // Sol: un cartel de cara a la cámara con el disco y los rayos dibujados.
  const materialSol = new THREE.ShaderMaterial({
    vertexShader: SOL_VERT,
    fragmentShader: SOL_FRAG,
    uniforms: {
      uAparicion: { value: 0 },
      uTiempo: { value: 0 },
      uTamano: { value: SOL.radio * SOL.medioLado },
      uMedioLado: { value: SOL.medioLado },
    },
  })
  // Sin profundidad propia: el pase no le pone el contorno grueso (a unos píxeles, sus rayos
  // quedaban en una mancha de tinta). Se dibuja después del cielo (que se suma y le borraría la
  // marca de caricatura) y de los puntitos de las órbitas, sustituyendo lo que haya; los planetas
  // que tiene delante lo tapan por profundidad.
  Object.assign(materialSol, {
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.ZeroFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.ZeroFactor,
  })
  const geometriaSol = new THREE.PlaneGeometry(2, 2)
  const sol = new THREE.Mesh(geometriaSol, materialSol)
  sol.frustumCulled = false
  sol.renderOrder = 3
  raiz.add(sol)
  liberables.push(materialSol, geometriaSol)

  const geometriaPlaneta = new THREE.SphereGeometry(1, 64, 32)
  liberables.push(geometriaPlaneta)
  const arriba = new THREE.Vector3(0, 1, 0)
  const polo = new THREE.Vector3()
  const punto = new THREE.Vector3()

  // La Tierra se ve de cerca al final: esfera más fina y mapas pintados (se generan una vez, en
  // diferido, para no frenar la carga de la página; hasta entonces lleva mapas vacíos).
  const geometriaTierra = new THREE.SphereGeometry(1, 160, 80)
  const vacia = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
  vacia.needsUpdate = true
  liberables.push(geometriaTierra, vacia)
  let mapasTierra: TexturasTierra | null = null

  const planetas: PlanetaEnEscena[] = PLANETAS.map((datos) => {
    const esTierra = datos.id === 'tierra'
    const material = new THREE.ShaderMaterial({
      vertexShader: PLANETA_VERT,
      fragmentShader: esTierra ? TIERRA_FRAG : PLANETA_FRAG,
      uniforms: {
        uAspecto: { value: datos.aspecto },
        uSol: { value: new THREE.Vector3() },
        uAparicion: { value: 0 },
        uTiempo: { value: 0 },
        uMapa: { value: vacia },
        uPoblacion: { value: vacia },
        ...(esTierra
          ? {
              uSolLocal: { value: new THREE.Vector3(1, 0, 0) },
              // La región de Cochabamba (ver `features/cochabamba/utils/region.ts`).
              uRegion: { value: vacia },
              uRegionListo: { value: 0 },
              uLadoRegion: { value: LADO_REGION },
              uOrigen: { value: puntoTierra(ORIGEN_REGION.latitud, ORIGEN_REGION.longitud) },
              uEste: { value: esteNorte(ORIGEN_REGION.latitud, ORIGEN_REGION.longitud).este },
              uNorte: { value: esteNorte(ORIGEN_REGION.latitud, ORIGEN_REGION.longitud).norte },
              uSombrasNubes: { value: vacia },
              uLadoSombras: { value: SOMBRAS_NUBES.lado },
            }
          : {}),
      },
    })
    const malla = new THREE.Mesh(esTierra ? geometriaTierra : geometriaPlaneta, material)
    malla.scale.setScalar(radioVisible(datos.radio))
    raiz.add(malla)
    const [longitudPolo, latitudPolo] = ROTACION[datos.id].polo
    const inclinacion = new THREE.Quaternion().setFromUnitVectors(arriba, direccionEcliptica(longitudPolo, latitudPolo, polo))

    // Órbita: puntitos a distancia fija a lo largo de ella (por anomalía excéntrica), comprimidos a
    // la escala visible.
    const cantidad = Math.round(
      Math.min(PUNTITOS_ORBITA.maximo, Math.max(PUNTITOS_ORBITA.minimo, (2 * Math.PI * radioOrbitaVisible(datos.a)) / PUNTITOS_ORBITA.separacion)),
    )
    const posiciones = new Float32Array(cantidad * 3)
    const anomalias = new Float32Array(cantidad)
    for (let k = 0; k < cantidad; k += 1) {
      const anomalia = (k / cantidad) * Math.PI * 2
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
        uTamano: { value: 0 },
        uSeparacion: { value: (2 * Math.PI * radioOrbitaVisible(datos.a)) / cantidad },
        uAltoPx: { value: 720 },
        // El planeta ocupa radio/distancia radianes de su órbita vista desde el Sol.
        uHueco: { value: (1.3 * radioVisible(datos.radio)) / radioOrbitaVisible(datos.a) },
      },
      // Sin profundidad (el pase no les pone contorno) y sustituyendo el color y la marca de
      // caricatura del píxel: van después del cielo, que se suma.
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.ZeroFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.ZeroFactor,
    })
    const orbita = new THREE.Points(geometriaOrbita, materialOrbita)
    orbita.renderOrder = 2
    orbita.frustumCulled = false
    raiz.add(orbita)
    liberables.push(material, geometriaOrbita, materialOrbita)
    return { id: datos.id, datos, malla, material, inclinacion, materialOrbita, orbita }
  })

  const tierra = planetas.find((planeta) => planeta.id === 'tierra')
  // Atmósfera: un aro de caricatura alrededor de la Tierra (cáscara un 5 % mayor, hija de su malla).
  const materialAtmosfera = new THREE.ShaderMaterial({
    vertexShader: PLANETA_VERT,
    fragmentShader: ATMOSFERA_FRAG,
    uniforms: {
      uSol: { value: new THREE.Vector3() },
      uCentro: { value: new THREE.Vector3() },
      uRadio: { value: 1 },
      uAparicion: { value: 0 },
    },
  })
  const atmosfera = new THREE.Mesh(geometriaTierra, materialAtmosfera)
  atmosfera.scale.setScalar(1.06)
  tierra?.malla.add(atmosfera)
  liberables.push(materialAtmosfera)

  // Las nubes de la llegada (el mar de nubes sobre el Chapare, cúmulos sobre sierras y valles y la
  // nube de entrada), de bolas en el espacio, hijas de la Tierra: giran con ella, y sus sombras se
  // pintan en su mapa y en el relieve.
  const baseRegion = esteNorte(ORIGEN_REGION.latitud, ORIGEN_REGION.longitud)
  const cumulos = generarCumulos()
  const geometriaNubes = crearBolasInstanciadas(nubesEnGlobo(cumulos, puntoTierra(ORIGEN_REGION.latitud, ORIGEN_REGION.longitud), baseRegion.este, baseRegion.norte))
  const sombrasNubes = crearTexturaSombras(cumulos)
  liberables.push(sombrasNubes)
  if (tierra) tierra.material.uniforms.uSombrasNubes.value = sombrasNubes
  const materialNubes = new THREE.ShaderMaterial({
    vertexShader: NUBE_BOLA_VERT,
    fragmentShader: NUBE_BOLA_FRAG,
    uniforms: {
      uCamara: { value: new THREE.Vector3() },
      uSol: { value: new THREE.Vector3(1, 0, 0) },
      uEscalaVista: { value: 1 },
      uPixelesPorRadian: { value: 800 },
      uBruma: { value: new THREE.Vector2(1, 0) },
      uCrecer: { value: 0 },
    },
    // El cartel mira hacia fuera de la cámara: se dibujan las dos caras.
    side: THREE.DoubleSide,
  })
  const nubes = new THREE.Mesh(geometriaNubes, materialNubes)
  nubes.frustumCulled = false
  tierra?.malla.add(nubes)
  // La cámara en el marco de la Tierra, justo antes de dibujar (con las matrices de este
  // fotograma: en la bajada rápida, un fotograma de retraso movía las nubes respecto al suelo).
  const camaraAlDibujar = new THREE.Vector3()
  nubes.onBeforeRender = (_renderer, _escena, camaraEscena) => {
    nubes.worldToLocal(camaraAlDibujar.setFromMatrixPosition(camaraEscena.matrixWorld))
    materialNubes.uniforms.uCamara.value.copy(camaraAlDibujar)
  }
  liberables.push(geometriaNubes, materialNubes)

  // La Luna: mares y cráteres (aspecto 8).
  const materialLuna = new THREE.ShaderMaterial({
    vertexShader: PLANETA_VERT,
    fragmentShader: PLANETA_FRAG,
    uniforms: {
      uAspecto: { value: 8 },
      uSol: { value: new THREE.Vector3() },
      uAparicion: { value: 0 },
      uTiempo: { value: 0 },
    },
  })
  const luna = new THREE.Mesh(geometriaPlaneta, materialLuna)
  raiz.add(luna)
  liberables.push(materialLuna)

  // El relieve de la región en 3D (ver `features/cochabamba/utils/parcheRegion.ts`), hijo de la
  // Tierra; su malla se calcula por tandas tras montar.
  const origenRegion = puntoTierra(ORIGEN_REGION.latitud, ORIGEN_REGION.longitud)
  const { este: esteRegion, norte: norteRegion } = esteNorte(ORIGEN_REGION.latitud, ORIGEN_REGION.longitud)
  const [ejeCorazonX, ejeCorazonZ] = direccionRumbo(CORAZON.rumbo)
  const materialParche = new THREE.ShaderMaterial({
    vertexShader: PARCHE_VERT,
    fragmentShader: PARCHE_FRAG,
    uniforms: {
      uCamaraValle: { value: new THREE.Vector3() },
      // El Sol de la mañana del valle (el mismo con que se pintan el valle y las sombras de las nubes).
      uSolValle: { value: new THREE.Vector3(...direccionSol(SOL_MANANA.rumbo, SOL_MANANA.elevacion)) },
      uBruma: { value: 0 },
      uRegion: { value: vacia },
      uLadoRegion: { value: LADO_REGION },
      uCorazon: { value: new THREE.Vector4(CORAZON.escala, ejeCorazonX, ejeCorazonZ, CORAZON.ribete) },
      uSombrasNubes: { value: sombrasNubes },
      uLadoSombras: { value: SOMBRAS_NUBES.lado },
      uCampo: { value: CAMPO.semiLado },
      uCiudad: { value: new THREE.Vector3(CIUDAD.centro[0], CIUDAD.centro[1], CIUDAD.radio) },
      uLaguna: { value: new THREE.Vector4(LAGUNA.centro[0], LAGUNA.centro[1], LAGUNA.semiejes[0], LAGUNA.semiejes[1]) },
    },
  })
  const parche = new THREE.Mesh(new THREE.BufferGeometry(), materialParche)
  parche.frustumCulled = false
  parche.visible = false
  tierra?.malla.add(parche)
  const camaraParche = new THREE.Vector3()
  parche.onBeforeRender = (_renderer, _escena, camaraEscena) => {
    parche.worldToLocal(camaraParche.setFromMatrixPosition(camaraEscena.matrixWorld))
    const metros = RADIO_TIERRA_KM * 1000
    materialParche.uniforms.uCamaraValle.value.set(
      camaraParche.dot(esteRegion) * metros,
      (camaraParche.length() - 1) * metros - PISO_VALLE,
      -camaraParche.dot(norteRegion) * metros,
    )
  }
  liberables.push(materialParche)

  /**
   * Pinta los mapas de la Tierra (unos 200 ms) y, por tandas sin trabar la página, la región de
   * Cochabamba y su relieve: se llama en diferido tras montar.
   */
  let texturaRegion: THREE.DataTexture | null = null
  let liberado = false
  let parcheListo = false
  const haciaCamaraRegion = new THREE.Vector3()
  const cargarMapasTierra = (): void => {
    if (mapasTierra || !tierra) return
    mapasTierra = crearTexturasTierra()
    tierra.material.uniforms.uMapa.value = mapasTierra.mapa
    tierra.material.uniforms.uPoblacion.value = mapasTierra.poblacion
    void crearTexturaRegion().then((textura) => {
      if (liberado) {
        textura.dispose()
        return
      }
      texturaRegion = textura
      tierra.material.uniforms.uRegion.value = textura
      tierra.material.uniforms.uRegionListo.value = 1
    })
    void crearParcheRegion({ origen: origenRegion, este: esteRegion, norte: norteRegion }).then((geometria) => {
      if (liberado) {
        geometria.dispose()
        return
      }
      parche.geometry.dispose()
      parche.geometry = geometria
      parcheListo = true
    })
  }

  // Anillos de Saturno en su plano ecuatorial, con la sombra del planeta: sólidos (los huecos se
  // descartan), para que el pase los entinte contra el cielo.
  const saturno = planetas.find((planeta) => planeta.id === 'saturno')
  const geometriaAnillos = new THREE.RingGeometry(ANILLOS_SATURNO.interior - 0.02, ANILLOS_SATURNO.exterior + 0.02, 256, 1)
  const materialAnillos = new THREE.ShaderMaterial({
    vertexShader: ANILLOS_VERT,
    fragmentShader: ANILLOS_FRAG,
    uniforms: {
      uSol: { value: new THREE.Vector3() },
      uCentroPlaneta: { value: new THREE.Vector3() },
      uRadioPlaneta: { value: 1 },
      uAparicion: { value: 0 },
    },
    side: THREE.DoubleSide,
  })
  const anillos = new THREE.Mesh(geometriaAnillos, materialAnillos)
  raiz.add(anillos)
  liberables.push(geometriaAnillos, materialAnillos)
  const tumbarAnillo = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)

  const posicionSol = new THREE.Vector3()
  const giro = new THREE.Quaternion()

  const direccionLuna = new THREE.Vector3()
  const posicionPlaneta = new THREE.Vector3()

  // Cochabamba en el marco propio de la Tierra (el del mapa: longitud atan(−z, x), latitud asin(y)).
  const latitudCochabamba = THREE.MathUtils.degToRad(COCHABAMBA.latitud)
  const longitudCochabamba = THREE.MathUtils.degToRad(COCHABAMBA.longitud)
  const puntoCochabamba = new THREE.Vector3(
    Math.cos(latitudCochabamba) * Math.cos(longitudCochabamba),
    Math.sin(latitudCochabamba),
    -Math.cos(latitudCochabamba) * Math.sin(longitudCochabamba),
  )
  const regionEnSistema: RegionEnSistema = {
    vertical: new THREE.Vector3(0, 1, 0),
    este: new THREE.Vector3(1, 0, 0),
    norte: new THREE.Vector3(0, 0, -1),
    distanciaNubesKm: Number.POSITIVE_INFINITY,
  }
  const centroTierra = new THREE.Vector3()
  const solLocal = new THREE.Vector3()
  const camaraLocal = new THREE.Vector3()
  const giroMundo = new THREE.Quaternion()
  const inclinacionInversa = new THREE.Quaternion()
  const solDesdeTierra = new THREE.Vector3()
  /** Lo que se suma al giro propio de la Tierra para que en Cochabamba amanezca al llegar. */
  let correccionTierra = 0

  /**
   * Coloca todo en `anios` de simulación desde la fecha de partida. Al aparecer, todo crece desde
   * nada (en caricatura no se funde desde el negro: salía una mancha oscura); después, cada cosa
   * tiene su tamaño fijo en el mundo.
   */
  const actualizar = ({
    anios,
    segundos,
    segundosGiro,
    paso,
    alineacionTierra,
    aparicion,
    altoPixeles,
    camara,
    tanMitadFov,
    guias,
    luna: visibilidadLuna,
  }: EstadoFotograma): void => {
    const siglos = siglosIniciales + anios / 100
    const crecer = aparicion * aparicion * (3 - 2 * aparicion)
    const pixelesPorRadian = altoPixeles / 2 / tanMitadFov
    raiz.updateWorldMatrix(true, false)
    sol.getWorldPosition(posicionSol)
    materialSol.uniforms.uAparicion.value = 1
    materialSol.uniforms.uTiempo.value = segundos
    let radioSol = SOL.radio * crecer
    const radioSolPx = (radioSol / Math.max(camara.distanceTo(posicionSol), 1e-3)) * pixelesPorRadian
    const topeSol = SOL.topePx * (altoPixeles / 720)
    if (radioSolPx > topeSol) radioSol *= topeSol / radioSolPx
    materialSol.uniforms.uTamano.value = radioSol * SOL.medioLado
    SOL_EN_ESCENA.posicion.copy(posicionSol)
    SOL_EN_ESCENA.radio = radioSol
    SOL_EN_ESCENA.visible = aparicion
    const tamanoPuntito = PUNTITOS_ORBITA.tamano * (altoPixeles / 720) * guias
    const tope = TOPE_PLANETAS_PX * (altoPixeles / 720)

    for (const planeta of planetas) {
      aEscalaVisible(posicionHeliocentrica(planeta.datos, siglos, planeta.malla.position))
      let radio = radioVisible(planeta.datos.radio) * crecer
      if (planeta.id !== 'tierra') {
        posicionPlaneta.copy(planeta.malla.position).applyMatrix4(raiz.matrixWorld)
        const radioPx = (radio / Math.max(camara.distanceTo(posicionPlaneta), 1e-3)) * pixelesPorRadian
        if (radioPx > tope) radio *= tope / radioPx
      }
      planeta.malla.scale.setScalar(radio)
      const periodo = ROTACION[planeta.id].periodo
      let anguloGiro = ((2 * Math.PI * segundosGiro) / periodo) % (2 * Math.PI)
      if (planeta.id === 'tierra') {
        // Hora solar en Cochabamba: el Sol, visto desde la Tierra en su marco sin girar, tiene su
        // punto subsolar en la longitud `longitudSol`; girar la Tierra un ángulo θ lo lleva a
        // longitudSol − θ, y amanece (hora h) cuando está (12 − h)·15° al este de Cochabamba.
        inclinacionInversa.copy(planeta.inclinacion).invert()
        solDesdeTierra.copy(planeta.malla.position).multiplyScalar(-1).normalize().applyQuaternion(inclinacionInversa)
        const longitudSol = Math.atan2(-solDesdeTierra.z, solDesdeTierra.x)
        const objetivo = longitudSol - longitudCochabamba + ((COCHABAMBA.hora - 12) / 24) * 2 * Math.PI
        // Se sigue sin saltos: el giro corregido va hacia el objetivo por el camino corto.
        const error = envolver(objetivo - (anguloGiro + correccionTierra))
        correccionTierra += error * (1 - Math.exp(-paso * 2.5)) * alineacionTierra
        anguloGiro += correccionTierra
      }
      giro.setFromAxisAngle(arriba, anguloGiro)
      planeta.malla.quaternion.copy(planeta.inclinacion).multiply(giro)
      if (planeta.id === 'tierra') {
        regionEnSistema.vertical.copy(origenRegion).applyQuaternion(planeta.malla.quaternion)
        regionEnSistema.este.copy(esteRegion).applyQuaternion(planeta.malla.quaternion)
        regionEnSistema.norte.copy(norteRegion).applyQuaternion(planeta.malla.quaternion)
        // El Sol y la cámara en el marco de la Tierra: las nubes y sus sombras se calculan ahí.
        planeta.malla.updateWorldMatrix(true, false)
        planeta.malla.getWorldQuaternion(giroMundo).invert()
        planeta.malla.getWorldPosition(centroTierra)
        solLocal.copy(posicionSol).sub(centroTierra).normalize().applyQuaternion(giroMundo)
        planeta.malla.worldToLocal(camaraLocal.copy(camara))
        planeta.material.uniforms.uSolLocal.value.copy(solLocal)
        materialNubes.uniforms.uSol.value.copy(solLocal)
        materialNubes.uniforms.uEscalaVista.value = planeta.malla.matrixWorld.getMaxScaleOnAxis()
        materialNubes.uniforms.uPixelesPorRadian.value = pixelesPorRadian
        // El relieve de la región: la cámara y el Sol en el marco del valle (m, x al este, y arriba,
        // z al sur); bruma sólo ya abajo.
        const metros = RADIO_TIERRA_KM * 1000
        const altitud = (camaraLocal.length() - 1) * metros
        materialParche.uniforms.uBruma.value = 0.75 * (1 - THREE.MathUtils.smoothstep(altitud, 6000, 40000))
        // Lo que mide un píxel en la región (km): el relieve 3D sólo cuando el mapa ya la pinta
        // entera (desde más lejos se veía como una moneda), y las nubes de la llegada crecen a la vez
        // que la región aparece en el mapa.
        haciaCamaraRegion.copy(camaraLocal).sub(origenRegion)
        const kmHastaRegion = haciaCamaraRegion.length() * RADIO_TIERRA_KM
        const incidencia = Math.max(0.15, haciaCamaraRegion.normalize().dot(origenRegion))
        const kmPorPixelRegion = kmHastaRegion / pixelesPorRadian / incidencia
        parche.visible = parcheListo && kmPorPixelRegion < 1.25
        materialNubes.uniforms.uCrecer.value = 1 - THREE.MathUtils.smoothstep(kmPorPixelRegion, 1.25, 2.6)
        // Dentro de una nube, niebla (el pase la pinta); y el plano cercano, con la nube más cercana.
        const camaraKm = { x: camaraLocal.dot(esteRegion) * RADIO_TIERRA_KM, y: camaraLocal.dot(norteRegion) * RADIO_TIERRA_KM, alto: altitud / 1000 }
        NIEBLA.globo = camaraKm.alto < 14 ? nieblaEnNubes(camaraKm.x, camaraKm.y, camaraKm.alto, cumulos) : 0
        regionEnSistema.distanciaNubesKm = camaraKm.alto < 40 ? distanciaANubes(camaraKm.x, camaraKm.y, camaraKm.alto, cumulos) : camaraKm.alto - 9
      }
      const uniformes = planeta.material.uniforms
      uniformes.uSol.value.copy(posicionSol)
      uniformes.uAparicion.value = 1
      uniformes.uTiempo.value = segundos
      planeta.materialOrbita.uniforms.uAnomaliaPlaneta.value = anomaliaEnFecha(planeta.datos, siglos)
      planeta.materialOrbita.uniforms.uTamano.value = tamanoPuntito * Math.min(1, aparicion * 1.5)
      planeta.materialOrbita.uniforms.uAltoPx.value = altoPixeles
      planeta.orbita.visible = tamanoPuntito * aparicion > 0.5
    }

    if (tierra) {
      materialAtmosfera.uniforms.uSol.value.copy(posicionSol)
      materialAtmosfera.uniforms.uAparicion.value = 1
      tierra.malla.getWorldPosition(materialAtmosfera.uniforms.uCentro.value)
      materialAtmosfera.uniforms.uRadio.value = tierra.malla.scale.x
      // La Luna gira alrededor de la Tierra en su plano (5.1° sobre la eclíptica). Sólo se muestra
      // con el tiempo frenado (a ritmo normal da una vuelta cada tres segundos) y aparece creciendo
      // mientras aún es un puntito.
      const angulo = (2 * Math.PI * anios) / LUNA.periodoAnios + 1.1
      direccionLuna.set(Math.cos(angulo), Math.sin(angulo) * Math.sin(LUNA.inclinacion), -Math.sin(angulo) * Math.cos(LUNA.inclinacion))
      luna.position.copy(tierra.malla.position).addScaledVector(direccionLuna, LUNA.distancia)
      luna.scale.setScalar(radioVisible(1) * LUNA.radio * crecer * visibilidadLuna)
      luna.visible = visibilidadLuna > 0.002
      materialLuna.uniforms.uSol.value.copy(posicionSol)
      materialLuna.uniforms.uAparicion.value = 1
      materialLuna.uniforms.uTiempo.value = segundos
    }

    if (saturno) {
      anillos.position.copy(saturno.malla.position)
      anillos.quaternion.copy(saturno.inclinacion).multiply(tumbarAnillo)
      anillos.scale.setScalar(saturno.malla.scale.x)
      anillos.updateWorldMatrix(true, false)
      saturno.malla.getWorldPosition(materialAnillos.uniforms.uCentroPlaneta.value)
      materialAnillos.uniforms.uRadioPlaneta.value = saturno.malla.scale.x
      materialAnillos.uniforms.uSol.value.copy(posicionSol)
      materialAnillos.uniforms.uAparicion.value = 1
    }
  }

  return {
    raiz,
    tierra: tierra?.malla ?? null,
    regionEnSistema,
    actualizar,
    cargarMapasTierra,
    liberar: () => {
      liberado = true
      parche.geometry.dispose()
      liberables.forEach((recurso) => recurso.dispose())
      mapasTierra?.liberar()
      texturaRegion?.dispose()
    },
  }
}

export function SistemaSolar({
  aparicion,
  segundosPorAnio = 40,
  fecha,
  quieto = false,
  ritmo,
  guias,
  luna,
  tierra,
  alineacionTierra,
  region,
}: SistemaSolarProps) {
  const sistema = useMemo(() => crearSistema(fecha ?? new Date()), [fecha])
  const relojes = useRef({ orbitas: 0, giros: 0, segundos: 0 })
  const posicionCamara = useRef(new THREE.Vector3())

  useEffect(() => () => sistema.liberar(), [sistema])

  // Los mapas de la Tierra se pintan poco después de montar, fuera del primer fotograma.
  useEffect(() => {
    const espera = window.setTimeout(() => sistema.cargarMapasTierra(), 1500)
    return () => window.clearTimeout(espera)
  }, [sistema])

  useEffect(() => {
    if (tierra) tierra.current = sistema.tierra
    if (region) region.current = sistema.regionEnSistema
  }, [sistema, tierra, region])

  useEffect(
    () => () => {
      SOL_EN_ESCENA.visible = 0
      NIEBLA.globo = 0
    },
    [],
  )

  useFrame(({ gl, camera }, delta) => {
    const valor = aparicion?.current ?? 1
    sistema.raiz.visible = valor > 0.002
    if (!sistema.raiz.visible) {
      SOL_EN_ESCENA.visible = 0
      NIEBLA.globo = 0
      return
    }
    // Los relojes sólo corren mientras se ve: al aparecer, los planetas están donde están hoy. Con
    // el ritmo bajo (al acercarse a la Tierra) las órbitas casi se detienen y los giros van a un
    // tercio: la Tierra sigue rotando a la vista.
    const paso = Math.min(delta, 0.25)
    if (!quieto) {
      const factor = ritmo?.current ?? 1
      relojes.current.orbitas += paso * factor
      relojes.current.giros += paso * Math.max(factor, 0.35)
      relojes.current.segundos += paso
    }
    sistema.actualizar({
      anios: relojes.current.orbitas / segundosPorAnio,
      segundos: relojes.current.segundos,
      segundosGiro: relojes.current.giros,
      paso,
      alineacionTierra: alineacionTierra?.current ?? 0,
      aparicion: valor,
      altoPixeles: gl.domElement.height,
      camara: camera.getWorldPosition(posicionCamara.current),
      tanMitadFov: Math.tan(THREE.MathUtils.degToRad((camera instanceof THREE.PerspectiveCamera ? camera.fov : 45) / 2)),
      guias: guias?.current ?? 1,
      luna: luna?.current ?? 1,
    })
  })

  return <primitive object={sistema.raiz} />
}
