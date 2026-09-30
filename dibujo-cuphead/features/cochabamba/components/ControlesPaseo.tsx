'use client'

import { type ReactNode, useEffect, useRef, useSyncExternalStore } from 'react'
import { PASEO, paseoActivo, paseoMirado, suscribirPaseo } from '../store/paseo'

/**
 * Los mandos a la vista del paseo por el corazón (ver `store/paseo.ts`), como en los juegos de
 * móvil y sin textos: la palanca abajo a la izquierda (en pantallas táctiles sale donde se apoya el
 * pulgar, en la mitad izquierda; con ratón se arrastra su botón) y, arriba a la derecha, volver a
 * donde se posó (la casa) y volver al viaje (la flecha: sube la página). Con ratón, además, un
 * dibujo de las flechas del teclado. Abajo a la derecha, hasta que se mira alrededor por primera
 * vez, la pista de deslizar para mirar (un dedo que va y viene). De papel crema con tinta, como el
 * resto del dibujo; aparecen al posarse la cámara.
 */

const TINTA = 'rgb(19 15 12)'
const PAPEL = 'rgb(248 238 219)'

const suscribirTactil = (aviso: () => void): (() => void) => {
  const consulta = window.matchMedia('(pointer: coarse)')
  consulta.addEventListener('change', aviso)
  return () => consulta.removeEventListener('change', aviso)
}
const esTactil = (): boolean => window.matchMedia('(pointer: coarse)').matches

const acotar = (valor: number, minimo: number, maximo: number): number => Math.min(maximo, Math.max(minimo, valor))

function Palanca({ tactil }: { tactil: boolean }) {
  const zona = useRef<HTMLDivElement>(null)
  const base = useRef<HTMLDivElement>(null)
  const pomo = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const areaZona = zona.current
    const circulo = base.current
    const boton = pomo.current
    if (!areaZona || !circulo || !boton) return
    let puntero: number | null = null
    let centroX = 0
    let centroY = 0

    const soltar = (): void => {
      puntero = null
      PASEO.palancaX = 0
      PASEO.palancaY = 0
      boton.style.transform = ''
      circulo.style.transform = ''
      delete circulo.dataset.activa
    }
    const mover = (evento: PointerEvent): void => {
      if (evento.pointerId !== puntero) return
      const recorrido = circulo.offsetWidth * 0.34
      let dx = evento.clientX - centroX
      let dy = evento.clientY - centroY
      const largo = Math.hypot(dx, dy)
      if (largo > recorrido) {
        dx *= recorrido / largo
        dy *= recorrido / largo
      }
      boton.style.transform = `translate(${dx}px, ${dy}px)`
      PASEO.palancaX = dx / recorrido
      PASEO.palancaY = -dy / recorrido
    }
    const bajar = (evento: PointerEvent): void => {
      if (puntero !== null || !PASEO.activo || (evento.pointerType === 'mouse' && evento.button !== 0)) return
      evento.preventDefault()
      puntero = evento.pointerId
      areaZona.setPointerCapture(evento.pointerId)
      const caja = circulo.getBoundingClientRect()
      const mitad = caja.width / 2
      const reposoX = caja.left + mitad
      const reposoY = caja.top + mitad
      if (tactil) {
        // Flotante: la palanca salta bajo el pulgar (sin salirse de la pantalla).
        centroX = acotar(evento.clientX, mitad + 6, window.innerWidth - mitad - 6)
        centroY = acotar(evento.clientY, mitad + 6, window.innerHeight - mitad - 6)
        circulo.style.transform = `translate(${centroX - reposoX}px, ${centroY - reposoY}px)`
      } else {
        centroX = reposoX
        centroY = reposoY
      }
      circulo.dataset.activa = '1'
      mover(evento)
    }
    const fin = (evento: PointerEvent): void => {
      if (evento.pointerId === puntero) soltar()
    }
    areaZona.addEventListener('pointerdown', bajar)
    areaZona.addEventListener('pointermove', mover)
    areaZona.addEventListener('pointerup', fin)
    areaZona.addEventListener('pointercancel', fin)
    window.addEventListener('blur', soltar)
    return () => {
      areaZona.removeEventListener('pointerdown', bajar)
      areaZona.removeEventListener('pointermove', mover)
      areaZona.removeEventListener('pointerup', fin)
      areaZona.removeEventListener('pointercancel', fin)
      window.removeEventListener('blur', soltar)
      soltar()
    }
  }, [tactil])

  // En pantallas táctiles la zona es la mitad izquierda de abajo; con ratón, la palanca misma.
  const lado = tactil ? 'clamp(96px, 29vw, 128px)' : '118px'
  return (
    <div
      ref={zona}
      className="pointer-events-auto fixed"
      style={
        tactil
          ? { left: 0, bottom: 0, width: '48vw', height: '56vh', touchAction: 'none' }
          : { left: 'calc(28px + env(safe-area-inset-left))', bottom: 'calc(30px + env(safe-area-inset-bottom))', width: lado, height: lado, touchAction: 'none', cursor: 'grab' }
      }
    >
      <div
        ref={base}
        className="palanca-paseo absolute rounded-full"
        style={{
          width: lado,
          height: lado,
          left: tactil ? 'calc(24px + env(safe-area-inset-left))' : 0,
          bottom: tactil ? 'calc(28px + env(safe-area-inset-bottom))' : 0,
          border: `3px solid ${TINTA}`,
          background: 'radial-gradient(circle, rgb(248 238 219 / 0.16) 0 58%, rgb(248 238 219 / 0.4) 60% 100%)',
          boxShadow: '0 3px 0 rgb(19 15 12 / 0.35), inset 0 0 0 7px rgb(248 238 219 / 0.25)',
        }}
      >
        {/* Las cuatro direcciones, en tinta. */}
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
          {[0, 90, 180, 270].map((giro) => (
            <path key={giro} d="M50 9 L57 18 L43 18 Z" fill={TINTA} opacity="0.7" transform={`rotate(${giro} 50 50)`} />
          ))}
        </svg>
        <div
          ref={pomo}
          className="absolute rounded-full"
          style={{
            width: '42%',
            height: '42%',
            left: '29%',
            top: '29%',
            border: `3px solid ${TINTA}`,
            background: `radial-gradient(circle at 36% 30%, rgb(255 251 242) 0 18%, ${PAPEL} 45%, rgb(226 208 176) 100%)`,
            boxShadow: '0 3px 0 rgb(19 15 12 / 0.4)',
          }}
        />
      </div>
    </div>
  )
}

