'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { obtenerProgresoSuave } from '@/features/narrativa/store/progresoScrollStore'
import { SistemaSolar } from '@/features/sistema-solar/components/SistemaSolar'
import { direccionEcliptica } from '@/features/sistema-solar/datos/planetas'
import { NUBE_CORAZON, RADIO_TIERRA_KM } from '@/features/cochabamba/constantes/destino'
import { RECORTE_ENTRADA } from '@/features/cochabamba/store/valle'
import { CARRIL_VH, VIAJE } from '../constantes/viajeScroll'
import { ROTULOS } from '@/features/dibujo/store/rotulos'
import { MIRADA_ESPACIO, avanzarMirada } from '../store/miradaEspacio'
import { interpolarMonotono } from '../utils/interpolarMonotono'

/**
 * Llegada a casa: al salir por la boca del agujero de gusano, delante está nuestro sistema solar,
 * visto desde muy lejos (el Sol es una estrella brillante y las órbitas un óvalo diminuto); la
 * cámara se acerca con el scroll hasta verlo entero, rodeándolo despacio y mirándolo cada vez más
 * desde arriba, y al final busca la Tierra y se acerca a ella hasta que llena media pantalla,
 * iluminada de lado por el Sol, con la Luna cerca, mientras el tiempo se frena.
 *
 * Es el movimiento de una cámara real: los tamaños sólo cambian con la distancia. El viaje a la
 * Tierra sale de donde estaba la cámara con el sistema entero a la vista y va en línea recta: gira
 * sólo lo justo para centrar la Tierra (unos grados) y avanza hacia ella. Antes se orientaba hacia
 * un punto de vista fijo de la Tierra y la vista se iba hacia arriba: no respetaba de dónde venía.
 * Al llegar, la Tierra gira hasta que en Cochabamba amanece y la cámara planea sobre ella hasta
 * quedar encima de Bolivia; baja entonces derecha hacia la nube con forma de corazón que flota
 * sobre Cochabamba (nubes de verdad, en el espacio: ver `shaders/nubesBolas.ts`) y entra en ella;
 * en la niebla, el valle toma el relevo y la cámara sale por la base de la nube.
 *
 * Va dentro del marco del agujero de gusano (`TunelAgujeroGusano`), que sigue a la cámara con
 * retraso: el sistema no se mueve respecto al cielo del otro lado (la Vía Láctea que se ve al
 * salir). "Mover la cámara" es colocar el sistema: el punto al que se mira (el Sol y luego la
 * Tierra) queda en el eje del marco (−Z) a la distancia de la cámara, y el sistema se gira para
 * que la cámara lo vea desde la dirección del recorrido.
 */
const ENCUADRE = {
  /** Radio que tiene que caber en pantalla: la órbita de Neptuno (41.5 u) con algo de margen. */
  radio: 47,
  /** Fracción de la pantalla que ocupa ese radio al verse el sistema entero. */
  ocupacion: 0.9,
  /** Distancia mínima al Sol con el sistema entero (en pantallas anchas cabe de sobra). */
  distanciaMinima: 85,
  /**
   * El recorrido alrededor del sistema, en vh del carril: al aparecer (a 4 veces la distancia con
   * el sistema entero, casi de canto), con el sistema entero a la vista y al terminar la
   * panorámica. Es un solo movimiento continuo (interpolación monótona: sin pararse en medio);
   * la longitud eclíptica ronda los 80–100°, donde el polo de Saturno (79.5°, 62°) mira a la
   * cámara y sus anillos se ven abiertos.
   */
  recorrido: {
    vh: [740, 960, 1040],
    azimut: [55, 95, 104],
    elevacion: [14, 30, 33],
    alejamiento: [4, 1, 0.95],
  },
} as const
const RECORRIDO_LOG_ALEJAMIENTO = ENCUADRE.recorrido.alejamiento.map(Math.log)

/**
 * Rótulos (vh del carril): los nombres de los planetas aparecen cuando el sistema está casi entero
 * y se van al emprender el viaje; la Tierra (su nombre y el anillo con el corazón) sigue marcada
 * hasta el planeo, y el pase la retira cuando ya es grande en pantalla.
 */
const ROTULOS_VH = { entrada: [890, 950], salidaNombres: [1045, 1085], salidaDestino: [1170, 1240] } as const

