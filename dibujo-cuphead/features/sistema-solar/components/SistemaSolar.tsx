'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { pulsaciones } from '@/features/dibujo/store/ritmoDibujo'
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
import { SOL_EN_ESCENA } from '../store/solEnEscena'
import { crearTexturasTierra, type TexturasTierra } from '../utils/texturaTierra'

/**
 * Nuestro sistema solar dibujado como un dibujo animado de los años 30, todo generado por código
 * (sin imágenes): el Sol con cara, sonriente y cantando al compás, rodeado de rayos; los ocho
 * planetas en sus órbitas reales (elementos de JPL, posiciones del día de hoy) girando con sus
 * periodos de Kepler acelerados, sus ejes y días reales, con colores planos, sombra de color y
 * brillo de barniz; los anillos de Saturno entintados con la sombra del planeta, y cada órbita como
 * un camino de puntitos. La Tierra lleva su mapa real (continentes, desiertos, hielo) con las
 * costas entintadas, nubes en borreguitos, atmósfera en un aro y las luces de las ciudades, para
 * verla de cerca; la Luna, dormilona, la acompaña. Distancias y tamaños comprimidos para que se vea
 * (ver `datos/planetas.ts`). Todo sale ya dibujado (ver `shaders/sistemaSolar.ts`).
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
  /** Multiplicador del reloj de las órbitas (1 = `segundosPorAnio`); los giros bajan menos. */
  ritmo?: { readonly current: number }
  /** Visibilidad de las guías (las órbitas), 0..1. */
  guias?: { readonly current: number }
  /** Visibilidad de la Luna, 0..1 (su órbita real dura tres segundos a ritmo 1: sólo se muestra despacio). */
  luna?: { readonly current: number }
  /** Recibe la malla de la Tierra (su `position` está en el marco del sistema) para seguirla. */
  tierra?: { current: THREE.Object3D | null }
  /**
   * Tamaño de los demás planetas respecto al suyo (1) al acercarse a la Tierra (0): con las
   * distancias comprimidas, Venus, Saturno o Neptuno quedarían enormes junto a la cámara; vistos
   * desde cerca de la Tierra son puntos de luz, como en la realidad.
   */
  lejanos?: { readonly current: number }
}

/** Estado de un fotograma del sistema. */
interface EstadoFotograma {
  anios: number
  segundos: number
  segundosGiro: number
  pulsaciones: number
  aparicion: number
  /** Alto del lienzo en píxeles de dispositivo (los puntos de las órbitas crecen con él). */
  altoPixeles: number
  /** Posición y orientación de la cámara en el mundo y tangente de la mitad de su campo vertical. */
  camara: THREE.Vector3
  orientacionCamara: THREE.Quaternion
  tanMitadFov: number
  escala: number
  guias: number
  luna: number
  lejanos: number
}

/**
 * El Sol de caricatura: su radio (mayor que el del original), el medio lado del cartel con sus
 * rayos (en radios) y el radio mínimo en pantalla (px a 720 de alto): de lejos se dibuja algo más
 * grande de lo que tocaría para que su cara se siga leyendo, como el protagonista que es. Al
 * acercarse a la Tierra se encoge como los demás planetas (si no, sus rayos llenaban la pantalla).
 */
const SOL = { radio: 3.4, medioLado: 1.9, minimoPx: 24, cerca: 0.35 } as const

/**
 * La Luna: radio real relativo a la Tierra y órbita comprimida (a escala serían 60 radios). Al
 * final, cuando aparece junto a la Tierra, deja su órbita y "posa": se queda arriba a la derecha de
 * la Tierra vista desde la cámara, algo detrás de ella (`pose`: derecha, arriba y hacia el fondo),
 * para que se vea su cara. Con su órbita real quedaba detrás de la Tierra o fuera de cuadro.
 */
