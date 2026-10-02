'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { tocaDibujar } from '@/features/dibujo/store/ritmoDibujo'
import { Escenario } from '../escenario/Escenario'
import { faseCancion } from '../store/cancion'
import { ESCENARIO, letraDelEscenario } from '../store/escenario'
import { tiempoCancion } from '../utils/audio'

/** Lado mayor del lienzo del escenario (px): más no se nota tras la película y cuesta. */
const LADO_MAXIMO = 1920

/**
 * Pinta el escenario de la canción (ver `escenario/Escenario.ts`) mientras suena, a 24 dibujos por
 * segundo, y lo deja como textura para el pase de dibujo (ver `store/escenario.ts`). Mientras tapa
 * la pantalla, la escena 3D no se dibuja (no se vería y es lo que más cuesta, el agujero de gusano
 * trazado por píxel).
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
  const ocultaLaEscena = useRef(false)

  useEffect(() => {
    ESCENARIO.textura = textura
    escenario.cargarLetra()
    return () => {
      ESCENARIO.textura = null
      ESCENARIO.opacidad = 0
      ESCENARIO.iris = 1
      ESCENARIO.cubre = false
      if (ocultaLaEscena.current) escena.visible = true
      ocultaLaEscena.current = false
      textura.dispose()
    }
  }, [escenario, textura, escena])

  useFrame(() => {
    const lineas = letraDelEscenario()
    const estado = faseCancion() === 'sonando' && lineas && lineas.length > 0 ? escenario.estado(lineas, tiempoCancion()) : null
    ESCENARIO.opacidad = estado?.opacidad ?? 0
    ESCENARIO.iris = estado?.iris ?? 1
    ESCENARIO.cubre = estado?.cubre ?? false
    if (ESCENARIO.cubre !== ocultaLaEscena.current) {
      escena.visible = !ESCENARIO.cubre
      ocultaLaEscena.current = ESCENARIO.cubre
    }
    if (!estado || !lineas || estado.opacidad <= 0 || !tocaDibujar()) return
    gl.getDrawingBufferSize(tamano)
    const escala = Math.min(1, LADO_MAXIMO / Math.max(tamano.x, tamano.y, 1))
    // Con otro tamaño, la textura se rehace (su memoria en la GPU es de tamaño fijo).
    if (escenario.dimensionar(Math.max(2, Math.round(tamano.x * escala)), Math.max(2, Math.round(tamano.y * escala)))) textura.dispose()
    escenario.dibujar(lineas, tiempoCancion())
    textura.needsUpdate = true
  })

  return null
}
