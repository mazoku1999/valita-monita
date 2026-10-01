'use client'

import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { CANCION } from '../constantes/cancion'
import { tiempoCancion } from '../utils/audio'
import type { LineaMaquetada, PalabraMaquetada } from '../utils/maqueta'

/**
 * La letra en pantalla, como en los videos de letras: la línea que se canta, grande en el centro,
 * en filas cortas de voces distintas; la anterior, pequeña y apagada arriba; la siguiente, pequeña
 * abajo, poco antes de llegar. Cada palabra se enciende de izquierda a derecha mientras se canta
 * (con un brillo que luego baja). El color de acento cambia por sección: oro en la primera estrofa,
 * celeste en la segunda y rosa en el estribillo.
 *
 * Cada palabra se enciende exactamente mientras se canta (los tiempos de la letra, palabra por
 * palabra). La línea llega al centro un instante antes de su primera palabra (si la anterior ya
 * terminó: nunca la corta) y se va a su fin (si la siguiente llega enseguida, le deja el sitio).
 * Sigue el reloj del audio (no el de la página): si el audio se detiene a cargar, la letra espera.
 */

type Rol = 'actual' | 'apagada' | 'anterior' | 'ida' | 'siguiente' | 'oculta'

interface Estado {
  readonly actual: number
  readonly mostrarActual: boolean
  readonly mostrarSiguiente: boolean
}

/** Cuánto antes de su primera palabra llega una línea al centro (s), sin cortar la anterior. */
const ANTELACION = 0.35
/** Cuánto antes se asoma la siguiente abajo (s). */
const ASOMO = 2.5
/** Si la siguiente llega antes de esto (s) tras el fin de una línea, ésta sigue hasta que llegue. */
const ENLACE = 0.9

const paleta = (linea: LineaMaquetada): string => (linea.estribillo ? 'rosa' : linea.seccion % 2 === 0 ? 'oro' : 'celeste')

const limitar = (x: number): number => Math.min(1, Math.max(0, x))

function Palabra({ palabra }: { palabra: PalabraMaquetada }) {
  return (
    <span className="letra-palabra" data-acento={palabra.acento ? '' : undefined} data-inicio={palabra.inicio} data-fin={palabra.fin}>
      {palabra.texto}
    </span>
  )
}

function Linea({ linea, rol }: { linea: LineaMaquetada; rol: Rol }) {
  return (
    <div
      className="letra-linea"
      data-indice={linea.indice}
      data-rol={rol}
      data-paleta={paleta(linea)}
      data-cierre={linea.cierre ? '' : undefined}
      aria-hidden={rol !== 'actual'}
    >
      {linea.filas.map((fila, f) => (
        <div key={f} className="letra-fila" data-estilo={fila.estilo} style={{ '--escala': fila.escala.toFixed(3) } as CSSProperties}>
          {fila.palabras.map((palabra, p) => (
            <Palabra key={p} palabra={palabra} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Enciende las palabras (directo en el DOM, cada fotograma): la luz que las recorre y su brillo. */
function encender(raiz: HTMLElement, t: number): void {
  for (const nodo of raiz.querySelectorAll<HTMLElement>('.letra-palabra')) {
    const inicio = Number(nodo.dataset.inicio)
    const fin = Number(nodo.dataset.fin)
    const x = limitar((t - inicio) / Math.max(0.05, fin - inicio))
    const brillo = t < inicio ? 0 : t <= fin ? x * x * (3 - 2 * x) : 0.32 + 0.68 * Math.exp(-(t - fin) / 0.7)
    nodo.style.setProperty('--x', x.toFixed(3))
    nodo.style.setProperty('--e', brillo.toFixed(3))
  }
}

export function LetraEnPantalla({ letra, activa }: { letra: readonly LineaMaquetada[] | null; activa: boolean }) {
  const raiz = useRef<HTMLDivElement>(null)
  const [estado, setEstado] = useState<Estado>({ actual: -1, mostrarActual: false, mostrarSiguiente: false })

  useEffect(() => {
    if (!activa || !letra || letra.length === 0) return
    let solicitud = 0
    const cuadro = (): void => {
      const t = tiempoCancion() - CANCION.desfaseLetra
      let actual = -1
      for (let i = 0; i < letra.length; i++) {
        const llegada = Math.max(letra[i].inicio - ANTELACION, i > 0 ? Math.min(letra[i - 1].fin, letra[i].inicio) : -Infinity)
        if (llegada <= t) actual = i
      }
      const linea = letra[actual]
      const siguiente = letra[actual + 1]
      const mostrarActual =
        actual >= 0 && (t < linea.fin || (siguiente !== undefined && siguiente.inicio - linea.fin < ENLACE))
      const mostrarSiguiente = siguiente !== undefined && siguiente.inicio - t < ASOMO
      setEstado((previo) =>
        previo.actual === actual && previo.mostrarActual === mostrarActual && previo.mostrarSiguiente === mostrarSiguiente
          ? previo
          : { actual, mostrarActual, mostrarSiguiente },
      )
      if (raiz.current) encender(raiz.current, t)
      solicitud = window.requestAnimationFrame(cuadro)
    }
    solicitud = window.requestAnimationFrame(cuadro)
    return () => window.cancelAnimationFrame(solicitud)
  }, [activa, letra])

  if (!letra || letra.length === 0) return null
  const { actual, mostrarActual, mostrarSiguiente } = estado
  const visibles: { linea: LineaMaquetada; rol: Rol }[] = []
  for (let i = Math.max(0, actual - 2); i <= Math.min(letra.length - 1, actual + 1); i++) {
    const linea = letra[i]
    let rol: Rol
    if (i === actual) rol = mostrarActual ? 'actual' : 'apagada'
    else if (i === actual - 1) rol = mostrarActual && letra[actual].inicio - linea.fin < 4 ? 'anterior' : 'ida'
    else if (i < actual) rol = 'ida'
    else rol = mostrarSiguiente ? 'siguiente' : 'oculta'
    visibles.push({ linea, rol })
  }
  const hayLetra = activa && (mostrarActual || mostrarSiguiente)

  return (
    <div ref={raiz} className="letras" data-visible={hayLetra ? '' : undefined} aria-live="off">
      <div className="letras-velo" />
      {visibles.map(({ linea, rol }) => (
        <Linea key={linea.indice} linea={linea} rol={rol} />
      ))}
    </div>
  )
}
