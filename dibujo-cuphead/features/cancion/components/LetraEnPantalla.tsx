'use client'

import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { CANCION } from '../constantes/cancion'
import { tiempoCancion } from '../utils/audio'
import type { LineaMaquetada, PalabraMaquetada } from '../utils/maqueta'

/**
 * La letra en pantalla, animada palabra por palabra como en los videos de letras: la línea que se
 * canta, grande en el centro, en filas cortas de voces distintas, y la anterior, pequeña y apagada
 * arriba. Antes de cantarse, cada palabra es apenas una sombra; al cantarse aparece (sube, se
 * enfoca y da un pequeño salto con un destello), se pinta del color de la sección de izquierda a
 * derecha mientras dura y, al terminar, se asienta en blanco cálido (las palabras clave, con un
 * tinte del color). De las palabras clave saltan dos chispas. Detrás, un velo oscuro para que se
 * lea, un halo suave del color de la sección (oro en la primera estrofa, celeste en la segunda,
 * rosa en el estribillo) y chispas finas que suben despacio. Nada late al compás.
 *
 * Cada palabra se enciende exactamente mientras se canta (los tiempos de la letra, palabra por
 * palabra). La línea llega al centro un instante antes de su primera palabra (sin cortar la
 * anterior, salvo que ésta se cante hasta el mismo instante: entonces le cede el centro un poco
 * antes y termina de pintarse arriba) y se va a su fin (si la siguiente llega enseguida, le deja
 * el sitio).
 * Todo se calcula con el reloj del audio (no con transiciones): si se salta o el audio se detiene a
 * cargar, la letra va con él.
 */

type Rol = 'actual' | 'apagada' | 'anterior' | 'ida' | 'siguiente'

interface Estado {
  readonly actual: number
  readonly mostrarActual: boolean
  readonly pronto: boolean
}

/** Cuánto antes de su primera palabra llega una línea al centro (s), sin cortar la anterior... */
const ANTELACION = 0.35
/** ...salvo que la anterior se cante hasta el mismo instante: entonces llega esto antes (s). */
const ANTELACION_MINIMA = 0.22
/** Si la siguiente llega antes de esto (s) tras el fin de una línea, ésta sigue hasta que llegue. */
const ENLACE = 0.9
/** Cuánto sigue una línea tras su última palabra, para que ésta se asiente (s). */
const COLA = 0.3
/** Con cuánta antelación aparece el fondo de la letra antes de una línea (s). */
const PREVIA = 1.4

const paleta = (linea: LineaMaquetada): string => (linea.estribillo ? 'rosa' : linea.seccion % 2 === 0 ? 'oro' : 'celeste')

const limitar = (x: number): number => Math.min(1, Math.max(0, x))
const suave = (x: number): number => {
  const y = limitar(x)
  return y * y * (3 - 2 * y)
}

/** Chispas finas que suben despacio por detrás de la letra (posiciones fijas, pseudoaleatorias). */
const CHISPAS = Array.from({ length: 18 }, (_, i) => {
  const azar = (k: number): number => {
    const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453
    return v - Math.floor(v)
  }
  return {
    left: `${(4 + azar(1) * 92).toFixed(1)}%`,
    '--s': `${(1.6 + azar(3) * 2.4).toFixed(1)}px`,
    '--d': `${(11 + azar(2) * 10).toFixed(1)}s`,
    '--r': `${(-azar(4) * 21).toFixed(1)}s`,
    '--o': (0.3 + azar(5) * 0.5).toFixed(2),
    '--dx': `${((azar(6) - 0.5) * 6).toFixed(1)}vw`,
  } as CSSProperties
})