function Boton({ etiqueta, alPulsar, children }: { etiqueta: string; alPulsar: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      onClick={alPulsar}
      className="pointer-events-auto grid h-12 w-12 place-items-center rounded-full transition-transform active:scale-90"
      style={{ border: `3px solid ${TINTA}`, background: PAPEL, boxShadow: '0 3px 0 rgb(19 15 12 / 0.45)', touchAction: 'manipulation' }}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke={TINTA} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  )
}

/** Las flechas del teclado, dibujadas (sólo con ratón): también se anda con ellas o con WASD. */
function Teclas() {
  const tecla = (x: number, y: number, giro: number) => (
    <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
      <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill={PAPEL} stroke={TINTA} strokeWidth="2.2" />
      <path d="M12 7 L16.5 14 H7.5 Z" fill={TINTA} transform={`rotate(${giro} 12 12)`} />
    </g>
  )
  return (
    <svg
      viewBox="0 0 74 50"
      width="74"
      height="50"
      aria-hidden="true"
      className="pointer-events-none fixed opacity-80"
      style={{ left: 'calc(162px + env(safe-area-inset-left))', bottom: 'calc(34px + env(safe-area-inset-bottom))' }}
    >
      {tecla(25, 0, 0)}
      {tecla(0, 25, 270)}
      {tecla(25, 25, 180)}
      {tecla(50, 25, 90)}
    </svg>
  )
}

/** La pista de mirar: arrastrar (o deslizar el dedo) a los lados; se va al hacerlo la primera vez. */
function PistaMirar({ visible }: { visible: boolean }) {
  return (
    <div
      className="pointer-events-none fixed grid place-items-center rounded-full"
      style={{
        right: 'calc(28px + env(safe-area-inset-right))',
        bottom: 'calc(30px + env(safe-area-inset-bottom))',
        width: 'clamp(84px, 24vw, 104px)',
        height: 'clamp(84px, 24vw, 104px)',
        border: `3px dashed rgb(19 15 12 / 0.7)`,
        background: 'rgb(248 238 219 / 0.2)',
        opacity: visible ? 0.85 : 0,
        transition: 'opacity 0.6s ease',
      }}
    >
      <svg viewBox="0 0 48 32" width="64" height="43" fill="none" stroke={TINTA} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 16 H11 M4 16 L8 12 M4 16 L8 20" />
        <path d="M44 16 H37 M44 16 L40 12 M44 16 L40 20" />
        <g className="pista-mirar-dedo">
          <circle cx="24" cy="16" r="7.5" stroke="rgb(19 15 12 / 0.45)" />
          <circle cx="24" cy="16" r="3.8" fill={TINTA} stroke="none" />
        </g>
      </svg>
    </div>
  )
}

export function ControlesPaseo() {
  const activo = useSyncExternalStore(suscribirPaseo, paseoActivo, () => false)
  const mirado = useSyncExternalStore(suscribirPaseo, paseoMirado, () => false)
  const tactil = useSyncExternalStore(suscribirTactil, esTactil, () => false)

  const volverAlRamo = (): void => {
    PASEO.volver = true
  }
  // Volver al viaje: la página sube algo más de una pantalla y la cámara vuelve al camino.
  const subir = (): void => {
    window.scrollTo({ top: Math.max(0, window.scrollY - window.innerHeight * 1.2), behavior: 'instant' })
  }

  return (
    <div
      className="pointer-events-none fixed inset-0 z-20 select-none"
      aria-hidden={!activo}
      style={{
        opacity: activo ? 1 : 0,
        visibility: activo ? 'visible' : 'hidden',
        transition: activo ? 'opacity 0.8s ease 0.3s' : 'opacity 0.4s ease, visibility 0s linear 0.4s',
      }}
    >
      <Palanca tactil={tactil} />
      {!tactil && <Teclas />}
      <PistaMirar visible={!mirado} />
      <div
        className="fixed flex flex-col gap-3"
        style={{ top: 'calc(16px + env(safe-area-inset-top))', right: 'calc(16px + env(safe-area-inset-right))' }}
      >
        <Boton etiqueta="Volver al ramo" alPulsar={volverAlRamo}>
          <path d="M4 11.5 L12 4.5 L20 11.5" />
          <path d="M6.5 10 V19.5 H17.5 V10" />
          <path d="M10.2 19.5 V14.5 H13.8 V19.5" />
        </Boton>
        <Boton etiqueta="Volver al viaje" alPulsar={subir}>
          <path d="M12 19 V6" />
          <path d="M6.5 11 L12 5.5 L17.5 11" />
        </Boton>
      </div>
    </div>
  )
}
