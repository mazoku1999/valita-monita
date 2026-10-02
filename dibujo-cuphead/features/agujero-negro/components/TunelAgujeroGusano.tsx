'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { obtenerProgreso } from '@/features/narrativa/store/progresoScrollStore'
import { VIAJE } from '../constantes/viajeScroll'
import { EJE_GUSANO } from '../store/ejeGusano'
import { AGUJERO_GUSANO_CARICATURA_FRAG, AGUJERO_GUSANO_VERT } from '../shaders/agujeroGusanoCaricatura'
import { CIELO_SISTEMA_FRAG, CIELO_SISTEMA_VERT } from '../shaders/cieloSistemaSolar'

/** Recorrido de la cámara por el agujero de gusano (ver el shader: garganta de radio 1 y longitud 3). */
const GUSANO = {
  /** l al empezar (fuera de la boca de este lado) y al terminar (fuera de la boca del otro lado). */
  lInicio: -5.5,
  lFin: 5.5,
  /** Suavizado del avance ligado al scroll (los pasos de la rueda no dan tirones). */
  ritmoAvance: 4,
  /** Balanceo lento de la posición cuando no se hace scroll (amplitud en l y frecuencia en rad/s). */
  balanceo: 0.12,
  balanceoRitmo: 0.4,
  /** Seguimiento de la orientación de la cámara: a corto plazo el eje queda fijo en el mundo (~0.8 s). */
  ritmoGiro: 1.2,
  /**
   * Entrada: la boca aparece ya dentro del horizonte, cuando la luz de fuera ha salido de la
   * pantalla y la vista de frente es negra (la distancia al centro baja de 0.6 a 0.4).
   */
  entradaDesde: 0.6,
  entradaHasta: 0.4,
  /** Giro lento de los cielos alrededor del eje durante el paso (rad/s); al salir se detiene. */
  giroCielo: 0.012,
  /**
   * Cielo del sistema solar en el dibujo animado: más tenue que en el original. El dibujo pone su
   * propio cielo en acuarela y sus estrellas; con toda su luz, la Vía Láctea se volvía una franja
   * que dominaba el cuadro y deformaba el halo del Sol.
   */
  luzCieloSistema: 0.5,
} as const

const limitar = (valor: number, minimo: number, maximo: number): number =>
  Math.min(maximo, Math.max(minimo, valor))

const suavizar = (borde0: number, borde1: number, x: number): number => {
  const t = limitar((x - borde0) / (borde1 - borde0), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Material HDR aditivo (uno + uno) para un cielo de pantalla completa: se suma sobre el negro del
 * interior. Va en la cola de transparentes, que three.js dibuja DESPUÉS de lo opaco, así que tiene
 * que respetar la profundidad (el quad está en el plano lejano): sin ella el cielo se sumaba
 * encima de los planetas (estrellas en el lado de noche de la Tierra y un velo sobre el de día).
 */
const materialAditivo = (
  vertexShader: string,
  fragmentShader: string,
  uniforms: Record<string, THREE.IUniform>,
): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader,
    fragmentShader,
    uniforms,
    side: THREE.DoubleSide,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  })

/**
 * Viaje por el interior del agujero: ya dentro del horizonte la cámara recorre un agujero de gusano
 * trazado por píxel y dibujado como un remolino de dibujo animado
 * (`shaders/agujeroGusanoCaricatura.ts`) durante la fase del túnel (ver `constantes/viajeScroll.ts`):
 * la boca del otro lado es una ventana al cielo rodeada de bandas en espiral que crece hasta
 * rodearnos, las paredes giran en espiral y salen hacia fuera al avanzar, y al salir se abre el
 * cielo del otro lado: el de nuestro sistema solar, que sigue siendo el fondo de la escena siguiente
 * (`EscenaSistemaSolar`, que va como hija de este marco). El eje del agujero de gusano sigue la
 * orientación de la cámara con retraso, de modo que el arrastre y el cursor mueven la vista como si
 * el eje estuviera fijo en el mundo; los hijos comparten ese marco, así que el sistema solar queda
 * fijo respecto a su cielo.
 */