function Palabra({ palabra }: { palabra: PalabraMaquetada }) {
  return (
    <span
      className="letra-palabra"
      data-acento={palabra.acento ? '' : undefined}
      data-fase="sombra"
      data-inicio={palabra.inicio}
      data-fin={palabra.fin}
    >
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

/** Lo último que se escribió en cada palabra (para no repintar las que no cambian). */
const escrito = new WeakMap<HTMLElement, string>()

/**
 * Anima las palabras (directo en el DOM, cada fotograma, con el reloj del audio):
 * --a, cuánto ha aparecido; --x, cuánto se ha cantado (la pintura de izquierda a derecha); --g, el
 * salto y el destello del comienzo; --f, cuánto se ha asentado al terminar; --c y --cs, el vuelo de
 * las chispas (y su brillo). data-fase dice si es una sombra (aún no se canta), si está viva
 * (apareciendo, cantándose o asentándose: sólo entonces lleva filtros) o si ya está hecha. Sólo se
 * escribe lo que cambia: las sombras y las hechas no se tocan.
 */
function animar(raiz: HTMLElement, t: number): void {
  for (const nodo of raiz.querySelectorAll<HTMLElement>('.letra-palabra')) {
    const inicio = Number(nodo.dataset.inicio)
    const fin = Number(nodo.dataset.fin)
    const desde = t - inicio
    const fase = desde < -0.06 ? 'sombra' : t > fin + 0.9 && desde > 0.9 ? 'hecha' : 'viva'
    const a = suave((desde + 0.06) / 0.3)
    const x = limitar(desde / Math.max(0.05, fin - inicio))
    const g = desde < 0 ? 0 : Math.exp(-desde / 0.34) * suave(desde / 0.05)
    const f = suave((t - fin) / 0.45)
    const c = limitar(desde / 0.8)
    const cs = desde < 0 ? 0 : Math.sin(Math.PI * c)
    const valores = `${fase}|${a.toFixed(3)}|${x.toFixed(3)}|${g.toFixed(3)}|${f.toFixed(3)}|${c.toFixed(3)}|${cs.toFixed(3)}`
    if (escrito.get(nodo) === valores) continue
    escrito.set(nodo, valores)
    if (nodo.dataset.fase !== fase) nodo.dataset.fase = fase
    nodo.style.setProperty('--a', a.toFixed(3))
    nodo.style.setProperty('--x', x.toFixed(3))
    nodo.style.setProperty('--g', g.toFixed(3))
    nodo.style.setProperty('--f', f.toFixed(3))
    nodo.style.setProperty('--c', c.toFixed(3))
    nodo.style.setProperty('--cs', cs.toFixed(3))
  }
}

export function LetraEnPantalla({ letra, activa }: { letra: readonly LineaMaquetada[] | null; activa: boolean }) {
  const raiz = useRef<HTMLDivElement>(null)
  const [estado, setEstado] = useState<Estado>({ actual: -1, mostrarActual: false, pronto: false })

  useEffect(() => {
    if (!activa || !letra || letra.length === 0) return
    let solicitud = 0
    const cuadro = (): void => {
      const t = tiempoCancion() - CANCION.desfaseLetra
      let actual = -1
      for (let i = 0; i < letra.length; i++) {
        const llegada = Math.max(
          letra[i].inicio - ANTELACION,
          i > 0 ? Math.min(letra[i - 1].fin, letra[i].inicio - ANTELACION_MINIMA) : -Infinity,
        )
        if (llegada <= t) actual = i
      }
      const linea = letra[actual]
      const siguiente = letra[actual + 1]
      const mostrarActual =
        actual >= 0 && (t < linea.fin + COLA || (siguiente !== undefined && siguiente.inicio - linea.fin < ENLACE))
      const pronto = siguiente !== undefined && siguiente.inicio - t < PREVIA
      setEstado((previo) =>
        previo.actual === actual && previo.mostrarActual === mostrarActual && previo.pronto === pronto
          ? previo
          : { actual, mostrarActual, pronto },
      )
      if (raiz.current) animar(raiz.current, t)
      solicitud = window.requestAnimationFrame(cuadro)
    }
    solicitud = window.requestAnimationFrame(cuadro)
    return () => window.cancelAnimationFrame(solicitud)
  }, [activa, letra])

  if (!letra || letra.length === 0) return null
  const { actual, mostrarActual, pronto } = estado
  const visibles: { linea: LineaMaquetada; rol: Rol }[] = []
  for (let i = Math.max(0, actual - 2); i <= Math.min(letra.length - 1, actual + 1); i++) {
    const linea = letra[i]
    let rol: Rol
    if (i === actual) rol = mostrarActual ? 'actual' : 'apagada'
    else if (i === actual - 1) rol = mostrarActual && letra[actual].inicio - linea.fin < 4 ? 'anterior' : 'ida'
    else if (i < actual) rol = 'ida'
    else rol = 'siguiente'
    visibles.push({ linea, rol })
  }
  const hayLetra = activa && (mostrarActual || pronto)
  const color = letra[mostrarActual ? actual : Math.min(letra.length - 1, actual + 1)]

  return (
    <div
      ref={raiz}
      className="letras"
      data-visible={hayLetra ? '' : undefined}
      data-paleta={color ? paleta(color) : undefined}
      aria-live="off"
    >
      <div className="letras-velo" />
      <div className="letras-aura" />
      <div className="letras-chispas" aria-hidden="true">
        {CHISPAS.map((estilo, i) => (
          <i key={i} style={estilo} />
        ))}
      </div>
      {visibles.map(({ linea, rol }) => (
        <Linea key={linea.indice} linea={linea} rol={rol} />
      ))}
    </div>
  )
}
