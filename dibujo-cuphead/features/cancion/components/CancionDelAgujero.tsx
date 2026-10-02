'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { CARRIL_VH } from '@/features/agujero-negro/constantes/viajeScroll'
import { obtenerProgreso, suscribirProgreso } from '@/features/narrativa/store/progresoScrollStore'
import { CANCION, recorridoDeLaCancion } from '../constantes/cancion'
import { cambiarFaseCancion, faseCancion, suscribirCancion } from '../store/cancion'
import { ponerLetraDelEscenario } from '../store/escenario'
import {
  alTerminarCancion,
  cancionAudible,
  empezarCancion,
  estadoDelSonido,
  permitirSonido,
  precargarCancion,
  saltarCancionA,
  soltarCancion,
  terminarCancion,
  tiempoCancion,
} from '../utils/audio'
import { finDelPrimerBloque, letraParaElEscenario } from '../utils/letra'
import { interpolarMonotona } from '../utils/recorrido'
import { leerSrt } from '../utils/srt'
import { leerVtt } from '../utils/vtt'
import { BotonSonido } from './BotonSonido'

/**
 * La canción del agujero negro (ver `constantes/cancion.ts`): al entrar en el agujero bajando, el
 * scroll se queda quieto y empieza la canción, sin pedir nada (con sonido si ya se activó al inicio;
 * si no, en silencio hasta que se active); la cámara cruza sola a su compás (se mueve la página por
 * el carril, así todo lo demás sigue igual) con la letra en pantalla, y a su final se suelta el
 * scroll ya en el sistema solar. Botón de cristal para saltarla (o Escape). La letra y sus escenas
 * las pinta el propio dibujo animado (ver `EscenarioCancion`); aquí se lee y se da a leer.
 */

const vhActual = (): number => obtenerProgreso() * CARRIL_VH

/** El recorrido del cruce: el de la canción de ahora y, en cuanto se lee la letra, el de sus tiempos. */
let recorrido = recorridoDeLaCancion(CANCION.porDefecto.primerBloque, CANCION.porDefecto.letra)

function irAVh(vh: number): void {
  const recorrido = document.documentElement.scrollHeight - window.innerHeight
  window.scrollTo(0, (vh / CARRIL_VH) * recorrido)
}

/** Quieto el scroll del usuario (la cámara la mueve la canción). */
function bloquearScroll(): () => void {
  const raiz = document.documentElement
  const antes = raiz.style.overflow
  raiz.style.overflow = 'hidden'
  const impedir = (evento: Event): void => evento.preventDefault()
  const alTecla = (evento: KeyboardEvent): void => {
    if ([' ', 'PageDown', 'PageUp', 'Home', 'End', 'ArrowDown', 'ArrowUp'].includes(evento.key)) evento.preventDefault()
  }
  window.addEventListener('wheel', impedir, { passive: false })
  window.addEventListener('touchmove', impedir, { passive: false })
  window.addEventListener('keydown', alTecla)
  return () => {
    raiz.style.overflow = antes
    window.removeEventListener('wheel', impedir)
    window.removeEventListener('touchmove', impedir)
    window.removeEventListener('keydown', alTecla)
  }
}

/** Al entrar en el agujero: quieta la página en la puerta y empieza la canción. */
function entrar(): void {
  cambiarFaseCancion('sonando')
  if (vhActual() > CANCION.puertaVh + 1) irAVh(CANCION.puertaVh)
  empezarCancion(CANCION.audio)
}

/** Al final del cruce: se suelta el scroll (si suena, sigue sonando su final). */
function soltar(): void {
  irAVh(interpolarMonotona(recorrido.puntos, recorrido.suelta))
  soltarCancion()
  cambiarFaseCancion('libre')
}

function saltar(): void {
  if (faseCancion() !== 'sonando') return
  terminarCancion(CANCION.fundidoSalida)
  cambiarFaseCancion('libre')
}

function rearmar(): void {
  terminarCancion(CANCION.fundidoSalida)
  cambiarFaseCancion('armada')
}

