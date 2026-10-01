'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { CAMARA_AGUJERO } from '@/features/agujero-negro/constantes/parametrosAgujero'
import { CARRIL_VH, VIAJE } from '@/features/agujero-negro/constantes/viajeScroll'
import { MIRADA_ESPACIO, avanzarMirada } from '@/features/agujero-negro/store/miradaEspacio'
import { interpolarMonotono } from '@/features/agujero-negro/utils/interpolarMonotono'
import { obtenerProgresoSuave } from '@/features/narrativa/store/progresoScrollStore'
import { CAMARA_VALLE, CIUDAD, CORAZON, LAGUNA, RECORTE_VALLE, SOL_MANANA, direccionRumbo, direccionSol } from '../constantes/valle'
import { obtenerTexturaCeldas } from '../utils/campos'
import { CABEZA_FRAG, CABEZA_VERT, HOJA_FRAG, HOJA_VERT, TALLO_FRAG, TALLO_VERT } from '../shaders/flores'
import { VALLE_SUELO_FRAG, VALLE_SUELO_VERT } from '../shaders/suelo'
import { NIEBLA } from '@/features/dibujo/store/niebla'
import { RECORTE_ENTRADA, VALLE_EN_ESCENA } from '../store/valle'
import { CENTRO_CAJITA, COREOGRAFIA } from '../constantes/carta'
import { usePaseo } from '../hooks/usePaseo'
import { CARTA, abrirCajita, empezarLectura, segundosCarta } from '../store/carta'
import { PASEO, RITMO_PASEO, alturaPaseo, avanzarPaseo, reiniciarPaseo } from '../store/paseo'
import { crearQuadInstanciado, generarFlores } from '../utils/flores'
import { SOMBRAS_NUBES, crearTexturaSombras, generarCumulos, nieblaEnNubes } from '../utils/nubesDestino'
import { PISO_VALLE } from '../utils/region'
import { type Coreografia, marcoVistaCielo, poseCoreografia, prepararCoreografia } from '../utils/coreografia'
import { crearTerreno } from '../utils/terreno'
import { Cajita } from './Cajita'
import { type UniformesValle, VidaDelValle } from './VidaDelValle'

/**
 * Recorrido de la cámara por el valle (`CAMARA_VALLE`): la distancia a la pose final se interpola
 * en escala logarítmica (de 3 km a unos centímetros, el acercamiento se ve a ritmo constante) y su
 * dirección con arcos entre las de las poses; el punto al que mira, componente a componente.
 */
const POSES = CAMARA_VALLE.map((pose) => ({
  progreso: pose.vh / CARRIL_VH,
  posicion: new THREE.Vector3(...pose.posicion),
  mira: new THREE.Vector3(...pose.mira),
}))
const FINAL = POSES[POSES.length - 1].posicion
const PROGRESOS = POSES.map((pose) => pose.progreso)
const LOG_DISTANCIAS = POSES.map((pose) => Math.log(Math.max(pose.posicion.distanceTo(FINAL), 0.02)))
const DIRECCIONES = POSES.map((pose, i) =>
  (i < POSES.length - 1 ? pose.posicion.clone().sub(FINAL) : POSES[i - 1].posicion.clone().sub(FINAL)).normalize(),
)
const MIRAS = [0, 1, 2].map((eje) => POSES.map((pose) => pose.mira.getComponent(eje)))

const poseEn = (progreso: number, posicion: THREE.Vector3, mira: THREE.Vector3): void => {
  let i = 0
  while (i < POSES.length - 2 && progreso > PROGRESOS[i + 1]) i += 1
  const t = Math.min(1, Math.max(0, (progreso - PROGRESOS[i]) / (PROGRESOS[i + 1] - PROGRESOS[i])))
  const s = t * t * (3 - 2 * t)
  posicion.copy(DIRECCIONES[i]).lerp(DIRECCIONES[i + 1], s).normalize()
  posicion.multiplyScalar(Math.exp(interpolarMonotono(progreso, PROGRESOS, LOG_DISTANCIAS))).add(FINAL)
  mira.set(
    interpolarMonotono(progreso, PROGRESOS, MIRAS[0]),
    interpolarMonotono(progreso, PROGRESOS, MIRAS[1]),
    interpolarMonotono(progreso, PROGRESOS, MIRAS[2]),
  )
}

const ARRIBA = new THREE.Vector3(0, 1, 0)