/** Al terminar el avance, el radio de la Tierra ocupa este tanto de media pantalla. */
const OCUPACION_TIERRA = 0.72

/**
 * Tramos del viaje a la Tierra (fracciones de su parte del scroll): el giro que la centra, el
 * avance, el ajuste del giro de la Tierra para que en Cochabamba amanezca y el tramo en el que la
 * cámara rodea la Tierra hacia su lado iluminado (ver LLEGADA).
 */
const VIAJE_TIERRA = { centrar: [0, 0.35], avance: [0.1, 1], alineacion: [0.35, 0.9], rodear: [0.15, 0.95] } as const

/**
 * La llegada a la Tierra, siempre bonita y sin rozar el Sol: los planetas se mueven con el reloj,
 * así que la Tierra puede estar en cualquier punto de su órbita al emprender el viaje. Visto desde
 * la Tierra, el ángulo entre el Sol y la cámara (la fase) tiene que quedar entre estos límites: con
 * más, se llegaba por el lado de noche; con menos, el camino pasaba junto al Sol. Si al salir está
 * fuera, la cámara rodea la Tierra mientras se acerca (en el plano que forman el Sol y la cámara)
 * hasta ese límite: sale hacia donde estaba y llega con la Tierra en cuarto creciente o casi llena.
 */
const LLEGADA = { faseMinima: 45, faseMaxima: 75 } as const

/** Ritmo del reloj de las órbitas: normal al llegar, en calma en la panorámica, casi quieto en el viaje. */
const RITMO_ORBITAS = { panoramica: 0.35, viaje: 0.03 } as const

/**
 * Entrada en la Tierra: cuánto mira la cámara por delante de su camino mientras planea y el plano
 * cercano, en fracción de la distancia a la nube más cercana (la cima de la nube del corazón).
 */
const ENTRADA = { adelanto: 0.3, cerca: 0.2 } as const

/**
 * La bajada hacia Cochabamba: altura sobre el suelo (km) en cada vh del carril, interpolada en
 * escala logarítmica (el suelo crece a ritmo parejo). Empieza donde acaba el acercamiento (la
 * Tierra a media pantalla); al terminar el planeo está a unos 1600 km (se ve Bolivia entera, con los
 * Andes y el Titicaca) y baja derecha hasta la nube del corazón (su cima a 12 km) y dentro de ella,
 * adonde llega sin frenar.
 */
const BAJADA_KM: readonly (readonly [number, number])[] = [
  [1395, 1600],
  [1414, 330],
  [1427, 75],
  [1437, 20],
  [1445, 6.5],
]
const BAJADA_VH = [1240, ...BAJADA_KM.map(([vh]) => vh)]
/** Tramo (vh) en el que la cámara pasa de tener el norte arriba a tener el noroeste. */
const GIRO_NOROESTE = [1414, 1436] as const
const BAJADA_LOG_KM = BAJADA_KM.map(([, km]) => Math.log(km))

/**
 * La mirada del usuario en el espacio (ver `store/miradaEspacio.ts`): arrastrando orbita alrededor
 * de lo que se mira (el Sol o la Tierra) y con el zoom se acerca o se aleja, dentro de unos
 * límites; el cursor añade un leve paralaje. Todo vuelve al camino del viaje a medida que se sigue
 * con el scroll (o con un doble clic) y se apaga durante la bajada hacia Cochabamba, que es un
 * plano medido.
 */
const MIRADA = {
  /** Elevación máxima de la cámara sobre el plano de lo que se mira (rad): nunca en el polo. */
  elevacionMaxima: 1.35,
  zoom: { minimo: -1.1, maximo: 1.1 },
  /** Paralaje del cursor (rad). */
  cursor: { azimut: 0.07, elevacion: 0.05 },
  /** La cámara nunca se acerca a la Tierra a menos de este tanto de su radio. */
  distanciaTierra: 1.35,
} as const

const suavizar = (borde0: number, borde1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - borde0) / (borde1 - borde0)))
  return t * t * (3 - 2 * t)
}