const LUNA = {
  radio: 0.273,
  distancia: 4.5,
  periodoAnios: 27.32 / 365.25,
  inclinacion: (5.1 * Math.PI) / 180,
  pose: [0.62, 0.3, 0.72] as const,
  aumentoPose: 1.2,
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

  // Sol: un cartel de cara a la cámara con la cara y los rayos dibujados.
  const materialSol = new THREE.ShaderMaterial({
    vertexShader: SOL_VERT,
    fragmentShader: SOL_FRAG,
    uniforms: {
      uAparicion: { value: 0 },
      uTiempo: { value: 0 },
      uPulsaciones: { value: 0 },
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

  // La Luna: mares, cráteres y una cara dormilona que mira a la cámara (aspecto 8).
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

  /** Pinta los mapas de la Tierra (unos 200 ms): se llama en diferido tras montar. */
  const cargarMapasTierra = (): void => {
    if (mapasTierra || !tierra) return
    mapasTierra = crearTexturasTierra()
    tierra.material.uniforms.uMapa.value = mapasTierra.mapa
    tierra.material.uniforms.uPoblacion.value = mapasTierra.poblacion
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
  const poseLuna = new THREE.Vector3()
  const giroRaiz = new THREE.Quaternion()

  /** Coloca todo en `anios` de simulación desde la fecha de partida y aplica el fundido. */
  const actualizar = ({
    anios,
    segundos,
    segundosGiro,
    pulsaciones: pulsos,
    aparicion,
    altoPixeles,
    camara,
    orientacionCamara,
    tanMitadFov,
    escala,
    guias,
    luna: visibilidadLuna,
    lejanos,
  }: EstadoFotograma): void => {
    const siglos = siglosIniciales + anios / 100
    // En caricatura nada se funde desde el negro (salía una mancha oscura): todo aparece creciendo.
    const crecer = aparicion * aparicion * (3 - 2 * aparicion)
    raiz.updateWorldMatrix(true, false)
    sol.getWorldPosition(posicionSol)
    materialSol.uniforms.uAparicion.value = 1
    materialSol.uniforms.uTiempo.value = segundos
    materialSol.uniforms.uPulsaciones.value = pulsos
    const radioSolPx = (SOL.radio / Math.max(camara.distanceTo(posicionSol), 1e-3)) * (altoPixeles / 2 / tanMitadFov)
    const escalaSol =
      Math.max(1, (SOL.minimoPx * (altoPixeles / 720)) / Math.max(radioSolPx, 1e-3)) * (SOL.cerca + (1 - SOL.cerca) * lejanos) * crecer
    materialSol.uniforms.uTamano.value = SOL.radio * SOL.medioLado * escalaSol
    SOL_EN_ESCENA.posicion.copy(posicionSol)
    SOL_EN_ESCENA.radio = SOL.radio * escalaSol
    SOL_EN_ESCENA.visible = aparicion
    const tamanoPuntito = PUNTITOS_ORBITA.tamano * (altoPixeles / 720) * guias

    for (const planeta of planetas) {
      aEscalaVisible(posicionHeliocentrica(planeta.datos, siglos, planeta.malla.position))
      const esTierra = planeta.id === 'tierra'
      const alejamiento = esTierra ? 1 : 0.12 + 0.88 * lejanos
      planeta.malla.scale.setScalar(radioVisible(planeta.datos.radio) * escala * alejamiento * crecer)
      const periodo = ROTACION[planeta.id].periodo
      giro.setFromAxisAngle(arriba, ((2 * Math.PI * segundosGiro) / periodo) % (2 * Math.PI))
      planeta.malla.quaternion.copy(planeta.inclinacion).multiply(giro)
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
      // La Luna gira alrededor de la Tierra en su plano (5.1° sobre la eclíptica).
      const angulo = (2 * Math.PI * anios) / LUNA.periodoAnios + 1.1
      direccionLuna.set(Math.cos(angulo), Math.sin(angulo) * Math.sin(LUNA.inclinacion), -Math.sin(angulo) * Math.cos(LUNA.inclinacion))
      if (visibilidadLuna > 0) {
        // La pose, en el marco del sistema: ejes de la cámara (derecha, arriba, hacia delante)
        // llevados al marco local de la raíz.
        raiz.getWorldQuaternion(giroRaiz).invert()
        const [derecha, arriba, fondo] = LUNA.pose
        poseLuna
          .set(derecha, arriba, -fondo)
          .applyQuaternion(orientacionCamara)
          .applyQuaternion(giroRaiz)
          .normalize()
        direccionLuna.lerp(poseLuna, visibilidadLuna).normalize()
      }
      luna.position.copy(tierra.malla.position).addScaledVector(direccionLuna, LUNA.distancia * escala)
      luna.scale.setScalar(radioVisible(1) * LUNA.radio * escala * crecer)
      luna.visible = visibilidadLuna > 0.002
      materialLuna.uniforms.uSol.value.copy(posicionSol)
      materialLuna.uniforms.uAparicion.value = 1
      materialLuna.uniforms.uTiempo.value = segundos
      // Aparece creciendo (en caricatura no se funde: se infla) y posa algo más grande de lo que
      // tocaría, para que su cara se lea.
      luna.scale.multiplyScalar(Math.min(1, visibilidadLuna * 1.2) * (1 + LUNA.aumentoPose * visibilidadLuna))
    }

    if (saturno) {
      anillos.position.copy(saturno.malla.position)
      anillos.quaternion.copy(saturno.inclinacion).multiply(tumbarAnillo)
      anillos.scale.setScalar(saturno.malla.scale.x)
      anillos.updateWorldMatrix(true, false)
      saturno.malla.getWorldPosition(materialAnillos.uniforms.uCentroPlaneta.value)
      materialAnillos.uniforms.uRadioPlaneta.value = saturno.malla.scale.x
      materialAnillos.uniforms.uSol.value.copy(posicionSol)
      // Reducidos a unos píxeles, sus bandas y su tinta serían una mancha: se quitan antes que el planeta.
      materialAnillos.uniforms.uAparicion.value = 1
      anillos.visible = lejanos > 0.3
    }

  }

  return {
    raiz,
    tierra: tierra?.malla ?? null,
    actualizar,
    cargarMapasTierra,
    liberar: () => {
      liberables.forEach((recurso) => recurso.dispose())
      mapasTierra?.liberar()
    },
  }
}

export function SistemaSolar({
  aparicion,
  segundosPorAnio = 40,
  fecha,
  quieto = false,
  escalaPlanetas,
  ritmo,
  guias,
  luna,
  tierra,
  lejanos,
}: SistemaSolarProps) {
  const sistema = useMemo(() => crearSistema(fecha ?? new Date()), [fecha])
  const relojes = useRef({ orbitas: 0, giros: 0, segundos: 0 })
  const posicionCamara = useRef(new THREE.Vector3())
  const orientacionCamara = useRef(new THREE.Quaternion())

  useEffect(() => () => sistema.liberar(), [sistema])

  // Los mapas de la Tierra se pintan poco después de montar, fuera del primer fotograma.
  useEffect(() => {
    const espera = window.setTimeout(() => sistema.cargarMapasTierra(), 1500)
    return () => window.clearTimeout(espera)
  }, [sistema])

  useEffect(() => {
    if (tierra) tierra.current = sistema.tierra
  }, [sistema, tierra])

  useEffect(() => () => void (SOL_EN_ESCENA.visible = 0), [])

  useFrame(({ gl, clock, camera }, delta) => {
    const valor = aparicion?.current ?? 1
    sistema.raiz.visible = valor > 0.002
    if (!sistema.raiz.visible) {
      SOL_EN_ESCENA.visible = 0
      return
    }
    // Los relojes sólo corren mientras se ve: al aparecer, los planetas están donde están hoy. Con
    // el ritmo bajo (al acercarse a la Tierra) las órbitas casi se detienen y los giros van a un
    // tercio: la Tierra sigue rotando a la vista.
    if (!quieto) {
      const paso = Math.min(delta, 0.25)
      const factor = ritmo?.current ?? 1
      relojes.current.orbitas += paso * factor
      relojes.current.giros += paso * Math.max(factor, 0.35)
      relojes.current.segundos += paso
    }
    sistema.actualizar({
      anios: relojes.current.orbitas / segundosPorAnio,
      segundos: relojes.current.segundos,
      segundosGiro: relojes.current.giros,
      pulsaciones: pulsaciones(clock.getElapsedTime()),
      aparicion: valor,
      altoPixeles: gl.domElement.height,
      camara: camera.getWorldPosition(posicionCamara.current),
      orientacionCamara: camera.getWorldQuaternion(orientacionCamara.current),
      tanMitadFov: Math.tan(THREE.MathUtils.degToRad((camera instanceof THREE.PerspectiveCamera ? camera.fov : 45) / 2)),
      escala: escalaPlanetas?.current ?? 1,
      guias: guias?.current ?? 1,
      luna: luna?.current ?? 1,
      lejanos: lejanos?.current ?? 1,
    })
  })

  return <primitive object={sistema.raiz} />
}
