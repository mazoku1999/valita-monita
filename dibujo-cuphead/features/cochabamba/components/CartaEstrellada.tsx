'use client'

import { type CSSProperties, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { CARTA_PARRAFOS, ajustarComas } from '../constantes/carta'
import { faseCarta, salirDeLaCarta, suscribirCarta } from '../store/carta'
import { paseoActivo } from '../store/paseo'
import { desbloquearMusicaCarta, pararMusicaCarta, sonarMusicaCarta } from '../utils/musicaCarta'

/**
 * La carta del final bajo "La noche estrellada" (ver `store/carta.ts`), como una carta de verdad: un
 * sobre de papel crema con su sello de lacre (un girasol) llega desde abajo, el sello salta, la
 * solapa se abre, la carta asoma y el sobre se va mientras la hoja se despliega en el centro. La
 * hoja: papel con su grano y los dobleces, un girasol dibujado en la esquina y el texto del usuario
 * escrito a mano (Caveat) con tinta azul; la despedida, en tinta roja. Si no cabe, se desplaza
 * dentro de la hoja.
 *
 * Botones de cristal (modernos, sin textos): arriba a la izquierda, salir (de vuelta al corazón de
 * flores; también con Escape); arriba a la derecha, guardar o sacar la carta para ver el cielo.
 * Mientras tanto la página no se desplaza: la cámara ya no se mueve. Y suena, bajita, la música de
 * la carta (ver `utils/musicaCarta.ts`).
 */

const TEXTOS = CARTA_PARRAFOS.map(ajustarComas)
const ULTIMO = TEXTOS.length - 1

/** Pasos del sobre: llega, se abre, la carta sale y, en `carta`, se despliega la hoja. */
type Paso = 'entra' | 'abre' | 'sale' | 'carta'

function BotonCristal({ etiqueta, alPulsar, clase, children }: { etiqueta: string; alPulsar: () => void; clase: string; children: ReactNode }) {
  return (
    <button type="button" aria-label={etiqueta} className={`boton-cristal ${clase}`} onClick={alPulsar}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  )
}

/** Un girasol dibujado a tinta, como los del campo (el adorno de la hoja y el sello del sobre). */
function Girasol({ className, tallo = true }: { className?: string; tallo?: boolean }) {
  const petalos = Array.from({ length: 14 }, (_, i) => (i * 360) / 14)
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      {tallo && (
        <>
          <path d="M50 52 C48 70 44 84 42 100" fill="none" stroke="#3f6b2a" strokeWidth="4" strokeLinecap="round" />
          <path d="M45 78 C55 68 70 68 76 74 C68 84 54 86 45 78 Z" fill="#6f9c3e" stroke="#20160d" strokeWidth="1.6" />
          <path d="M47 77 C56 73 64 72 72 74" fill="none" stroke="#3f6b2a" strokeWidth="1.2" />
        </>
      )}
      {petalos.map((giro) => (
        <ellipse key={giro} cx="50" cy="22" rx="6.5" ry="13" fill="#f6c444" stroke="#20160d" strokeWidth="1.5" transform={`rotate(${giro} 50 40)`} />
      ))}
      <circle cx="50" cy="40" r="12.5" fill="#6b3d1c" stroke="#20160d" strokeWidth="1.6" />
      <circle cx="46" cy="36" r="4" fill="#8a5428" />
    </svg>
  )
}

function Sobre({ paso }: { paso: Paso }) {
  return (
    <div className="sobre" data-paso={paso} aria-hidden="true">
      <div className="sobre-dorso" />
      <div className="sobre-hoja">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="sobre-frente" />
      <div className="sobre-solapa" />
      <div className="sobre-sello">
        <Girasol className="sobre-sello-girasol" tallo={false} />
      </div>
    </div>
  )
}

function Hoja({ oculta, saliendo }: { oculta: boolean; saliendo: boolean }) {
  const desplazable = useRef<HTMLDivElement>(null)
  // La flechita de "sigue" mientras quede carta por leer abajo.
  const [quedaMas, setQuedaMas] = useState(false)
  // Con el foco en la hoja, las flechas y el espacio la desplazan.
  useEffect(() => {
    const t = window.setTimeout(() => desplazable.current?.focus({ preventScroll: true }), 900)
    return () => window.clearTimeout(t)
  }, [])
  useEffect(() => {
    const nodo = desplazable.current
    if (!nodo) return
    const revisar = (): void => setQuedaMas(nodo.scrollHeight - nodo.clientHeight - nodo.scrollTop > 40 && nodo.scrollTop < 30)
    revisar()
    nodo.addEventListener('scroll', revisar, { passive: true })
    window.addEventListener('resize', revisar)
    return () => {
      nodo.removeEventListener('scroll', revisar)
      window.removeEventListener('resize', revisar)
    }
  }, [])
  return (
    <article className={`hoja ${oculta ? 'hoja-oculta' : ''} ${saliendo ? 'hoja-saliendo' : ''}`} aria-label="Carta" aria-hidden={oculta}>
      <div className="hoja-pliegues" aria-hidden="true" />
      <div ref={desplazable} className="hoja-desplazable" tabIndex={0} lang="es">
        <Girasol className="hoja-girasol" />
        {TEXTOS.map((texto, i) => (
          <p key={i} className={i === 0 ? 'hoja-saludo' : i === ULTIMO ? 'hoja-despedida' : undefined} style={{ '--i': i } as CSSProperties}>
            {texto}
          </p>
        ))}
      </div>
      <div className="hoja-sigue" data-oculta={quedaMas ? undefined : ''} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9.5 L12 15.5 L18 9.5" />
        </svg>
      </div>
    </article>
  )
}