export function TunelAgujeroGusano({ children }: { children?: ReactNode }) {
  const { size } = useThree()
  const ancla = useRef<THREE.Group>(null)
  const [movimientoReducido, setMovimientoReducido] = useState(false)
  const iniciado = useRef(false)
  const tiempo = useRef(0)
  const giroCielo = useRef(0)
  const lSuave = useRef<number>(GUSANO.lInicio)
  const rotacion = useRef(new THREE.Matrix4())
  const inversa = useRef(new THREE.Quaternion())

  const recursos = useMemo(() => {
    const uniformsGusano = {
      uProyInversa: { value: new THREE.Matrix4() },
      uCamaraMundo: { value: new THREE.Matrix4() },
      uMarcoInverso: { value: new THREE.Matrix3() },
      uL: { value: GUSANO.lInicio as number },
      uTiempo: { value: 0 },
      uGiro: { value: 0 },
      uOpacidad: { value: 0 },
      uAnguloPixel: { value: 0.001 },
    }
    const geometriaPantalla = new THREE.PlaneGeometry(2, 2)
    // El remolino sustituye lo que haya detrás (color y marca de caricatura): los píxeles de cielo
    // salen negros con alfa 1 y el pase de dibujo pinta allí su cielo.
    const materialGusano = materialAditivo(AGUJERO_GUSANO_VERT, AGUJERO_GUSANO_CARICATURA_FRAG, uniformsGusano)
    Object.assign(materialGusano, {
      blendSrc: THREE.OneFactor,
      blendDst: THREE.ZeroFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.ZeroFactor,
    })
    const gusano = new THREE.Mesh(geometriaPantalla, materialGusano)
    gusano.frustumCulled = false
    gusano.renderOrder = -5

    // Cielo del sistema solar: comparte cámara, marco y giro con el agujero de gusano (los mismos
    // objetos de uniforme) y lo sustituye al salir por la boca.
    const uniformsCielo = {
      uProyInversa: uniformsGusano.uProyInversa,
      uCamaraMundo: uniformsGusano.uCamaraMundo,
      uMarcoInverso: uniformsGusano.uMarcoInverso,
      uGiro: uniformsGusano.uGiro,
      uAnguloPixel: uniformsGusano.uAnguloPixel,
      uOpacidad: { value: 0 },
    }
    const materialCielo = materialAditivo(CIELO_SISTEMA_VERT, CIELO_SISTEMA_FRAG, uniformsCielo)
    const cielo = new THREE.Mesh(geometriaPantalla, materialCielo)
    cielo.frustumCulled = false
    cielo.renderOrder = -6

    return {
      gusano,
      uniformsGusano,
      cielo,
      uniformsCielo,
      liberar: () => {
        geometriaPantalla.dispose()
        materialGusano.dispose()
        materialCielo.dispose()
      },
    }
  }, [])

  useEffect(() => () => recursos.liberar(), [recursos])

  useEffect(() => {
    const consulta = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sincronizar = (): void => setMovimientoReducido(consulta.matches)
    sincronizar()
    consulta.addEventListener('change', sincronizar)
    return () => consulta.removeEventListener('change', sincronizar)
  }, [])

  useFrame(({ camera }, delta) => {
    const grupo = ancla.current
    if (!grupo) return
    const paso = Math.min(delta, 0.25)
    const progreso = obtenerProgreso()
    const distancia = camera.position.length()

    // El paso aparece ya dentro del horizonte y, tras la salida, su cielo del otro lado se queda
    // como fondo del sistema solar hasta el final.
    const opacidad = suavizar(GUSANO.entradaDesde, GUSANO.entradaHasta, distancia)
    grupo.visible = opacidad > 0.002
    if (!grupo.visible) {
      iniciado.current = false
      return
    }

    // Anclado a la cámara; la orientación del eje la sigue con retraso (paralaje).
    grupo.position.copy(camera.position)
    if (!iniciado.current) {
      grupo.quaternion.copy(camera.quaternion)
      iniciado.current = true
      lSuave.current = GUSANO.lInicio
    } else {
      grupo.quaternion.slerp(camera.quaternion, 1 - Math.exp(-paso * GUSANO.ritmoGiro))
    }
    EJE_GUSANO.set(0, 0, -1).applyQuaternion(grupo.quaternion)

    if (!movimientoReducido) tiempo.current += paso
    // Los cielos giran despacio mientras se atraviesa el paso y se quedan quietos al salir: fuera,
    // el sistema solar y su cielo (la Vía Láctea) no giran uno respecto del otro.
    if (!movimientoReducido && progreso < VIAJE.tunelFin) giroCielo.current += paso * GUSANO.giroCielo
    const fraccion = limitar((progreso - VIAJE.caidaFin) / (VIAJE.tunelFin - VIAJE.caidaFin), 0, 1)
    const lObjetivo = GUSANO.lInicio + (GUSANO.lFin - GUSANO.lInicio) * fraccion
    lSuave.current += (lObjetivo - lSuave.current) * (1 - Math.exp(-paso * GUSANO.ritmoAvance))
    const balanceo = movimientoReducido ? 0 : GUSANO.balanceo * Math.sin(tiempo.current * GUSANO.balanceoRitmo)
    const l = lSuave.current + balanceo

    const u = recursos.uniformsGusano
    camera.updateMatrixWorld()
    u.uProyInversa.value.copy(camera.projectionMatrixInverse)
    u.uCamaraMundo.value.copy(camera.matrixWorld)
    inversa.current.copy(grupo.quaternion).invert()
    rotacion.current.makeRotationFromQuaternion(inversa.current)
    u.uMarcoInverso.value.setFromMatrix4(rotacion.current)
    u.uL.value = l
    u.uTiempo.value = tiempo.current
    u.uGiro.value = giroCielo.current
    // Al salir por la boca, el cielo trazado del otro lado se funde con el del sistema solar (más
    // fino y oscuro, sin la lente del agujero de gusano); después sólo se dibuja éste.
    const cambioCielo = suavizar(VIAJE.cieloSistemaInicio, VIAJE.cieloSistemaPleno, progreso)
    u.uOpacidad.value = opacidad * (1 - cambioCielo)
    recursos.uniformsCielo.uOpacidad.value = opacidad * cambioCielo * GUSANO.luzCieloSistema
    // En el valle de Cochabamba (tras las nubes) el cielo es de día: el del sistema solar se apaga.
    recursos.cielo.visible = opacidad * cambioCielo > 0.002 && progreso < VIAJE.nubesPleno
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 45
    u.uAnguloPixel.value = THREE.MathUtils.degToRad(fov) / Math.max(size.height, 1)
    recursos.gusano.visible = u.uOpacidad.value > 0.002
  })

  return (
    <group ref={ancla} visible={false}>
      <primitive object={recursos.gusano} />
      <primitive object={recursos.cielo} />
      {children}
    </group>
  )
}