/** Interpolación esférica entre dos direcciones unitarias. */
const interpolarDireccion = (a: THREE.Vector3, b: THREE.Vector3, t: number, destino: THREE.Vector3): THREE.Vector3 => {
  const coseno = Math.min(1, Math.max(-1, a.dot(b)))
  const angulo = Math.acos(coseno)
  if (angulo < 1e-4) return destino.copy(b)
  // Casi opuestas: el arco pasa por una perpendicular cualquiera (el norte, o el eje X si no vale).
  if (angulo > Math.PI - 1e-3) {
    const eje = Math.abs(a.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
    const perpendicular = eje.addScaledVector(a, -eje.dot(a)).normalize()
    const giro = t * angulo
    return destino.copy(a).multiplyScalar(Math.cos(giro)).addScaledVector(perpendicular, Math.sin(giro)).normalize()
  }
  const seno = Math.sin(angulo)
  const pesoA = Math.sin((1 - t) * angulo) / seno
  const pesoB = Math.sin(t * angulo) / seno
  return destino.set(a.x * pesoA + b.x * pesoB, a.y * pesoA + b.y * pesoB, a.z * pesoA + b.z * pesoB).normalize()
}

/**
 * Dirección de llegada a la Tierra (unitaria, desde la Tierra) a partir de la de salida: la misma
 * si la fase (el ángulo con el Sol, visto desde la Tierra) ya está entre sus límites; si no, girada
 * en el plano del Sol y la cámara hasta el límite más cercano.
 */
const haciaSol = new THREE.Vector3()
const perpendicular = new THREE.Vector3()
const direccionLlegadaA = (salida: THREE.Vector3, tierra: THREE.Vector3, destino: THREE.Vector3): THREE.Vector3 => {
  haciaSol.copy(tierra).multiplyScalar(-1).normalize()
  const coseno = Math.min(1, Math.max(-1, salida.dot(haciaSol)))
  const fase = THREE.MathUtils.radToDeg(Math.acos(coseno))
  const faseDeseada = Math.min(LLEGADA.faseMaxima, Math.max(LLEGADA.faseMinima, fase))
  if (Math.abs(faseDeseada - fase) < 1e-3) return destino.copy(salida)
  perpendicular.copy(salida).addScaledVector(haciaSol, -coseno)
  // Cámara, Tierra y Sol alineados: se gira hacia el norte de la eclíptica.
  if (perpendicular.lengthSq() < 1e-6) perpendicular.set(0, 1, 0).addScaledVector(haciaSol, -haciaSol.y)
  perpendicular.normalize()
  const angulo = THREE.MathUtils.degToRad(faseDeseada)
  return destino.copy(haciaSol).multiplyScalar(Math.cos(angulo)).addScaledVector(perpendicular, Math.sin(angulo)).normalize()
}

export function EscenaSistemaSolar() {
  const colocacion = useRef<THREE.Group>(null)
  const aparicion = useRef(0)
  const ritmo = useRef(1)
  const guias = useRef(1)
  const luna = useRef(0)
  const alineacionTierra = useRef(0)
  const tierra = useRef<THREE.Object3D | null>(null)
  const cochabamba = useRef(new THREE.Vector3(0, 1, 0))
  const noroeste = useRef(new THREE.Vector3(1, 0, 0))
  const norte = useRef(new THREE.Vector3(0, 1, 0))
  const [movimientoReducido, setMovimientoReducido] = useState(false)
  const auxiliares = useRef({
    matriz: new THREE.Matrix4(),
    vista: new THREE.Vector3(),
    vistaSistema: new THREE.Vector3(),
    origenViaje: new THREE.Vector3(),
    haciaCamara: new THREE.Vector3(),
    camaraSistema: new THREE.Vector3(),
    direccionEntrada: new THREE.Vector3(),
    direccionMirada: new THREE.Vector3(),
    direccionLlegada: new THREE.Vector3(),
    direccionViaje: new THREE.Vector3(),
    objetivo: new THREE.Vector3(),
    origen: new THREE.Vector3(),
    arriba: new THREE.Vector3(0, 1, 0),
    arribaCamara: new THREE.Vector3(0, 1, 0),
    derechaMirada: new THREE.Vector3(),
    giroMirada: new THREE.Quaternion(),
    camaraMirada: new THREE.Vector3(),
  })

  useEffect(() => {
    const consulta = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sincronizar = (): void => setMovimientoReducido(consulta.matches)
    sincronizar()
    consulta.addEventListener('change', sincronizar)
    return () => consulta.removeEventListener('change', sincronizar)
  }, [])

  useFrame(({ camera }, delta) => {
    const grupo = colocacion.current
    if (!grupo) return
    // El progreso con inercia: cada golpe de rueda es un deslizamiento, no un salto.
    const progreso = obtenerProgresoSuave()
    RECORTE_ENTRADA.cerca = Number.POSITIVE_INFINITY
    // Tras las nubes, el valle toma el relevo: el sistema desaparece.
    aparicion.current = progreso < VIAJE.nubesPleno ? suavizar(VIAJE.sistemaInicio, VIAJE.sistemaPleno, progreso) : 0
    grupo.visible = aparicion.current > 0.002
    const vh = progreso * CARRIL_VH
    const entradaRotulos = suavizar(ROTULOS_VH.entrada[0], ROTULOS_VH.entrada[1], vh)
    ROTULOS.nombres = grupo.visible ? entradaRotulos * (1 - suavizar(ROTULOS_VH.salidaNombres[0], ROTULOS_VH.salidaNombres[1], vh)) : 0
    ROTULOS.destino = grupo.visible ? entradaRotulos * (1 - suavizar(ROTULOS_VH.salidaDestino[0], ROTULOS_VH.salidaDestino[1], vh)) : 0
    if (!grupo.visible) return

    const {
      matriz,
      vista,
      vistaSistema,
      origenViaje,
      haciaCamara,
      camaraSistema,
      direccionEntrada,
      direccionMirada,
      direccionLlegada,
      direccionViaje,
      objetivo,
      origen,
      arriba,
      arribaCamara,
      derechaMirada,
      giroMirada,
      camaraMirada,
    } = auxiliares.current
    const tramoTierra = Math.min(1, Math.max(0, (progreso - VIAJE.tierraInicio) / (VIAJE.tierraFin - VIAJE.tierraInicio)))
    const tramoPlaneo = Math.min(1, Math.max(0, (progreso - VIAJE.tierraFin) / (VIAJE.planeoFin - VIAJE.tierraFin)))
    // Camino de la Tierra: la cámara la centra y avanza hacia ella; las órbitas se apagan, la Luna
    // aparece, el reloj de las órbitas casi se detiene y la Tierra gira hasta que en Cochabamba
    // amanece.
    const centrar = suavizar(VIAJE_TIERRA.centrar[0], VIAJE_TIERRA.centrar[1], tramoTierra)
    const acercar = suavizar(VIAJE_TIERRA.avance[0], VIAJE_TIERRA.avance[1], tramoTierra)
    // Las órbitas se calman en la panorámica (se leen los nombres) y casi se detienen al emprender
    // el viaje: la Tierra no se mueve mientras la cámara va hacia ella.
    const calma = suavizar(VIAJE.sistemaEntero, VIAJE.panoramicaFin, progreso)
    const ritmoPanoramica = 1 + (RITMO_ORBITAS.panoramica - 1) * calma
    ritmo.current = ritmoPanoramica + (RITMO_ORBITAS.viaje - ritmoPanoramica) * suavizar(0, 0.15, tramoTierra)
    guias.current = 1 - suavizar(0.05, 0.5, tramoTierra)
    luna.current = suavizar(0.35, 0.8, tramoTierra)
    alineacionTierra.current = suavizar(VIAJE_TIERRA.alineacion[0], VIAJE_TIERRA.alineacion[1], tramoTierra)

    const { recorrido } = ENCUADRE
    const elevacion = interpolarMonotono(vh, recorrido.vh, recorrido.elevacion)
    const azimut = interpolarMonotono(vh, recorrido.vh, recorrido.azimut)
    const alejamiento = Math.exp(interpolarMonotono(vh, recorrido.vh, RECORRIDO_LOG_ALEJAMIENTO))

    // Distancia con el sistema entero: la órbita de Neptuno cabe a lo ancho y, vista desde la
    // elevación final, a lo alto (en vertical ocupa radio·sen(elevación)).
    const perspectiva = camera instanceof THREE.PerspectiveCamera ? camera : null
    const mitadFov = THREE.MathUtils.degToRad((perspectiva?.fov ?? 42) / 2)
    const tanVertical = Math.tan(mitadFov)
    const tanHorizontal = tanVertical * (perspectiva?.aspect ?? 16 / 9)
    const senoFinal = Math.sin(THREE.MathUtils.degToRad(recorrido.elevacion[recorrido.elevacion.length - 1]))
    const distanciaSistema = Math.max(
      ENCUADRE.distanciaMinima,
      ENCUADRE.radio / (ENCUADRE.ocupacion * tanHorizontal),
      (ENCUADRE.radio * senoFinal) / (ENCUADRE.ocupacion * tanVertical),
    )
    let distancia = distanciaSistema * alejamiento
    direccionEcliptica(azimut, elevacion, vistaSistema)
    vista.copy(vistaSistema)
    objetivo.set(0, 0, 0)

    const malla = tierra.current
    if (malla && tramoTierra > 0) {
      // En el marco del sistema: la cámara estaba en `origenViaje` mirando al Sol; avanza en línea
      // recta hacia la Tierra (distancia en escala logarítmica: el tamaño aparente crece a ritmo
      // constante) mientras el punto al que mira pasa del Sol a la Tierra.
      origenViaje.copy(vistaSistema).multiplyScalar(distanciaSistema * alejamiento)
      haciaCamara.copy(origenViaje).sub(malla.position)
      const lejos = haciaCamara.length()
      haciaCamara.normalize()
      // La dirección de llegada (desde la Tierra) con la fase dentro de sus límites, y la del viaje:
      // de la de salida a la de llegada mientras se acerca.
      direccionLlegadaA(haciaCamara, malla.position, direccionLlegada)
      interpolarDireccion(haciaCamara, direccionLlegada, suavizar(VIAJE_TIERRA.rodear[0], VIAJE_TIERRA.rodear[1], tramoTierra), direccionViaje)
      const radioTierra = malla.scale.x
      // Al final del avance la Tierra ocupa `OCUPACION_TIERRA` de media pantalla (a lo alto o, en
      // pantallas estrechas, a lo ancho).
      const cerca = radioTierra / Math.sin(OCUPACION_TIERRA * Math.min(mitadFov, Math.atan(tanHorizontal)))
      const recorrido = Math.exp(Math.log(lejos) + (Math.log(cerca) - Math.log(lejos)) * acercar)
      camaraSistema.copy(malla.position).addScaledVector(direccionViaje, recorrido)
      objetivo.copy(malla.position).multiplyScalar(centrar)
      if (tramoPlaneo > 0) {
        // Entrada: la cámara planea sobre la Tierra desde donde llegó hasta la vertical de
        // Cochabamba y pasa de mirar al centro de la Tierra a mirar el suelo; después sigue bajando
        // derecha hacia la nube del corazón y entra en ella. Mientras planea gira hasta tener el
        // norte arriba (Bolivia se ve como en un mapa) y, ya cerca de la nube, el noroeste, como en
        // el valle: el corazón queda derecho.
        const e = suavizar(0, 1, tramoPlaneo)
        interpolarDireccion(direccionLlegada, cochabamba.current, e, direccionEntrada)
        const kmAMundo = radioTierra / RADIO_TIERRA_KM
        // En pantallas estrechas (un móvil en vertical) la bajada va algo más alta, para que Bolivia
        // y la nube del corazón quepan a lo ancho; la entrada en la nube, igual.
        const estrecha = Math.log(Math.max(1, Math.sqrt(16 / 9 / (perspectiva?.aspect ?? 16 / 9))))
        const logAltura = [
          Math.log(cerca - radioTierra),
          ...BAJADA_LOG_KM.map((ln, i) => ln + Math.log(kmAMundo) + (i < BAJADA_LOG_KM.length - 1 ? estrecha : 0)),
        ]
        const altura = Math.exp(interpolarMonotono(progreso * CARRIL_VH, BAJADA_VH, logAltura, true))
        RECORTE_ENTRADA.cerca = ENTRADA.cerca * Math.max(altura - NUBE_CORAZON.cima * kmAMundo, 0.05 * kmAMundo)
        const giroFinal = suavizar(GIRO_NOROESTE[0], GIRO_NOROESTE[1], progreso * CARRIL_VH)
        arribaCamara.copy(norte.current).lerp(noroeste.current, giroFinal).normalize()
        arribaCamara.lerp(arriba, 1 - e).normalize()
        camaraSistema.copy(malla.position).addScaledVector(direccionEntrada, radioTierra + altura)
        interpolarDireccion(direccionEntrada, cochabamba.current, ENTRADA.adelanto * (1 - e), direccionMirada)
        objetivo.copy(malla.position).addScaledVector(direccionMirada, radioTierra * e)
      }
      vista.copy(camaraSistema).sub(objetivo)
      distancia = vista.length()
      vista.normalize()
    }

    // La mirada del usuario: órbita alrededor del objetivo, zoom y paralaje del cursor. Vuelve al
    // camino al seguir con el scroll y no existe en la bajada hacia Cochabamba.
    const mirada = MIRADA_ESPACIO
    const cursorSuave = avanzarMirada(progreso, Math.min(delta, 0.1))
    mirada.zoom = Math.min(MIRADA.zoom.maximo, Math.max(MIRADA.zoom.minimo, mirada.zoom))
    const libre = 1 - suavizar(0, 0.35, tramoPlaneo)
    const arribaMirada = tramoPlaneo > 0 ? arribaCamara : arriba
    if (libre > 0) {
      // Giro alrededor del "arriba" de la vista y elevación alrededor de su derecha, con la
      // elevación total acotada (la vista nunca llega al polo).
      const elevacionActual = Math.asin(Math.min(1, Math.max(-1, vista.dot(arribaMirada))))
      const elevacionDeseada = Math.min(
        MIRADA.elevacionMaxima,
        Math.max(-MIRADA.elevacionMaxima, elevacionActual + (mirada.elevacion - cursorSuave.y * MIRADA.cursor.elevacion) * libre),
      )
      mirada.elevacion = Math.min(Math.max(mirada.elevacion, -MIRADA.elevacionMaxima - elevacionActual), MIRADA.elevacionMaxima - elevacionActual)
      giroMirada.setFromAxisAngle(arribaMirada, (mirada.azimut - cursorSuave.x * MIRADA.cursor.azimut) * libre)
      vista.applyQuaternion(giroMirada)
      derechaMirada.crossVectors(arribaMirada, vista).normalize()
      giroMirada.setFromAxisAngle(derechaMirada, -(elevacionDeseada - elevacionActual))
      vista.applyQuaternion(giroMirada).normalize()
      distancia *= Math.exp(-mirada.zoom * libre)
      // Sin atravesar la Tierra: si el zoom lleva la cámara a ella, se queda a su distancia mínima.
      if (malla) {
        camaraMirada.copy(objetivo).addScaledVector(vista, distancia).sub(malla.position)
        const minima = malla.scale.x * MIRADA.distanciaTierra
        if (camaraMirada.length() < minima) {
          const haciaObjetivo = objetivo.clone().sub(malla.position)
          // Distancia a lo largo de la vista a la que la cámara queda a `minima` del centro.
          const b = haciaObjetivo.dot(vista)
          const c = haciaObjetivo.lengthSq() - minima * minima
          distancia = Math.max(distancia, -b + Math.sqrt(Math.max(b * b - c, 0)))
        }
      }
    } else {
      mirada.azimut = 0
      mirada.elevacion = 0
      mirada.zoom = 0
    }

    // El sistema se gira para que la cámara lo vea desde `vista` con el norte de la eclíptica
    // hacia arriba, y se coloca para que el objetivo quede en el eje, delante, a `distancia`.
    matriz.lookAt(vista, origen, arribaMirada)
    grupo.quaternion.setFromRotationMatrix(matriz).invert()
    grupo.position.copy(objetivo).applyQuaternion(grupo.quaternion).multiplyScalar(-1)
    grupo.position.z -= distancia
  })

  return (
    <group ref={colocacion} visible={false}>
      <SistemaSolar
        aparicion={aparicion}
        quieto={movimientoReducido}
        ritmo={ritmo}
        guias={guias}
        luna={luna}
        tierra={tierra}
        alineacionTierra={alineacionTierra}
        cochabamba={cochabamba}
        noroeste={noroeste}
        norte={norte}
      />
    </group>
  )
}
