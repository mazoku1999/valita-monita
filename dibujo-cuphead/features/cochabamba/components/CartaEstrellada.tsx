'use client'

import { type CSSProperties, Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { CARTA_PARRAFOS, RITMO_CARTA, ajustarComas } from '../constantes/carta'
import { faseCarta, suscribirCarta } from '../store/carta'

/**
 * La carta del final, escrita en el cielo de la noche estrellada (ver `store/carta.ts`): párrafo a
 * párrafo, cada letra aparece como si se escribiera con tinta dorada que se aclara al secarse, el
 * párrafo se queda lo que hace falta para leerlo y da paso al siguiente. El saludo y la despedida van
 * en caligrafía. Tocar (o clic, o → / espacio) termina de escribir el párrafo o pasa al siguiente;
 * ← o deslizar hacia la derecha vuelve al anterior. Abajo, una estrellita por párrafo; al final,
 * volver a leerla. Mientras la cajita está abierta la página no se desplaza: la cámara no se mueve.
 */

const ULTIMO = CARTA_PARRAFOS.length - 1
const TEXTOS = CARTA_PARRAFOS.map(ajustarComas)

const duracion = (indice: number): { escritura: number; total: number } => {
  const n = TEXTOS[indice].length
  return { escritura: n * RITMO_CARTA.porLetra + 0.75, total: Math.max(RITMO_CARTA.minimo, RITMO_CARTA.base + n * RITMO_CARTA.lectura) }
}

const TINTA = 'rgb(19 15 12)'

function Parrafo({ indice, completo, saliendo }: { indice: number; completo: boolean; saliendo: boolean }) {
  const texto = TEXTOS[indice]
  const estilo = indice === 0 ? 'carta-saludo' : indice === ULTIMO ? 'carta-despedida' : ''
  let k = 0
  return (
    <p className={`carta-parrafo ${estilo} ${completo ? 'carta-completa' : ''} ${saliendo ? 'carta-saliendo' : ''}`} aria-hidden="true">
      {texto.split(' ').map((palabra, i) => {
        if (i > 0) k += 2
        return (
          <Fragment key={i}>
            {i > 0 && ' '}
            <span className="carta-palabra">
              {Array.from(palabra).map((letra) => {
                k += 1
                return (
                  <span key={k} className="carta-letra" style={{ '--i': k } as CSSProperties}>
                    {letra}
                  </span>
                )
              })}
            </span>
          </Fragment>
        )
      })}
    </p>
  )
}

/** Estrellita de cuatro puntas (una por párrafo): dorada si ya se leyó. */
function Estrellita({ llena }: { llena: boolean }) {
  return (
    <svg viewBox="-12 -12 24 24" width="17" height="17" aria-hidden="true">
      <path
        d="M0 -10 C1.4 -2.6 2.6 -1.4 10 0 C2.6 1.4 1.4 2.6 0 10 C-1.4 2.6 -2.6 1.4 -10 0 C-2.6 -1.4 -1.4 -2.6 0 -10 Z"
        fill={llena ? 'rgb(255 222 140)' : 'rgb(252 243 220 / 0.22)'}
        stroke={llena ? TINTA : 'rgb(252 243 220 / 0.7)'}
        strokeWidth="1.8"
      />
    </svg>
  )
}

function Carta() {
  const [indice, setIndice] = useState(0)
  const [completo, setCompleto] = useState(false)
  const [saliendo, setSaliendo] = useState(false)
  const [alFinal, setAlFinal] = useState(false)
  const inicio = useRef(performance.now())
  const estado = useRef({ indice: 0, completo: false, saliendo: false, alFinal: false, cambiando: false })

  const ir = useCallback((nuevo: number) => {
    const destino = Math.max(0, Math.min(ULTIMO, nuevo))
    inicio.current = performance.now()
    estado.current = { indice: destino, completo: false, saliendo: false, alFinal: false, cambiando: false }
    setIndice(destino)
    setCompleto(false)
    setSaliendo(false)
    setAlFinal(false)
  }, [])

  // El reloj de la carta: se escribe, se lee, se desvanece y llega el siguiente.
  useEffect(() => {
    let cuadro = 0
    const avanzarReloj = (): void => {
      const e = estado.current
      const { escritura, total } = duracion(e.indice)
      const t = (performance.now() - inicio.current) / 1000
      if (!e.completo && t >= escritura) {
        e.completo = true
        setCompleto(true)
      }
      if (e.indice < ULTIMO) {
        if (!e.saliendo && t >= total - RITMO_CARTA.fundido) {
          e.saliendo = true
          setSaliendo(true)
        }
        if (t >= total && !e.cambiando) {
          e.cambiando = true
          ir(e.indice + 1)
        }
      } else if (!e.alFinal && t >= escritura + 3.5) {
        e.alFinal = true
        setAlFinal(true)
      }
      cuadro = requestAnimationFrame(avanzarReloj)
    }
    cuadro = requestAnimationFrame(avanzarReloj)
    return () => cancelAnimationFrame(cuadro)
  }, [ir])

  // Tocar: si se está escribiendo, se termina de escribir (y desde ahí corre el tiempo de lectura);
  // si ya está escrito, al siguiente (con un fundido corto).
  const avanzar = useCallback(() => {
    const e = estado.current
    if (e.cambiando) return
    if (!e.completo) {
      e.completo = true
      inicio.current = performance.now() - duracion(e.indice).escritura * 1000
      setCompleto(true)
      return
    }
    if (e.indice >= ULTIMO) return
    e.cambiando = true
    e.saliendo = true
    setSaliendo(true)
    window.setTimeout(() => ir(e.indice + 1), 380)
  }, [ir])

  const retroceder = useCallback(() => {
    const e = estado.current
    if (e.cambiando || e.indice === 0) return
    ir(e.indice - 1)
  }, [ir])

  // Teclado, rueda y deslizar.
  useEffect(() => {
    let ultimaRueda = 0
    const alTecla = (evento: KeyboardEvent): void => {
      if (['ArrowRight', 'ArrowDown', ' ', 'Enter', 'PageDown'].includes(evento.key)) {
        evento.preventDefault()
        avanzar()
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(evento.key)) {
        evento.preventDefault()
        retroceder()
      }
    }
    const alRueda = (evento: WheelEvent): void => {
      const ahora = performance.now()
      if (Math.abs(evento.deltaY) < 25 || ahora - ultimaRueda < 900) return
      ultimaRueda = ahora
      if (evento.deltaY > 0) avanzar()
      else retroceder()
    }
    window.addEventListener('keydown', alTecla)
    window.addEventListener('wheel', alRueda, { passive: true })
    return () => {
      window.removeEventListener('keydown', alTecla)
      window.removeEventListener('wheel', alRueda)
    }
  }, [avanzar, retroceder])

  const toque = useRef<{ x: number; y: number } | null>(null)

  return (
    <div
      className="carta-estrellada"
      lang="es"
      role="document"
      onClick={avanzar}
      onTouchStart={(evento) => {
        const t = evento.touches[0]
        toque.current = { x: t.clientX, y: t.clientY }
      }}
      onTouchEnd={(evento) => {
        const inicioToque = toque.current
        toque.current = null
        if (!inicioToque) return
        const t = evento.changedTouches[0]
        const dx = t.clientX - inicioToque.x
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(t.clientY - inicioToque.y)) {
          evento.preventDefault()
          if (dx < 0) avanzar()
          else retroceder()
        }
      }}
    >
      <p className="sr-only" aria-live="polite">
        {TEXTOS[indice]}
      </p>
      <Parrafo key={indice} indice={indice} completo={completo} saliendo={saliendo} />
      {alFinal ? (
        <button
          type="button"
          aria-label="Volver a leer la carta"
          className="carta-releer"
          onClick={(evento) => {
            evento.stopPropagation()
            ir(0)
          }}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={TINTA} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12 A7 7 0 1 1 16.9 7" />
            <path d="M17.6 3.4 L17.2 7.4 L13.2 7.1" />
          </svg>
        </button>
      ) : (
        <div className="carta-progreso" aria-hidden="true">
          {TEXTOS.map((_, i) => (
            <Estrellita key={i} llena={i <= indice} />
          ))}
        </div>
      )}
    </div>
  )
}

export function CartaEstrellada() {
  const fase = useSyncExternalStore(suscribirCarta, faseCarta, () => 'cerrada' as const)

  // Abierta la cajita, la página no se desplaza (la cámara ya no se mueve): ni rueda, ni dedo, ni
  // teclas de desplazamiento.
  useEffect(() => {
    if (fase === 'cerrada') return
    const raiz = document.documentElement
    const antes = raiz.style.overflow
    raiz.style.overflow = 'hidden'
    const impedir = (evento: Event): void => evento.preventDefault()
    const impedirTeclas = (evento: KeyboardEvent): void => {
      if ([' ', 'PageDown', 'PageUp', 'Home', 'End', 'ArrowDown', 'ArrowUp'].includes(evento.key)) evento.preventDefault()
    }
    window.addEventListener('wheel', impedir, { passive: false })
    window.addEventListener('touchmove', impedir, { passive: false })
    window.addEventListener('keydown', impedirTeclas)
    return () => {
      raiz.style.overflow = antes
      window.removeEventListener('wheel', impedir)
      window.removeEventListener('touchmove', impedir)
      window.removeEventListener('keydown', impedirTeclas)
    }
  }, [fase])

  return fase === 'leyendo' ? <Carta /> : null
}
