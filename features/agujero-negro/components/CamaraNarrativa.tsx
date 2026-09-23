'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { obtenerProgreso } from '@/features/narrativa/store/progresoScrollStore'
import { VIAJE } from '../constantes/viajeScroll'
import { DISTANCIA_LIBRE, VISTAS_CAMARA, type VistaCamara } from '../constantes/vistasCamara'
import { useArrastreOrbital } from '../hooks/useArrastreOrbital'
import { useSeguirCursor } from '../hooks/useSeguirCursor'
import { ajuste, consumirZoomPendiente, obtenerVersionVista, obtenerVista } from '../store/vistaCamaraStore'
import { interpolarFotograma } from '../utils/fotogramasCamara'

const POLAR_MINIMO = 0.08
const POLAR_MAXIMO = Math.PI - 0.08
const VELOCIDAD_AUTOGIRO = 0.018
// Tope amplio: la suavización es exponencial (estable con pasos grandes), solo evita
// saltos tras volver de una pestaña en segundo plano.
const PASO_MAXIMO = 0.25
// El azimut sigue al scroll con prontitud; la elevación, la distancia y el encuadre se mueven con
// una constante más lenta (~0.6 s) para que cambiar de vista sea un travelling y no un corte.
const RITMO_AZIMUT = 2.8
const RITMO_VISTA = 1.6
/**
 * Seguimiento del cursor: la cámara orbita muy ligeramente siguiendo al ratón, como un arrastre
 * suave desde el centro hasta donde está el cursor (mismo sentido que arrastrar: el ratón abajo
 * eleva la cámara sobre el disco, el ratón a la derecha la gira). Amplitudes máximas en
 * radianes (7° de azimut, 5° de elevación) y un seguimiento lento (~0.7 s).
 */
const ORBITA_CURSOR = { azimut: 0.12, polar: 0.09 } as const
const RITMO_CURSOR = 1.5

/** Estado completo de cámara: recorrido de scroll + colocación en pantalla de la vista. */
interface EstadoCompleto {
  azimut: number
  polar: number
  distancia: number
  fov: number
  inclinacion: number
  encuadreX: number
  encuadreY: number
}

const limitar = (valor: number, minimo: number, maximo: number): number =>
  Math.min(maximo, Math.max(minimo, valor))

const suavizar = (borde0: number, borde1: number, x: number): number => {
  const t = limitar((x - borde0) / (borde1 - borde0), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Puntos de paso de la caída: fracción del tramo de caída → distancia al centro (la primera es la
 * del encuadre). El ritmo se reparte por lo que se ve, no por la distancia: la cámara en caída
 * libre ve la sombra crecer cada vez más despacio (la aberración la encoge: 13° de radio a 8
 * unidades, 25° a 3, 42.6° al cruzar el horizonte), así que el tramo entre 8 y 1.2 unidades, donde
 * lo que rodea la sombra se aprieta en un anillo de luz cada vez más blanco, recibe la mitad del
 * scroll; tras el horizonte la vista de frente se apaga enseguida y ese tramo se acorta.
 */
const PASOS_CAIDA: readonly { readonly fraccion: number; readonly distancia: number }[] = [
  { fraccion: 0.3, distancia: 8 },
  { fraccion: 0.55, distancia: 3 },
  { fraccion: 0.8, distancia: 1.2 },
  { fraccion: 0.92, distancia: 0.7 },
  { fraccion: 1, distancia: VIAJE.distanciaInterior },
]

/**
 * Campo de visión de la zambullida: se abre mientras la sombra crece (de 6 a 1.5 unidades) para
 * que el anillo de luz que la rodea siga en pantalla hasta cruzar el horizonte, y vuelve al del
 * encuadre ya dentro, con la vista de frente a oscuras (de 0.65 a 0.45), antes de que aparezca la
 * boca del agujero de gusano.
 */
const FOV_ZAMBULLIDA = 62

/**
 * Interpolación cúbica monótona (Fritsch-Carlson) con pendiente nula en los extremos: la
 * distancia no se pasa de ningún punto de paso ni se detiene en los intermedios.
 */
const interpolarMonotono = (x: number, xs: readonly number[], ys: readonly number[]): number => {
  const n = xs.length
  if (x <= xs[0]) return ys[0]
  if (x >= xs[n - 1]) return ys[n - 1]
  const pendientes = xs.map((_, i) => {
    if (i === 0 || i === n - 1) return 0
    const antes = (ys[i] - ys[i - 1]) / (xs[i] - xs[i - 1])
    const despues = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i])
    if (antes * despues <= 0) return 0
    return (2 * antes * despues) / (antes + despues)
  })
  let i = 0
  while (x > xs[i + 1]) i += 1
  const h = xs[i + 1] - xs[i]
  const t = (x - xs[i]) / h
  const t2 = t * t
  const t3 = t2 * t
  return (
    (2 * t3 - 3 * t2 + 1) * ys[i] +
    (t3 - 2 * t2 + t) * h * pendientes[i] +
    (-2 * t3 + 3 * t2) * ys[i + 1] +
    (t3 - t2) * h * pendientes[i + 1]
  )
}

