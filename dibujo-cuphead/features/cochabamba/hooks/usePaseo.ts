'use client'

import { useEffect } from 'react'
import { CARTA } from '../store/carta'
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

/** Un toque (para la cajita): lo que puede moverse el puntero (px) y durar (ms). */
const TOQUE = { movimiento: 9, duracion: 450 } as const

/** Se puede pasear: la cámara posada y la cajita sin abrir (abierta, ya no hay mandos). */
const mandosActivos = (): boolean => PASEO.activo && CARTA.fase === 'cerrada'

/**
 * Los mandos del paseo por el corazón (ver `store/paseo.ts`), sólo con la cámara posada: las
 * flechas y WASD (con Mayúsculas, correr; entonces las flechas no desplazan la página) y arrastrar
 * sobre el lienzo para mirar, como en los juegos: el dedo o el ratón a la derecha gira a la derecha,
 * hacia arriba mira arriba, sin inercia. Mientras se pasea, tocar el lienzo no desplaza la página
 * (subir es un botón; volver a donde se posó, otro). Un toque o clic sin arrastrar deja su
 * punto en `CARTA.toque` (si cae en la cajita, la abre: lo comprueba `EscenaCochabamba`). La palanca
 * y los botones están en `components/ControlesPaseo.tsx`.
 */
export function usePaseo(elemento: HTMLElement | null): void {
  useEffect(() => {
    if (!elemento) return
    const pulsadas = new Set<string>()
    let mirando: { id: number; x: number; y: number; dedo: boolean } | null = null
    let bajada: { id: number; x: number; y: number; t: number; movido: number } | null = null

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
      if (!mandosActivos() || evento.metaKey || evento.ctrlKey || evento.altKey || !(evento.code in TECLAS)) return
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
      if (!mandosActivos() || mirando || (evento.pointerType === 'mouse' && evento.button !== 0)) return
      mirando = { id: evento.pointerId, x: evento.clientX, y: evento.clientY, dedo: evento.pointerType !== 'mouse' }
      bajada = { id: evento.pointerId, x: evento.clientX, y: evento.clientY, t: evento.timeStamp, movido: 0 }
    }
    const alMover = (evento: PointerEvent): void => {
      if (!mirando || evento.pointerId !== mirando.id) return
      const dx = evento.clientX - mirando.x
      const dy = evento.clientY - mirando.y
      mirando.x = evento.clientX
      mirando.y = evento.clientY
      if (bajada && bajada.id === evento.pointerId) bajada.movido = Math.max(bajada.movido, Math.hypot(evento.clientX - bajada.x, evento.clientY - bajada.y))
      if (!mandosActivos()) return
      const sensibilidad = mirando.dedo ? MIRAR.dedo : MIRAR.raton
      PASEO.giro -= dx * sensibilidad
      PASEO.cabeceo -= dy * sensibilidad
      if (Math.abs(dx) + Math.abs(dy) > 0) marcarMirado()
    }
    const alSoltar = (evento: PointerEvent): void => {
      if (mirando && evento.pointerId === mirando.id) mirando = null
      // Un toque (sin arrastrar): por si cae en la cajita.
      if (bajada && evento.pointerId === bajada.id) {
        const esToque = evento.type === 'pointerup' && bajada.movido < TOQUE.movimiento && evento.timeStamp - bajada.t < TOQUE.duracion
        if (esToque && mandosActivos()) {
          const caja = elemento.getBoundingClientRect()
          CARTA.toque = { x: ((evento.clientX - caja.left) / caja.width) * 2 - 1, y: 1 - ((evento.clientY - caja.top) / caja.height) * 2 }
        }
        bajada = null
      }
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
    return () => {
      dejarDeOir()
      window.removeEventListener('keydown', alBajarTecla)
      window.removeEventListener('keyup', alSoltarTecla)
      window.removeEventListener('blur', alPerderFoco)
      elemento.removeEventListener('pointerdown', alBajar)
      elemento.removeEventListener('pointermove', alMover)
      elemento.removeEventListener('pointerup', alSoltar)
      elemento.removeEventListener('pointercancel', alSoltar)
    }
  }, [elemento])
}
