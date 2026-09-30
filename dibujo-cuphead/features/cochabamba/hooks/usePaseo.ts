'use client'

import { useEffect } from 'react'
import { PASEO, marcarMirado, suscribirPaseo } from '../store/paseo'

/**
 * Teclas del paseo (por su posición en el teclado): adelante, de lado a la derecha y girar a la
 * derecha. W/S y ↑/↓ andan, A/D se apartan de lado y ←/→ giran, como en los juegos clásicos.
 */
const TECLAS: Readonly<Record<string, readonly [number, number, number]>> = {
  ArrowUp: [1, 0, 0],
  KeyW: [1, 0, 0],
  ArrowDown: [-1, 0, 0],
  KeyS: [-1, 0, 0],
  KeyA: [0, -1, 0],
  KeyD: [0, 1, 0],
  ArrowLeft: [0, 0, -1],
  ArrowRight: [0, 0, 1],
}

/** Mirar (rad por píxel): con el ratón y con el dedo (en el móvil, la pantalla es más pequeña). */
const MIRAR = { raton: 0.0034, dedo: 0.0056 } as const

/**
 * Los mandos del paseo por el corazón (ver `store/paseo.ts`), sólo con la cámara posada: las
 * flechas y WASD (con Mayúsculas, correr; entonces las flechas no desplazan la página) y arrastrar
 * sobre el lienzo para mirar, como en los juegos: el dedo o el ratón a la derecha gira a la derecha,
 * hacia arriba mira arriba, sin inercia. Mientras se pasea, tocar el lienzo no desplaza la página
 * (subir es un botón). Doble clic: de vuelta a donde se posó. La palanca y los botones están en
 * `components/ControlesPaseo.tsx`.
 */
export function usePaseo(elemento: HTMLElement | null): void {
  useEffect(() => {
    if (!elemento) return
    const pulsadas = new Set<string>()
    let mirando: { id: number; x: number; y: number; dedo: boolean } | null = null

    const recalcular = (): void => {
      let adelante = 0
      let lado = 0
      let girar = 0
      for (const codigo of pulsadas) {
        adelante += TECLAS[codigo][0]
        lado += TECLAS[codigo][1]
        girar += TECLAS[codigo][2]
      }
      PASEO.adelante = Math.max(-1, Math.min(1, adelante))
      PASEO.lado = Math.max(-1, Math.min(1, lado))
      PASEO.girar = Math.max(-1, Math.min(1, girar))
    }

    const alBajarTecla = (evento: KeyboardEvent): void => {
      if (evento.key === 'Shift') PASEO.correr = true
      if (!PASEO.activo || evento.metaKey || evento.ctrlKey || evento.altKey || !(evento.code in TECLAS)) return
      evento.preventDefault()
      pulsadas.add(evento.code)
      recalcular()
    }
    const alSoltarTecla = (evento: KeyboardEvent): void => {
      if (evento.key === 'Shift') PASEO.correr = false
      if (pulsadas.delete(evento.code)) recalcular()
    }
    const alPerderFoco = (): void => {
      pulsadas.clear()
      PASEO.correr = false
      recalcular()
      mirando = null
    }

    const alBajar = (evento: PointerEvent): void => {
      if (!PASEO.activo || mirando || (evento.pointerType === 'mouse' && evento.button !== 0)) return
      mirando = { id: evento.pointerId, x: evento.clientX, y: evento.clientY, dedo: evento.pointerType !== 'mouse' }
    }
    const alMover = (evento: PointerEvent): void => {
      if (!mirando || evento.pointerId !== mirando.id) return
      const dx = evento.clientX - mirando.x
      const dy = evento.clientY - mirando.y
      mirando.x = evento.clientX
      mirando.y = evento.clientY
      if (!PASEO.activo) return
      const sensibilidad = mirando.dedo ? MIRAR.dedo : MIRAR.raton
      PASEO.giro -= dx * sensibilidad
      PASEO.cabeceo -= dy * sensibilidad
      if (Math.abs(dx) + Math.abs(dy) > 0) marcarMirado()
    }
    const alSoltar = (evento: PointerEvent): void => {
      if (mirando && evento.pointerId === mirando.id) mirando = null
    }
    const alDobleClic = (): void => {
      if (PASEO.activo) PASEO.volver = true
    }

    // Paseando, el lienzo no desplaza la página al tocarlo (se mira arrastrando en cualquier
    // dirección); fuera, el scroll del viaje como siempre.
    const ajustarTactil = (): void => {
      elemento.style.touchAction = PASEO.activo ? 'none' : 'pan-y'
    }
    const dejarDeOir = suscribirPaseo(ajustarTactil)

    window.addEventListener('keydown', alBajarTecla)
    window.addEventListener('keyup', alSoltarTecla)
    window.addEventListener('blur', alPerderFoco)
    elemento.addEventListener('pointerdown', alBajar)
    elemento.addEventListener('pointermove', alMover)
    elemento.addEventListener('pointerup', alSoltar)
    elemento.addEventListener('pointercancel', alSoltar)
    elemento.addEventListener('dblclick', alDobleClic)
    return () => {
      dejarDeOir()
      window.removeEventListener('keydown', alBajarTecla)
      window.removeEventListener('keyup', alSoltarTecla)
      window.removeEventListener('blur', alPerderFoco)
      elemento.removeEventListener('pointerdown', alBajar)
      elemento.removeEventListener('pointermove', alMover)
      elemento.removeEventListener('pointerup', alSoltar)
      elemento.removeEventListener('pointercancel', alSoltar)
      elemento.removeEventListener('dblclick', alDobleClic)
    }
  }, [elemento])
}
