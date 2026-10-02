'use client'

import { EffectComposer } from '@react-three/postprocessing'
import { useFrame } from '@react-three/fiber'
import type { EffectComposer as ComposerDeEfectos } from 'postprocessing'
import { useEffect, useMemo, useRef } from 'react'
import { ESCENARIO } from '@/features/cancion/store/escenario'
import { NIEBLA } from '@/features/dibujo/store/niebla'
import { avanzarRitmo, latido, pulsaciones, resolucionDePantalla, ritmoDePantalla, tocaDibujar } from '@/features/dibujo/store/ritmoDibujo'
import { PasoDibujo } from '@/features/dibujo/utils/PasoDibujo'
import { obtenerProgreso, obtenerProgresoSuave } from '@/features/narrativa/store/progresoScrollStore'
import { CARRIL_VH, VIAJE } from '../constantes/viajeScroll'
import { ajuste } from '../store/vistaCamaraStore'
import { suavizar } from '../utils/aleatorio'

/**
 * Posproceso del dibujo animado: sólo el pase de dibujo. El agujero negro ya se traza en caricatura
 * (ver `shaders/lenteCaricatura.frag.ts`) en su propio buffer y el sistema solar sale dibujado de
 * la escena; ni resplandores ni bloom (en un dibujo animado la luz se dibuja, no se difumina). El
 * tono (ACES) lo aplica el propio pase, sólo a lo que todavía se renderiza con materiales realistas.
 */
export function EfectosPost() {
  const pasoDibujo = useMemo(() => new PasoDibujo(), [])
  useEffect(() => () => pasoDibujo.dispose(), [pasoDibujo])

  // Ritmo de la pantalla (ver `features/dibujo/store/ritmoDibujo.ts`): el primero de cada
  // fotograma decide si toca dibujarla (a 60 por segundo, o a 30 si el aparato no llega); si no, el
  // compositor no dibuja nada y la pantalla conserva el dibujo anterior. El tiempo que pasa entre
  // dibujos se entrega entero al siguiente.
  // El compositor de r3f se crea en su propio efecto, después de montar: se envuelve su `render`
  // en cuanto existe (y otra vez si se recrea).
  const compositor = useRef<ComposerDeEfectos>(null)
  const envuelto = useRef<ComposerDeEfectos | null>(null)
  useFrame(({ clock }) => {
    avanzarRitmo(clock.getElapsedTime())
    const composer = compositor.current
    if (!composer || envuelto.current === composer) return
    envuelto.current = composer
    const original = composer.render.bind(composer)
    let pendiente = 0
    composer.render = (delta?: number) => {
      pendiente += delta ?? 0
      if (!tocaDibujar()) return
      original(pendiente)
      pendiente = 0
      if (process.env.NODE_ENV === 'development') {
        const ventana = window as unknown as { __dibujosHechos?: number; __ritmoPantalla?: () => number; __resolucionPantalla?: () => number }
        ventana.__dibujosHechos = (ventana.__dibujosHechos ?? 0) + 1
        ventana.__ritmoPantalla = ritmoDePantalla
        ventana.__resolucionPantalla = resolucionDePantalla
      }
    }
  }, -1)

  useFrame(({ camera, clock }) => {
    pasoDibujo.camara = camera
    const distanciaCentro = camera.position.length()
    // El cielo abierto se pinta como cielo salvo dentro del horizonte, entre que se cruza y que
    // aparece la boca del agujero de gusano (0.6 → 0.4 del centro): ahí todo es oscuridad.
    pasoDibujo.cieloPintado = Math.max(suavizar(0.95, 1.4, distanciaCentro), suavizar(0.6, 0.4, distanciaCentro))
    // El agujero de caricatura y los destellos de su banda sólo existen fuera del horizonte.
    pasoDibujo.gasVisible = suavizar(0.98, 1.25, distanciaCentro)
    pasoDibujo.bandaVisible = suavizar(1.3, 2.5, distanciaCentro)
    pasoDibujo.latido = latido(clock.getElapsedTime())
    pasoDibujo.pulsaciones = pulsaciones(clock.getElapsedTime())
    // El iris se cierra sobre la sombra al cruzar el horizonte y se abre sobre el remolino.
    const progreso = obtenerProgreso()
    const { irisCierre, irisApertura } = VIAJE
    pasoDibujo.iris =
      progreso < irisApertura.desde
        ? 1 - suavizar(irisCierre.desde, irisCierre.hasta, progreso)
        : suavizar(irisApertura.desde, irisApertura.hasta, progreso)
    // El escenario de la canción, entre el dibujo y la película (ver `features/cancion`).
    const escenario = pasoDibujo.escenario
    escenario.activo = ESCENARIO.activo
    escenario.cubre = ESCENARIO.cubre
    escenario.encima = ESCENARIO.encima
    escenario.escena = ESCENARIO.escena
    escenario.mitad.set(ESCENARIO.mitad.x, ESCENARIO.mitad.y)
    escenario.zoom = ESCENARIO.zoom
    escenario.opacidadEscena = ESCENARIO.opacidadEscena
    escenario.viaje = ESCENARIO.viaje
    escenario.estilo = ESCENARIO.estilo
    escenario.revelado = ESCENARIO.revelado
    // Dentro de una nube (la del corazón, al entrar en la Tierra y al salir sobre el valle).
    pasoDibujo.niebla = Math.max(NIEBLA.globo, NIEBLA.valle)
    pasoDibujo.nieblaSentido = NIEBLA.globo > NIEBLA.valle ? -1 : 1
    pasoDibujo.nieblaAvance = obtenerProgresoSuave() * CARRIL_VH * 0.12 + clock.getElapsedTime() * 0.05
    pasoDibujo.ajustes.activo = ajuste('dibujo', 1) > 0.5
    pasoDibujo.ajustes.soloTinta = ajuste('dibujoSoloTinta', 0) > 0.5
    pasoDibujo.ajustes.grosor = ajuste('dibujoGrosor', pasoDibujo.ajustes.grosor)
  })

  return (
    <EffectComposer ref={compositor} multisampling={0}>
      <primitive object={pasoDibujo} />
    </EffectComposer>
  )
}
