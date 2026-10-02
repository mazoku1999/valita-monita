'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CARRIL_VH } from '@/features/agujero-negro/constantes/viajeScroll'
import { EJE_GUSANO } from '@/features/agujero-negro/store/ejeGusano'
import { tocaDibujar } from '@/features/dibujo/store/ritmoDibujo'
import { obtenerProgreso } from '@/features/narrativa/store/progresoScrollStore'
import { CANCION } from '../constantes/cancion'
import { Escenario } from '../escenario/Escenario'
import type { Punto } from '../escenario/pincel'
import { faseCancion } from '../store/cancion'
import { ESCENARIO, FINAL, empezarFinal, letraDelEscenario } from '../store/escenario'
import { tiempoCancion } from '../utils/audio'

/** Lado mayor del lienzo del escenario (px): más no se nota tras la película y cuesta. */
const LADO_MAXIMO = 1920

/** Cuánto puede alejarse del centro de la pantalla el fondo del túnel (fracción), al girar la cámara. */
const DESVIO_CENTRO = 0.12

/**
 * Pinta el escenario de la canción (ver `escenario/Escenario.ts`) a 24 dibujos por segundo y lo deja
 * como textura para el pase de dibujo (ver `store/escenario.ts`): mientras suena, las escenas en el
 * portal del fondo del túnel y la letra; al acabar (o al saltarla), el mensaje final, que se cierra
 * al seguir deslizando. Mientras el final tapa la pantalla, la escena 3D no se dibuja.
 */
export function EscenarioCancion() {
  const gl = useThree((estado) => estado.gl)
  const escena = useThree((estado) => estado.scene)
  const escenario = useMemo(() => new Escenario(), [])
  const textura = useMemo(() => {
    const t = new THREE.CanvasTexture(escenario.lienzo)
    // El lienzo ya está en sRGB, como el dibujo sobre el que va.
    t.colorSpace = THREE.NoColorSpace
    t.minFilter = THREE.LinearFilter
    t.magFilter = THREE.LinearFilter
    t.generateMipmaps = false
    return t
  }, [escenario])
  const tamano = useMemo(() => new THREE.Vector2(), [])
  const auxiliar = useMemo(() => new THREE.Vector3(), [])
  const ocultaLaEscena = useRef(false)

  useEffect(() => {
    ESCENARIO.textura = textura
    escenario.cargarLetra()
    return () => {
      ESCENARIO.textura = null
      ESCENARIO.opacidad = 0
      ESCENARIO.cubre = false
      if (ocultaLaEscena.current) escena.visible = true
      ocultaLaEscena.current = false
      textura.dispose()
    }
  }, [escenario, textura, escena])

  useFrame(({ camera }) => {
    const lineas = letraDelEscenario()
    const fase = faseCancion()
    const suena = fase === 'sonando' && lineas !== null && lineas.length > 0
    const t = tiempoCancion()
    // Al acabar la canción, el final (si se salta, lo empieza `CancionDelAgujero`).
    if (suena && FINAL.inicio < 0 && t >= escenario.inicioDelFinal(lineas)) empezarFinal(CANCION.vh.suelta)
    const final =
      FINAL.inicio >= 0
        ? escenario.estadoFinal(performance.now() / 1000 - FINAL.inicio, obtenerProgreso() * CARRIL_VH - FINAL.vh, fase !== 'sonando')
        : null
    ESCENARIO.opacidad = suena || final ? 1 : 0
    ESCENARIO.cubre = escenario.finalTapa(final)
    if (ESCENARIO.cubre !== ocultaLaEscena.current) {
      escena.visible = !ESCENARIO.cubre
      ocultaLaEscena.current = ESCENARIO.cubre
    }
    if (ESCENARIO.opacidad <= 0 || !tocaDibujar()) return
    gl.getDrawingBufferSize(tamano)
    const escala = Math.min(1, LADO_MAXIMO / Math.max(tamano.x, tamano.y, 1))
    const W = Math.max(2, Math.round(tamano.x * escala))
    const H = Math.max(2, Math.round(tamano.y * escala))
    // Con otro tamaño, la textura se rehace (su memoria en la GPU es de tamaño fijo).
    if (escenario.dimensionar(W, H)) textura.dispose()
    // El fondo del túnel en pantalla: donde va el eje del agujero de gusano (que sigue a la cámara
    // con retraso), cerca del centro.
    const fondo = auxiliar.copy(camera.position).add(EJE_GUSANO).project(camera)
    const centro: Punto =
      fondo.z < 1
        ? [
            W * (0.5 + Math.max(-DESVIO_CENTRO, Math.min(DESVIO_CENTRO, fondo.x * 0.5))),
            H * (0.5 + Math.max(-DESVIO_CENTRO, Math.min(DESVIO_CENTRO, -fondo.y * 0.5))),
          ]
        : [W / 2, H / 2]
    escenario.dibujar({ lineas: suena ? lineas : null, t: suena ? t : null, centro, final })
    textura.needsUpdate = true
  })

  return null
}