/**
 * Zoom ligado al scroll (reparto en `constantes/viajeScroll.ts`): la historia empieza con el
 * agujero muy lejos y la cámara se acerca con interpolación logarítmica (el tamaño aparente
 * crece a ritmo constante) hasta la distancia calibrada del encuadre. Desde ahí empieza la
 * CAÍDA libre (ver `utils/observadorCaida.ts`): la cámara sigue hacia el agujero por encima del
 * disco y cruza el horizonte sin que pase nada en ese instante, como en la realidad; dentro, la
 * luz de fuera se retira hacia los bordes, empieza el viaje por el túnel (`TunelAgujeroGusano`)
 * y al final aparece el anillo de papel (`EscenaAnilloFinal`). Una distancia fijada en la URL
 * (`?distancia=`) anula el recorrido.
 */
const distanciaConScroll = (distanciaFotograma: number, progreso: number): number => {
  const fijada = ajuste('distancia', Number.NaN)
  if (Number.isFinite(fijada)) return fijada
  const lnEncuadre = Math.log(distanciaFotograma)
  if (progreso <= VIAJE.acercamientoFin) {
    const acercamiento = suavizar(0, VIAJE.acercamientoFin, progreso)
    const lnInicio = Math.log(VIAJE.distanciaInicial)
    return Math.exp(lnInicio + (lnEncuadre - lnInicio) * acercamiento)
  }
  const fraccion = limitar((progreso - VIAJE.acercamientoFin) / (VIAJE.caidaFin - VIAJE.acercamientoFin), 0, 1)
  const fracciones = [0, ...PASOS_CAIDA.map((paso) => paso.fraccion)]
  const logaritmos = [lnEncuadre, ...PASOS_CAIDA.map((paso) => Math.log(Math.min(paso.distancia, distanciaFotograma)))]
  return Math.exp(interpolarMonotono(fraccion, fracciones, logaritmos))
}

/** Campo de visión en la caída según la distancia al centro (ver FOV_ZAMBULLIDA). */
const fovConInmersion = (fovFotograma: number, distancia: number, progreso: number): number => {
  if (progreso <= VIAJE.acercamientoFin) return fovFotograma
  const apertura = suavizar(Math.log(6), Math.log(1.5), Math.log(Math.max(distancia, 1e-3)))
  const cierre = suavizar(Math.log(0.65), Math.log(0.45), Math.log(Math.max(distancia, 1e-3)))
  return fovFotograma + (FOV_ZAMBULLIDA - fovFotograma) * apertura * (1 - cierre)
}

/**
 * Elevación durante la caída: si el encuadre está casi en el plano del gas (canto, Ring, Below…),
 * la cámara se aleja del plano hasta `elevacionMinima` por el lado en que esté, para pasar por
 * encima (o por debajo) del disco y no atravesar la lámina de gas, que lavaría la imagen.
 */
const polarConInmersion = (polarFotograma: number, progreso: number): number => {
  // La elevación se gana en la primera mitad de la caída, antes de llegar al gas.
  const caida = suavizar(VIAJE.acercamientoFin, VIAJE.acercamientoFin + 0.55 * (VIAJE.caidaFin - VIAJE.acercamientoFin), progreso)
  if (caida <= 0) return polarFotograma
  const lado = polarFotograma <= Math.PI / 2 ? -1 : 1
  const limite = Math.PI / 2 + lado * VIAJE.elevacionMinima
  const objetivo = lado < 0 ? Math.min(polarFotograma, limite) : Math.max(polarFotograma, limite)
  return polarFotograma + (objetivo - polarFotograma) * caida
}

const objetivoDeVista = (vista: VistaCamara, progreso: number): EstadoCompleto => {
  const fotograma = interpolarFotograma(progreso, vista.fotogramas)
  // La caída parte de la distancia del encuadre al terminar el acercamiento (la misma con la que
  // `utils/observadorCaida.ts` suelta al observador), no de la del fotograma actual.
  const distanciaEncuadre =
    progreso > VIAJE.acercamientoFin
      ? interpolarFotograma(VIAJE.acercamientoFin, vista.fotogramas).distancia
      : fotograma.distancia
  const distancia = distanciaConScroll(distanciaEncuadre, progreso)
  return {
    azimut: fotograma.azimut,
    polar: polarConInmersion(ajuste('polar', fotograma.polar), progreso),
    distancia,
    fov: ajuste('fov', fovConInmersion(fotograma.fov, distancia, progreso)),
    inclinacion: ajuste('inclinacion', vista.inclinacion),
    encuadreX: ajuste('encuadreX', vista.encuadre.x),
    encuadreY: ajuste('encuadreY', vista.encuadre.y),
  }
}

