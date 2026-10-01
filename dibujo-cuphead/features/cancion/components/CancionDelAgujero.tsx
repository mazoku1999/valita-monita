'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { CARRIL_VH } from '@/features/agujero-negro/constantes/viajeScroll'
import { obtenerProgreso, suscribirProgreso } from '@/features/narrativa/store/progresoScrollStore'
import { CANCION } from '../constantes/cancion'
import { cambiarFaseCancion, cancionPideToque, faseCancion, pedirToque, suscribirCancion } from '../store/cancion'
import {
  alTerminarCancion,
  cancionSonando,
  desbloquearCancion,
  pararCancion,
  precargarCancion,
  saltarCancionA,
  sonarCancionDesde,
  tiempoCancion,
} from '../utils/audio'
import { type LineaMaquetada, maquetarLetra } from '../utils/maqueta'
import { interpolarMonotona } from '../utils/recorrido'
import { leerSrt } from '../utils/srt'
import { LetraEnPantalla } from './LetraEnPantalla'

/**
 * La canción del agujero negro (ver `constantes/cancion.ts`): al llegar al agujero bajando, el
 * scroll se queda quieto y empieza la canción; la cámara cruza sola a su compás (se mueve la página
 * por el carril, así todo lo demás sigue igual) con la letra en pantalla, y a su final se suelta el
 * scroll ya en el sistema solar. Botón de cristal para saltarla (o Escape); si el navegador no la
 * deja sonar sin un gesto, un botón para escucharla.
 */

const vhActual = (): number => obtenerProgreso() * CARRIL_VH

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

function empezar(): void {
  void sonarCancionDesde(CANCION.audio, 0, CANCION.fundidoEntrada).then((sono) => {
    if (faseCancion() !== 'esperando') {
      if (sono) pararCancion(0.3)
      return
    }
    if (sono) cambiarFaseCancion('sonando')
    else pedirToque()
  })
}

/** Al llegar al agujero: quieta la página en la puerta e intenta sonar. */
function entrar(): void {
  cambiarFaseCancion('esperando')
  if (vhActual() > CANCION.puertaVh + 1) irAVh(CANCION.puertaVh)
  empezar()
}

function saltar(): void {
  const fase = faseCancion()
  if (fase !== 'esperando' && fase !== 'sonando') return
  pararCancion(CANCION.fundidoSalida)
  cambiarFaseCancion('libre')
}

function rearmar(): void {
  if (cancionSonando()) pararCancion(CANCION.fundidoSalida)
  cambiarFaseCancion('armada')
}

export function CancionDelAgujero() {
  const fase = useSyncExternalStore(suscribirCancion, faseCancion, () => 'armada' as const)
  const pideToque = useSyncExternalStore(suscribirCancion, cancionPideToque, () => false)
  const [letra, setLetra] = useState<LineaMaquetada[] | null>(null)

  // Al acercarse al agujero: se cargan la canción, su letra y sus letras (las tipografías).
  useEffect(() => {
    let pedida = false
    const revisar = (): void => {
      if (pedida || vhActual() < CANCION.precargaVh) return
      pedida = true
      precargarCancion(CANCION.audio)
      fetch(CANCION.letra)
        .then((respuesta) => (respuesta.ok ? respuesta.text() : ''))
        .then((texto) => setLetra(maquetarLetra(leerSrt(texto))))
        .catch(() => setLetra([]))
      const estilos = getComputedStyle(document.documentElement)
      for (const [variable, muestra] of [
        ['--font-letra-sans', 'italic 800 40px'],
        ['--font-letra-sans', '600 40px'],
        ['--font-letra-serif', '500 40px'],
        ['--font-letra-condensada', '600 40px'],
        ['--font-serif-display', 'italic 400 40px'],
      ] as const) {
        const familia = estilos.getPropertyValue(variable).trim()
        if (familia) void document.fonts?.load(`${muestra} ${familia}`).catch(() => undefined)
      }
    }
    revisar()
    return suscribirProgreso(revisar)
  }, [])

  // El primer gesto en cualquier parte (clic, tecla o toque) desbloquea el sonido para después.
  useEffect(() => {
    const tipos = ['pointerdown', 'keydown', 'touchend'] as const
    const quitar = (): void => {
      for (const tipo of tipos) window.removeEventListener(tipo, alGesto, true)
    }
    const alGesto = (): void => {
      quitar()
      desbloquearCancion(CANCION.audio)
    }
    for (const tipo of tipos) window.addEventListener(tipo, alGesto, { capture: true, passive: true })
    return quitar
  }, [])

  // La puerta: llegar al agujero bajando la empieza; volver por encima, después, la arma otra vez.
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

  // Mientras espera o suena, el scroll quieto; Escape la salta.
  const quieta = fase === 'esperando' || fase === 'sonando'
  useEffect(() => {
    if (!quieta) return
    const soltar = bloquearScroll()
    const alTecla = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') saltar()
    }
    window.addEventListener('keydown', alTecla)
    return () => {
      soltar()
      window.removeEventListener('keydown', alTecla)
    }
  }, [quieta])

  // El cruce: la página avanza por el carril al compás de la canción hasta soltarse.
  useEffect(() => {
    if (fase !== 'sonando') return
    let solicitud = 0
    const cuadro = (): void => {
      const t = tiempoCancion()
      if (t >= CANCION.suelta) {
        irAVh(interpolarMonotona(CANCION.recorrido, CANCION.suelta))
        cambiarFaseCancion('libre')
        return
      }
      irAVh(interpolarMonotona(CANCION.recorrido, t))
      solicitud = window.requestAnimationFrame(cuadro)
    }
    solicitud = window.requestAnimationFrame(cuadro)
    const quitarFin = alTerminarCancion(() => {
      if (faseCancion() === 'sonando') cambiarFaseCancion('libre')
    })
    return () => {
      window.cancelAnimationFrame(solicitud)
      quitarFin()
    }
  }, [fase])

  // En desarrollo: saltar por la canción y forzar fases desde la consola o las capturas.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return
    ;(window as unknown as { __cancion?: unknown }).__cancion = {
      fase: faseCancion,
      tiempo: tiempoCancion,
      saltarA: saltarCancionA,
      saltar,
      entrar,
    }
  }, [])

  return (
    <>
      <LetraEnPantalla letra={letra} activa={fase === 'sonando'} />
      {quieta && (
        <button type="button" className="boton-cristal boton-saltar-cancion" aria-label="Saltar la canción" onClick={saltar}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4.5 6.5 L11 12 L4.5 17.5 Z" />
            <path d="M11.5 6.5 L18 12 L11.5 17.5 Z" />
            <path d="M20 6.5 V17.5" />
          </svg>
        </button>
      )}
      {fase === 'esperando' && pideToque && (
        <button type="button" className="boton-cristal boton-escuchar" aria-label="Escuchar la canción" onClick={empezar}>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8.5 5.8 L18.5 12 L8.5 18.2 Z" />
          </svg>
        </button>
      )}
    </>
  )
}
