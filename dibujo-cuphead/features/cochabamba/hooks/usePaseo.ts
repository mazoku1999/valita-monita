'use client'

import { useEffect } from 'react'
import { PASEO } from '../store/paseo'

/** Teclas del paseo (por su posición en el teclado): adelante y a la derecha. */
const TECLAS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [1, 0],
  KeyW: [1, 0],
  ArrowDown: [-1, 0],
  KeyS: [-1, 0],
  ArrowLeft: [0, -1],
  KeyA: [0, -1],
  ArrowRight: [0, 1],
  KeyD: [0, 1],
}

/** Lo que puede moverse el puntero (px) para que cuente como clic y no como arrastre. */
const TOLERANCIA_CLIC = 6
/** Espera (ms) antes de andar tras un clic: si llega el segundo de un doble clic, no se anda. */
const ESPERA_DOBLE_CLIC = 260

/**
 * Los mandos del paseo por el corazón (ver `store/paseo.ts`), sólo con la cámara posada: las
 * flechas o WASD (con Mayúsculas, más deprisa; entonces las flechas no desplazan la página) y un
 * clic o toque en el suelo para ir hasta ahí (no si el puntero se arrastró: eso gira la cabeza).
 * Doble clic: de vuelta a la pose final.
 */
export function usePaseo(elemento: HTMLElement | null): void {
  useEffect(() => {
    if (!elemento) return
    const pulsadas = new Set<string>()
    let bajada: { x: number; y: number } | null = null
    let arrastrado = false
    let espera = 0

    const recalcular = (): void => {
      let adelante = 0
      let lado = 0
      for (const codigo of pulsadas) {
        adelante += TECLAS[codigo][0]
        lado += TECLAS[codigo][1]
      }
      PASEO.adelante = Math.max(-1, Math.min(1, adelante))
      PASEO.lado = Math.max(-1, Math.min(1, lado))
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
    }

    const alBajar = (evento: PointerEvent): void => {
      if (!evento.isPrimary) return
      bajada = { x: evento.clientX, y: evento.clientY }
      arrastrado = false
    }
    const alMover = (evento: PointerEvent): void => {
      if (bajada && evento.isPrimary && Math.hypot(evento.clientX - bajada.x, evento.clientY - bajada.y) > TOLERANCIA_CLIC) arrastrado = true
    }
    const alClic = (evento: MouseEvent): void => {
      window.clearTimeout(espera)
      if (!PASEO.activo || arrastrado || evento.detail > 1) return
      const caja = elemento.getBoundingClientRect()
      const x = ((evento.clientX - caja.left) / caja.width) * 2 - 1
      const y = 1 - ((evento.clientY - caja.top) / caja.height) * 2
      espera = window.setTimeout(() => {
        PASEO.clic = { x, y }
      }, ESPERA_DOBLE_CLIC)
    }
    const alDobleClic = (): void => {
      window.clearTimeout(espera)
      if (PASEO.activo) PASEO.volver = true
    }

    window.addEventListener('keydown', alBajarTecla)
    window.addEventListener('keyup', alSoltarTecla)
    window.addEventListener('blur', alPerderFoco)
    elemento.addEventListener('pointerdown', alBajar)
    elemento.addEventListener('pointermove', alMover)
    elemento.addEventListener('click', alClic)
    elemento.addEventListener('dblclick', alDobleClic)
    return () => {
      window.clearTimeout(espera)
      window.removeEventListener('keydown', alBajarTecla)
      window.removeEventListener('keyup', alSoltarTecla)
      window.removeEventListener('blur', alPerderFoco)
      elemento.removeEventListener('pointerdown', alBajar)
      elemento.removeEventListener('pointermove', alMover)
      elemento.removeEventListener('click', alClic)
      elemento.removeEventListener('dblclick', alDobleClic)
    }
  }, [elemento])
}