export function CamaraNarrativa() {
  const { camera, gl } = useThree()
  const { estado: arrastre, actualizar: actualizarArrastre, sumarZoom, volverAlEncuadre } = useArrastreOrbital(
    gl.domElement,
  )
  const cursor = useSeguirCursor()
  const orbitaCursor = useRef({ azimut: 0, polar: 0 })
  const estadoActual = useRef<EstadoCompleto>(objetivoDeVista(VISTAS_CAMARA[obtenerVista()], 0))
  const versionVista = useRef(obtenerVersionVista())
  const giroAcumulado = useRef(0)
  const primerFotograma = useRef(true)
  const [movimientoReducido, setMovimientoReducido] = useState(false)

  useEffect(() => {
    const consulta = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sincronizar = (): void => setMovimientoReducido(consulta.matches)
    sincronizar()
    consulta.addEventListener('change', sincronizar)
    return () => consulta.removeEventListener('change', sincronizar)
  }, [])

  useFrame((_, delta) => {
    const paso = Math.min(delta, PASO_MAXIMO)
    const objetivo = objetivoDeVista(VISTAS_CAMARA[obtenerVista()], obtenerProgreso())
    const actual = estadoActual.current
    const kAzimut = 1 - Math.exp(-paso * RITMO_AZIMUT)
    const kVista = 1 - Math.exp(-paso * RITMO_VISTA)

    // Elegir un encuadre (aunque sea el activo) devuelve la cámara a él desde el modo libre.
    const version = obtenerVersionVista()
    if (version !== versionVista.current) {
      versionVista.current = version
      volverAlEncuadre()
    }
    sumarZoom(consumirZoomPendiente())

    // Primer fotograma: la cámara se coloca directamente donde toca (progreso inicial, vista de
    // la URL), sin un travelling desde el estado por defecto.
    if (primerFotograma.current) {
      primerFotograma.current = false
      Object.assign(actual, objetivo)
    }

    actual.azimut += (objetivo.azimut - actual.azimut) * kAzimut
    actual.polar += (objetivo.polar - actual.polar) * kVista
    actual.distancia += (objetivo.distancia - actual.distancia) * kVista
    actual.fov += (objetivo.fov - actual.fov) * kVista
    actual.inclinacion += (objetivo.inclinacion - actual.inclinacion) * kVista
    actual.encuadreX += (objetivo.encuadreX - actual.encuadreX) * kVista
    actual.encuadreY += (objetivo.encuadreY - actual.encuadreY) * kVista

    actualizarArrastre(paso)
    if (!movimientoReducido) giroAcumulado.current += paso * VELOCIDAD_AUTOGIRO

    // La cámara orbita ligeramente siguiendo al cursor (ver ORBITA_CURSOR), con retraso; vuelve
    // al ángulo del encuadre cuando el ratón sale de la ventana y se queda quieta mientras se
    // arrastra para orbitar de verdad.
    const puntero = cursor.current
    if (!arrastre.current.arrastrando) {
      const seguir = puntero.activo && !movimientoReducido
      const objetivoAzimut = seguir ? -puntero.x * ORBITA_CURSOR.azimut : 0
      const objetivoPolar = seguir ? puntero.y * ORBITA_CURSOR.polar : 0
      const kCursor = 1 - Math.exp(-paso * RITMO_CURSOR)
      orbitaCursor.current.azimut += (objetivoAzimut - orbitaCursor.current.azimut) * kCursor
      orbitaCursor.current.polar += (objetivoPolar - orbitaCursor.current.polar) * kCursor
    }

    const azimut = actual.azimut + arrastre.current.azimut + giroAcumulado.current + orbitaCursor.current.azimut
    const polar = limitar(
      actual.polar + arrastre.current.polar + orbitaCursor.current.polar,
      POLAR_MINIMO,
      POLAR_MAXIMO,
    )
    // El zoom libre multiplica la distancia del encuadre y se acota: ni dentro del gas ni perdido.
    const distancia = limitar(
      actual.distancia * Math.exp(-arrastre.current.zoom),
      Math.min(DISTANCIA_LIBRE.minima, actual.distancia),
      DISTANCIA_LIBRE.maxima,
    )
    const seno = Math.sin(polar)

    camera.position.set(
      distancia * seno * Math.sin(azimut),
      distancia * Math.cos(polar),
      distancia * seno * Math.cos(azimut),
    )
    camera.up.set(0, 1, 0)
    camera.lookAt(0, 0, 0)
    // Roll negativo: la cámara gira en sentido horario y el disco asciende hacia la derecha.
    camera.rotateZ(-actual.inclinacion)

    if (camera instanceof THREE.PerspectiveCamera) {
      if (Math.abs(camera.fov - actual.fov) > 0.01) {
        camera.fov = actual.fov
        camera.updateProjectionMatrix()
      }
      // Encuadre descentrado: tras el roll, los ejes locales coinciden con los de pantalla,
      // así que un giro pequeño en yaw/pitch desplaza el agujero a la posición de la referencia.
      const tanMitadFov = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
      camera.rotateY(Math.atan(actual.encuadreX * tanMitadFov * camera.aspect))
      camera.rotateX(-Math.atan(actual.encuadreY * tanMitadFov))
    }
  })

  return null
}