/**
 * Mirar alrededor en el valle (ver `store/miradaEspacio.ts`): arrastrando se gira la cabeza como en
 * los juegos, en la bajada hasta unos límites y, paseando, del todo (y arriba o abajo hasta
 * `alzarPaseo` y `bajarPaseo`, rad sobre la horizontal); el cursor inclina la mirada un poco hacia
 * donde está. Sin zoom. Vuelve al camino al seguir con el scroll.
 */
const MIRAR = { giroMaximo: 0.75, alzarMaximo: 0.35, bajarMaximo: 0.3, alzarPaseo: 0.9, bajarPaseo: 1.25, cursor: { giro: 0.05, alzar: 0.035 } } as const

/** Lleva `valor` hacia [minimo, maximo] con el factor k (0..1): al cambiar los límites, sin saltos. */
const acotarSuave = (valor: number, minimo: number, maximo: number, k: number): number =>
  valor < minimo ? valor + (minimo - valor) * k : valor > maximo ? valor + (maximo - valor) * k : valor

/** Las nubes de la llegada (km): las cercanas al valle, para la niebla al atravesarlas. */
const CUMULOS = generarCumulos()
const NUBES_CERCANAS = CUMULOS.filter((bola) => Math.hypot(bola.x, bola.y) < 40)

/**
 * El valle de Cochabamba al final del viaje (ver `constantes/valle.ts`). Va dentro del marco del
 * agujero de gusano, como el sistema solar: "mover la cámara" es colocar el valle para que la
 * cámara lo vea desde la pose del recorrido. Toma el relevo de la Tierra dentro de la nube del
 * corazón (la cámara sale por su base) y mientras se ve la cámara usa planos de recorte de valle
 * (de 30 cm a 60 km).
 */
/** Las tres mallas de las flores: cabezas, tallos y hojas (ver `utils/flores.ts`). */
interface MallasFlores {
  cabezas: THREE.InstancedBufferGeometry
  tallos: THREE.InstancedBufferGeometry
  hojas: THREE.InstancedBufferGeometry
}

const crearMallasFlores = (): MallasFlores => {
  const datos = generarFlores()
  return {
    cabezas: crearQuadInstanciado({ aBase: [datos.cabezaBase, 4], aForma: [datos.cabezaForma, 4], aCara: [datos.cabezaCara, 2] }, datos.cabezas),
    tallos: crearQuadInstanciado({ aBase: [datos.talloBase, 4], aForma: [datos.talloForma, 3] }, datos.cabezas),
    hojas: crearQuadInstanciado({ aBase: [datos.hojaBase, 4], aForma: [datos.hojaForma, 4] }, datos.hojas),
  }
}

