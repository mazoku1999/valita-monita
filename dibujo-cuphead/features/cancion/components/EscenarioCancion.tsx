'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CARRIL_VH } from '@/features/agujero-negro/constantes/viajeScroll'
import { cambiaDibujo } from '@/features/dibujo/store/ritmoDibujo'
import { obtenerProgreso } from '@/features/narrativa/store/progresoScrollStore'
import { CANCION } from '../constantes/cancion'
import { Escenario } from '../escenario/Escenario'
import { faseCancion } from '../store/cancion'
import { ESCENARIO, FINAL, empezarFinal, letraDelEscenario } from '../store/escenario'
import { tiempoCancion } from '../utils/audio'

/** Lado mayor del lienzo de encima (px): más no se nota tras la película y cuesta. */
const LADO_MAXIMO = 1920

/** Una textura de lienzo en sRGB tal cual (como el dibujo sobre el que va). */
function texturaDe(lienzo: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(lienzo)
  t.colorSpace = THREE.NoColorSpace
  t.minFilter = THREE.LinearFilter
  t.magFilter = THREE.LinearFilter
  t.generateMipmaps = false
  return t
}

/**
 * Pinta el escenario de la canción (ver `escenario/Escenario.ts`) a 24 dibujos por segundo y lo deja
 * para el pase de dibujo (ver `store/escenario.ts`): mientras suena, la escena en el fondo del túnel
 * (con el viaje a los costados) y la letra; al acabar (o al saltarla), el mensaje final, que se
 * cierra al seguir deslizando. Mientras el final tapa la pantalla, la escena 3D no se dibuja.
 */
export function EscenarioCancion() {
  const gl = useThree((estado) => estado.gl)
  const escena = useThree((estado) => estado.scene)
  const escenario = useMemo(() => new Escenario(), [])
  const encima = useMemo(() => texturaDe(escenario.lienzo), [escenario])
  const pintura = useMemo(() => texturaDe(escenario.lienzoEscena), [escenario])
  const tamano = useMemo(() => new THREE.Vector2(), [])
  const ocultaLaEscena = useRef(false)

  useEffect(() => {
    // En desarrollo, para las pruebas: el estado del escenario desde la consola.
    if (process.env.NODE_ENV === 'development') (window as unknown as { __escenario?: unknown }).__escenario = ESCENARIO
    ESCENARIO.encima = encima
    ESCENARIO.escena = pintura
    escenario.cargarLetra()
    return () => {
      ESCENARIO.encima = null
      ESCENARIO.escena = null
      ESCENARIO.activo = false
      ESCENARIO.cubre = false
      if (ocultaLaEscena.current) escena.visible = true
      ocultaLaEscena.current = false
      encima.dispose()
      pintura.dispose()
    }
  }, [escenario, encima, pintura, escena])

  useFrame(() => {
    const lineas = letraDelEscenario()
    const fase = faseCancion()
    const suena = fase === 'sonando' && lineas !== null && lineas.length > 0
    const t = tiempoCancion()
    // Al acabar la canción, el final (si se salta, lo empieza `CancionDelAgujero`).
    if (suena && FINAL.inicio < 0 && t >= escenario.inicioDelFinal(lineas)) empezarFinal(CANCION.vh.suelta)
    const final =
      FINAL.inicio >= 0
        ? escenario.estadoFinal(performance.now() / 1000 - FINAL.inicio, obtenerProgreso() * CARRIL_VH, FINAL.vh, fase !== 'sonando')
        : null
    ESCENARIO.activo = suena || final !== null
    ESCENARIO.cubre = escenario.finalTapa(final)
    if (ESCENARIO.cubre !== ocultaLaEscena.current) {
      escena.visible = !ESCENARIO.cubre
      ocultaLaEscena.current = ESCENARIO.cubre
    }
    // Los lienzos se repintan a 24 por segundo, como el resto de lo dibujado (la pantalla puede ir a más).
    if (!ESCENARIO.activo || !cambiaDibujo()) return
    gl.getDrawingBufferSize(tamano)
    const escala = Math.min(1, LADO_MAXIMO / Math.max(tamano.x, tamano.y, 1))
    // Con otro tamaño, las texturas se rehacen (su memoria en la GPU es de tamaño fijo).
    const cambia = escenario.dimensionar(Math.max(2, Math.round(tamano.x * escala)), Math.max(2, Math.round(tamano.y * escala)))
    if (cambia.encima) encima.dispose()
    if (cambia.escena) pintura.dispose()
    const composicion = escenario.dibujar({ lineas: suena ? lineas : null, t: suena ? t : null, final })
    ESCENARIO.mitad.x = composicion.mitad[0]
    ESCENARIO.mitad.y = composicion.mitad[1]
    ESCENARIO.zoom = composicion.zoom
    ESCENARIO.opacidadEscena = composicion.escena ? composicion.opacidadEscena : 0
    ESCENARIO.viaje = composicion.viaje
    ESCENARIO.estilo = composicion.estilo
    ESCENARIO.revelado = composicion.revelado
    encima.needsUpdate = true
    if (composicion.escena) pintura.needsUpdate = true
  })

  return null
}