export function CancionDelAgujero() {
  const fase = useSyncExternalStore(suscribirCancion, faseCancion, () => 'armada' as const)

  // Al acercarse al agujero: se cargan la canción, su letra y la tipografía de la cinta.
  useEffect(() => {
    let pedida = false
    const revisar = (): void => {
      if (pedida || vhActual() < CANCION.precargaVh) return
      pedida = true
      precargarCancion(CANCION.audio)
      fetch(CANCION.letra)
        .then((respuesta) => (respuesta.ok ? respuesta.text() : ''))
        .then((texto) => {
          const lineas = /^\uFEFF?WEBVTT/.test(texto) ? leerVtt(texto) : leerSrt(texto)
          if (lineas.length > 0) recorrido = recorridoDeLaCancion(finDelPrimerBloque(lineas), lineas[lineas.length - 1].fin)
          ponerLetraDelEscenario(letraParaElEscenario(lineas))
        })
        .catch(() => ponerLetraDelEscenario([]))
      const familia = getComputedStyle(document.documentElement).getPropertyValue('--font-letra-cancion').trim()
      if (familia) void document.fonts?.load(`700 40px ${familia}`).catch(() => undefined)
    }
    revisar()
    return suscribirProgreso(revisar)
  }, [])

  // Cualquier gesto (clic, tecla o toque) también activa el sonido para después; el del botón del
  // sonido lo decide él.
  useEffect(() => {
    const tipos = ['pointerdown', 'keydown', 'touchend'] as const
    const quitar = (): void => {
      for (const tipo of tipos) window.removeEventListener(tipo, alGesto, true)
    }
    const alGesto = (evento: Event): void => {
      if (evento.target instanceof Element && evento.target.closest('.boton-sonido')) return
      quitar()
      permitirSonido(CANCION.audio)
    }
    for (const tipo of tipos) window.addEventListener(tipo, alGesto, { capture: true, passive: true })
    return quitar
  }, [])

  // La puerta: entrar en el agujero bajando la empieza; volver fuera, después, la arma otra vez.
  useEffect(() => {
    const revisar = (): void => {
      const vh = vhActual()
      const fase = faseCancion()
      if (fase === 'armada' && vh >= CANCION.puertaVh && vh < CANCION.finCruceVh) entrar()
      else if (fase === 'libre' && vh < CANCION.rearmeVh) rearmar()
    }
    revisar()
    return suscribirProgreso(revisar)
  }, [])

  // Mientras suena, el scroll quieto; Escape la salta.
  const sonando = fase === 'sonando'
  useEffect(() => {
    if (!sonando) return
    const soltarScroll = bloquearScroll()
    const alTecla = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') saltar()
    }
    window.addEventListener('keydown', alTecla)
    return () => {
      soltarScroll()
      window.removeEventListener('keydown', alTecla)
    }
  }, [sonando])

  // El cruce: la página avanza por el carril al compás de la canción hasta soltarse.
  useEffect(() => {
    if (!sonando) return
    let solicitud = 0
    const cuadro = (): void => {
      const t = tiempoCancion()
      if (t >= recorrido.suelta) {
        soltar()
        return
      }
      irAVh(interpolarMonotona(recorrido.puntos, t))
      solicitud = window.requestAnimationFrame(cuadro)
    }
    solicitud = window.requestAnimationFrame(cuadro)
    const quitarFin = alTerminarCancion(() => {
      if (faseCancion() === 'sonando') soltar()
    })
    return () => {
      window.cancelAnimationFrame(solicitud)
      quitarFin()
    }
  }, [sonando])

  // En desarrollo: saltar por la canción y forzar fases desde la consola o las capturas.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return
    ;(window as unknown as { __cancion?: unknown }).__cancion = {
      fase: faseCancion,
      sonido: estadoDelSonido,
      audible: cancionAudible,
      tiempo: tiempoCancion,
      saltarA: saltarCancionA,
      saltar,
      entrar,
    }
  }, [])

  return (
    <>
      {sonando && (
        <button type="button" className="boton-cristal boton-saltar-cancion" aria-label="Saltar la canción" onClick={saltar}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4.5 6.5 L11 12 L4.5 17.5 Z" />
            <path d="M11.5 6.5 L18 12 L11.5 17.5 Z" />
            <path d="M20 6.5 V17.5" />
          </svg>
        </button>
      )}
      <BotonSonido />
    </>
  )
}