export function EscenaCochabamba() {
  const grupo = useRef<THREE.Group>(null)
  const lienzo = useThree((estado) => estado.gl.domElement)
  usePaseo(lienzo)
  const [terreno, setTerreno] = useState<THREE.BufferGeometry | null>(null)
  const [flores, setFlores] = useState<MallasFlores | null>(null)
  const auxiliares = useRef({
    posicion: new THREE.Vector3(),
    mira: new THREE.Vector3(),
    matriz: new THREE.Matrix4(),
    orientacion: new THREE.Quaternion(),
    inversa: new THREE.Quaternion(),
    mundo: new THREE.Quaternion(),
    rotacion: new THREE.Matrix4(),
    /** Cuánto sigue la mirada al cursor (se apaga al posarse: paseando manda la cabeza del paseo). */
    pesoCursor: 1,
    /** La cámara al abrir la cajita (ver `utils/coreografia.ts`), desde el primer fotograma abierta. */
    coreografia: null as Coreografia | null,
    direccionCarta: new THREE.Vector3(),
    rayo: new THREE.Raycaster(),
    puntoToque: new THREE.Vector2(),
    inversaGrupo: new THREE.Matrix4(),
    origenRayo: new THREE.Vector3(),
    direccionRayo: new THREE.Vector3(),
  })
  const mallasFlores = useRef<(THREE.Mesh | null)[]>([])

  const material = useMemo(() => {
    const [ejeX, ejeZ] = direccionRumbo(CORAZON.rumbo)
    return new THREE.ShaderMaterial({
      vertexShader: VALLE_SUELO_VERT,
      fragmentShader: VALLE_SUELO_FRAG,
      uniforms: {
        uSombrasNubes: { value: crearTexturaSombras(CUMULOS) },
        uLadoSombras: { value: SOMBRAS_NUBES.lado },
        uRegion: { value: null },
        uLadoRegion: { value: 2400 },
        uCamara: { value: new THREE.Vector3() },
        uSol: { value: new THREE.Vector3(...direccionSol(SOL_MANANA.rumbo, SOL_MANANA.elevacion)) },
        uCorazon: { value: new THREE.Vector4(CORAZON.escala, ejeX, ejeZ, CORAZON.ribete) },
        uCeldas: { value: obtenerTexturaCeldas() },
        uCiudad: { value: new THREE.Vector3(CIUDAD.centro[0], CIUDAD.centro[1], CIUDAD.radio) },
        uLaguna: { value: new THREE.Vector4(LAGUNA.centro[0], LAGUNA.centro[1], LAGUNA.semiejes[0], LAGUNA.semiejes[1]) },
      },
      side: THREE.DoubleSide,
    })
  }, [])

  // Uniformes de las flores (compartidos por sus tres mallas y por la vida del valle).
  const uniformesFlores = useMemo<UniformesValle>(
    () => ({
      uCamara: { value: new THREE.Vector3() },
      uSol: { value: new THREE.Vector3(...direccionSol(SOL_MANANA.rumbo, SOL_MANANA.elevacion)) },
      uTiempo: { value: 0 },
      uPixelesPorRadian: { value: 800 },
      uEscalaPantalla: { value: 1 },
      // La noche estrellada del final (0..1): las nubes se deshacen y las mariposas se van.
      uNoche: { value: 0 },
    }),
    [],
  )
  // La vista final hacia el cielo, sobre la que el pase compone la noche estrellada.
  useEffect(() => {
    marcoVistaCielo(VALLE_EN_ESCENA.marcoNoche)
  }, [])
  const materialesFlores = useMemo(
    () => ({
      cabezas: new THREE.ShaderMaterial({ vertexShader: CABEZA_VERT, fragmentShader: CABEZA_FRAG, uniforms: uniformesFlores, side: THREE.DoubleSide }),
      tallos: new THREE.ShaderMaterial({ vertexShader: TALLO_VERT, fragmentShader: TALLO_FRAG, uniforms: uniformesFlores, side: THREE.DoubleSide }),
      hojas: new THREE.ShaderMaterial({ vertexShader: HOJA_VERT, fragmentShader: HOJA_FRAG, uniforms: uniformesFlores, side: THREE.DoubleSide }),
    }),
    [uniformesFlores],
  )

  // El relieve (unas decenas de miles de vértices) y las flores (decenas de miles de plantas) se
  // calculan después de cargar la página.
  useEffect(() => {
    const espera = window.setTimeout(() => setTerreno(crearTerreno()), 2500)
    const esperaFlores = window.setTimeout(() => setFlores(crearMallasFlores()), 3500)
    return () => {
      window.clearTimeout(espera)
      window.clearTimeout(esperaFlores)
    }
  }, [])

  useEffect(
    () => () => {
      material.dispose()
      materialesFlores.cabezas.dispose()
      materialesFlores.tallos.dispose()
      materialesFlores.hojas.dispose()
      VALLE_EN_ESCENA.dia = 0
    },
    [material, materialesFlores],
  )
  useEffect(() => () => terreno?.dispose(), [terreno])
  useEffect(
    () => () => {
      flores?.cabezas.dispose()
      flores?.tallos.dispose()
      flores?.hojas.dispose()
    },
    [flores],
  )

  useFrame(({ camera, clock, gl }, delta) => {
    const nodo = grupo.current
    if (!nodo) return
    const progreso = obtenerProgresoSuave()
    const visible = progreso >= VIAJE.valleInicio && terreno !== null
    nodo.visible = visible
    VALLE_EN_ESCENA.dia = visible ? 1 : 0
    if (!visible) {
      NIEBLA.valle = 0
      VALLE_EN_ESCENA.noche = 0
      if (PASEO.activo || PASEO.x !== 0 || PASEO.z !== 0) reiniciarPaseo()
    }

    // Planos de recorte: los del valle mientras se ve; si no, los del viaje por el espacio (con el
    // cercano que pida la bajada hacia la Tierra).
    if (camera instanceof THREE.PerspectiveCamera) {
      const cerca = visible ? RECORTE_VALLE.cerca : Math.min(CAMARA_AGUJERO.cerca, RECORTE_ENTRADA.cerca)
      const lejos = visible ? RECORTE_VALLE.lejos : CAMARA_AGUJERO.lejos
      if (camera.near !== cerca || camera.far !== lejos) {
        camera.near = cerca
        camera.far = lejos
        camera.updateProjectionMatrix()
      }
    }
    if (!visible) return

    const { posicion, mira, matriz, orientacion, inversa, mundo, rotacion } = auxiliares.current
    const paso = Math.min(delta, 0.1)
    poseEn(progreso, posicion, mira)
    // Posada la cámara, se pasea por el corazón con los mandos de un juego (ver `store/paseo.ts`).
    const posado = progreso >= VIAJE.aterrizajeFin - 1e-3
    const cartaAbierta = CARTA.fase !== 'cerrada'
    // Un toque sobre la cajita la abre: el rayo del toque (con la cámara y el valle del fotograma que
    // se vio) contra una esfera alrededor de ella.
    const toque = CARTA.toque
    if (toque) {
      CARTA.toque = null
      const { rayo, puntoToque, inversaGrupo, origenRayo, direccionRayo } = auxiliares.current
      if (posado && !cartaAbierta) {
        rayo.setFromCamera(puntoToque.set(toque.x, toque.y), camera)
        inversaGrupo.copy(nodo.matrixWorld).invert()
        origenRayo.copy(rayo.ray.origin).applyMatrix4(inversaGrupo).sub(direccionRayo.set(CENTRO_CAJITA[0], CENTRO_CAJITA[1], CENTRO_CAJITA[2]))
        direccionRayo.copy(rayo.ray.direction).transformDirection(inversaGrupo)
        const b = origenRayo.dot(direccionRayo)
        const c = origenRayo.lengthSq() - 0.3 * 0.3
        if (b * b - c >= 0 && -b + Math.sqrt(b * b - c) > 0) abrirCajita()
      }
    }
    // Mirar alrededor en la bajada: arrastrando se gira la cabeza como en los juegos (a la derecha,
    // se mira a la derecha; hacia abajo, abajo) hasta unos límites, y el cursor la inclina un poco.
    // Al posarse, lo girado pasa a la cabeza del paseo, que manda desde entonces (el arrastre de la
    // bajada se descarta: si no, cada arrastre giraría dos veces). Posada, un poco de scroll no la
    // devuelve al camino.
    const mirada = MIRADA_ESPACIO
    const cursor = avanzarMirada(posado ? VIAJE.aterrizajeFin : progreso, paso)
    mirada.zoom = 0
    if (posado) {
      if (!PASEO.activo) {
        PASEO.giro += mirada.azimut
        PASEO.cabeceo -= mirada.elevacion
      }
      mirada.azimut = 0
      mirada.elevacion = 0
    } else {
      const kLimite = 1 - Math.exp(-paso * 6)
      mirada.azimut = acotarSuave(mirada.azimut, -MIRAR.giroMaximo, MIRAR.giroMaximo, kLimite)
      mirada.elevacion = acotarSuave(mirada.elevacion, -MIRAR.alzarMaximo, MIRAR.bajarMaximo, kLimite)
    }
    const direccion = mira.sub(posicion)
    const largo = direccion.length()
    direccion.divideScalar(largo)
    const inclinacion = Math.asin(Math.min(1, Math.max(-1, direccion.y)))
    const auxiliar = auxiliares.current
    auxiliar.pesoCursor += ((posado ? 0 : 1) - auxiliar.pesoCursor) * (1 - Math.exp(-paso * 4))
    const cursorGiro = cursor.x * MIRAR.cursor.giro * auxiliar.pesoCursor
    const cursorAlzar = cursor.y * MIRAR.cursor.alzar * auxiliar.pesoCursor
    const horizontal = Math.atan2(direccion.x, direccion.z) + mirada.azimut + PASEO.giro - cursorGiro
    // El paseo: la cámara anda (dentro del corazón) y se pone de pie, mirando algo más abajo. Con la
    // cajita abierta se queda donde estaba (sin mandos).
    if (!cartaAbierta) avanzarPaseo(paso, posado, horizontal, FINAL.x, FINAL.z)
    const dePie = alturaPaseo()
    const bajarDePie = RITMO_PASEO.bajarMirada * dePie
    if (posado) PASEO.cabeceo = Math.min(MIRAR.alzarPaseo - inclinacion + bajarDePie, Math.max(-MIRAR.bajarPaseo - inclinacion + bajarDePie, PASEO.cabeceo))
    const nueva = Math.min(1.45, Math.max(-1.45, inclinacion - mirada.elevacion + PASEO.cabeceo - bajarDePie + cursorAlzar))
    posicion.x += PASEO.x
    posicion.z += PASEO.z
    posicion.y += (RITMO_PASEO.altura - FINAL.y) * dePie
    mira.set(Math.sin(horizontal) * Math.cos(nueva), Math.sin(nueva), Math.cos(horizontal) * Math.cos(nueva)).multiplyScalar(largo).add(posicion)
    // La cajita abierta: la cámara la mira, se alza hacia el cielo y cae la noche (ver
    // `utils/coreografia.ts`); después, la carta.
    let noche = 0
    let floresOcultas = false
    const auxiliar2 = auxiliares.current
    if (cartaAbierta) {
      if (!auxiliar2.coreografia) {
        auxiliar2.coreografia = prepararCoreografia(posicion, auxiliar2.direccionCarta.copy(mira).sub(posicion))
        CARTA.llegada = auxiliar2.coreografia.llegada
      }
      const t = segundosCarta()
      noche = poseCoreografia(auxiliar2.coreografia, t, posicion, auxiliar2.direccionCarta)
      mira.copy(posicion).addScaledVector(auxiliar2.direccionCarta, 50)
      const s = t - auxiliar2.coreografia.llegada
      if (s >= COREOGRAFIA.carta) empezarLectura()
      // Mirando ya al cielo, las flores no se ven: no se dibujan (en un móvil, se nota).
      floresOcultas = s > COREOGRAFIA.inclinarDesde + 3.6
    } else {
      auxiliar2.coreografia = null
    }
    VALLE_EN_ESCENA.noche = noche
    uniformesFlores.uNoche.value = noche
    for (const malla of mallasFlores.current) if (malla) malla.visible = !floresOcultas
    // Dentro de la nube de entrada, niebla (el pase la pinta).
    NIEBLA.valle = nieblaEnNubes(posicion.x / 1000, -posicion.z / 1000, (posicion.y + PISO_VALLE) / 1000, NUBES_CERCANAS)
    matriz.lookAt(posicion, mira, ARRIBA)
    orientacion.setFromRotationMatrix(matriz)
    inversa.copy(orientacion).invert()
    nodo.quaternion.copy(inversa)
    nodo.position.copy(posicion).applyQuaternion(inversa).multiplyScalar(-1)
    ;(material.uniforms.uCamara.value as THREE.Vector3).copy(posicion)
    uniformesFlores.uCamara.value.copy(posicion)
    uniformesFlores.uTiempo.value = clock.getElapsedTime()
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 45
    uniformesFlores.uPixelesPorRadian.value = gl.domElement.height / 2 / Math.tan(THREE.MathUtils.degToRad(fov) / 2)
    uniformesFlores.uEscalaPantalla.value = gl.domElement.height / 720

    // Para el cielo del pase: de las direcciones del mundo a las del valle, y el Sol en el valle.
    nodo.updateWorldMatrix(true, false)
    nodo.getWorldQuaternion(mundo).invert()
    VALLE_EN_ESCENA.rotacion.setFromMatrix4(rotacion.makeRotationFromQuaternion(mundo))
    VALLE_EN_ESCENA.sol.copy(material.uniforms.uSol.value as THREE.Vector3)
  })

  return (
    <group ref={grupo} visible={false}>
      {terreno && <mesh geometry={terreno} material={material} frustumCulled={false} />}
      {flores && (
        <>
          <mesh ref={(m) => void (mallasFlores.current[0] = m)} geometry={flores.tallos} material={materialesFlores.tallos} frustumCulled={false} />
          <mesh ref={(m) => void (mallasFlores.current[1] = m)} geometry={flores.hojas} material={materialesFlores.hojas} frustumCulled={false} />
          <mesh ref={(m) => void (mallasFlores.current[2] = m)} geometry={flores.cabezas} material={materialesFlores.cabezas} frustumCulled={false} />
        </>
      )}
      <Cajita uniformes={uniformesFlores} />
      <VidaDelValle uniformes={uniformesFlores} />
    </group>
  )
}