export function CartaEstrellada() {
  const fase = useSyncExternalStore(suscribirCarta, faseCarta, () => 'cerrada' as const)
  const [paso, setPaso] = useState<Paso>('entra')
  const [sobreFuera, setSobreFuera] = useState(false)
  const [oculta, setOculta] = useState(false)
  const [hojaMostrada, setHojaMostrada] = useState(false)

  // El sobre: llega, se abre, sale la carta y se despliega la hoja.
  useEffect(() => {
    if (fase !== 'leyendo') return
    setPaso('entra')
    setSobreFuera(false)
    setOculta(false)
    const pasos = [
      window.setTimeout(() => setPaso('abre'), 1050),
      window.setTimeout(() => setPaso('sale'), 1800),
      window.setTimeout(() => {
        setPaso('carta')
        setHojaMostrada(true)
      }, 2550),
      window.setTimeout(() => setSobreFuera(true), 3400),
    ]
    return () => pasos.forEach((t) => window.clearTimeout(t))
  }, [fase])

  useEffect(() => {
    if (fase === 'cerrada') setHojaMostrada(false)
  }, [fase])

  // La música: suena al abrir la cajita (mientras cae la noche) y se para al salir.
  useEffect(() => {
    if (fase === 'abriendo') sonarMusicaCarta()
    else if (fase === 'saliendo' || fase === 'cerrada') pararMusicaCarta()
  }, [fase])

  // Paseando, cada gesto la deja lista para sonar (la cajita se abre en un fotograma, no en el gesto).
  useEffect(() => {
    const tipos = ['pointerdown', 'keydown', 'touchend'] as const
    const alGesto = (): void => {
      if (paseoActivo() && faseCarta() === 'cerrada') desbloquearMusicaCarta()
    }
    for (const tipo of tipos) window.addEventListener(tipo, alGesto, { capture: true, passive: true })
    return () => {
      for (const tipo of tipos) window.removeEventListener(tipo, alGesto, true)
    }
  }, [])

  // Abierta la cajita, la página no se desplaza (la cámara ya no se mueve), salvo dentro de la hoja;
  // Escape sale.
  useEffect(() => {
    if (fase === 'cerrada') return
    const raiz = document.documentElement
    const antes = raiz.style.overflow
    raiz.style.overflow = 'hidden'
    const enLaHoja = (evento: Event): boolean => evento.target instanceof Element && evento.target.closest('.hoja-desplazable') !== null
    const impedir = (evento: Event): void => {
      if (!enLaHoja(evento)) evento.preventDefault()
    }
    const alTecla = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') {
        salirDeLaCarta()
        return
      }
      if (!enLaHoja(evento) && [' ', 'PageDown', 'PageUp', 'Home', 'End', 'ArrowDown', 'ArrowUp'].includes(evento.key)) evento.preventDefault()
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
  }, [fase])

  if (fase === 'cerrada') return null
  const leyendo = fase === 'leyendo'
  return (
    <div className="carta-escena" data-fase={fase}>
      {fase !== 'saliendo' && (
        <BotonCristal etiqueta="Salir y volver al campo de flores" alPulsar={salirDeLaCarta} clase="boton-salir">
          <path d="M14.5 6 L8.5 12 L14.5 18" />
        </BotonCristal>
      )}
      {leyendo && paso === 'carta' && (
        <BotonCristal etiqueta={oculta ? 'Mostrar la carta' : 'Guardar la carta y ver el cielo'} alPulsar={() => setOculta((o) => !o)} clase="boton-alternar">
          {oculta ? (
            <>
              <rect x="3.5" y="6" width="17" height="12" rx="2" />
              <path d="M4 7 L12 13 L20 7" />
            </>
          ) : (
            <>
              <path d="M12 3.5 L13.9 9.2 L19.8 9.2 L15 12.8 L16.8 18.5 L12 15 L7.2 18.5 L9 12.8 L4.2 9.2 L10.1 9.2 Z" />
            </>
          )}
        </BotonCristal>
      )}
      {leyendo && !sobreFuera && <Sobre paso={paso} />}
      {hojaMostrada && <Hoja oculta={oculta} saliendo={fase === 'saliendo'} />}
    </div>
  )
}
