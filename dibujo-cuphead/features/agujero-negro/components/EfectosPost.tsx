'use client'

import { EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { useFrame } from '@react-three/fiber'
import { type EffectComposer as ComposerDeEfectos, ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo, useRef } from 'react'
import { avanzarRitmo, latido, pulsaciones, tocaDibujar } from '@/features/dibujo/store/ritmoDibujo'
import { PasoDibujo } from '@/features/dibujo/utils/PasoDibujo'
import { ajuste } from '../store/vistaCamaraStore'
import { suavizar } from '../utils/aleatorio'

/**
 * Posproceso del dibujo animado. El agujero negro ya se traza en caricatura (ver
 * `shaders/lenteCaricatura.frag.ts`) en su propio buffer, que compone el pase de dibujo por encima
 * de todo lo demás: ni resplandores ni bloom (en un dibujo animado la luz se dibuja, no se
 * difumina). El tono (ACES) sólo afecta a lo que todavía se renderiza con materiales realistas.
 */
export function EfectosPost() {
  const pasoDibujo = useMemo(() => new PasoDibujo(), [])
  useEffect(() => () => pasoDibujo.dispose(), [pasoDibujo])

  // Ritmo de dibujo animado (ver `features/dibujo/store/ritmoDibujo.ts`): el primero de cada
  // fotograma decide si toca un dibujo nuevo; si no, el compositor no dibuja nada y la pantalla
  // conserva el dibujo anterior. El tiempo que pasa entre dibujos se entrega entero al siguiente.
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
        const ventana = window as unknown as { __dibujosHechos?: number }
        ventana.__dibujosHechos = (ventana.__dibujosHechos ?? 0) + 1
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
    pasoDibujo.ajustes.activo = ajuste('dibujo', 1) > 0.5
    pasoDibujo.ajustes.soloTinta = ajuste('dibujoSoloTinta', 0) > 0.5
    pasoDibujo.ajustes.grosor = ajuste('dibujoGrosor', pasoDibujo.ajustes.grosor)
  })

  return (
    <EffectComposer ref={compositor} multisampling={0}>
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <primitive object={pasoDibujo} />
    </EffectComposer>
  )
}
