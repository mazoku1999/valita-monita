'use client'

import { type CSSProperties, type ComponentType, useId } from 'react'
import type { MotivoEscena } from '../constantes/escenas'

/**
 * Las escenas de fondo de la letra (ver `constantes/escenas.ts`): detrás de la línea que se canta,
 * un motivo dibujado a tinta clara con colores planos, como en el dibujo animado, que se dibuja,
 * crece o se mueve mientras dura la línea; al cambiar de línea, el anterior se desvanece y entra el
 * siguiente. Cada escena es un SVG a pantalla completa con su origen en el centro de la letra: lo
 * que cabe en ±100 se ve en cualquier pantalla (en el ordenador queda más sitio a los lados; en un
 * móvil, arriba y abajo). Las animaciones son de CSS (y algún recorrido SVG) y empiezan al montarse
 * la escena, que se monta cuando la línea llega al centro.
 */

const v = (variables: Record<string, string | number>): CSSProperties => variables as CSSProperties

/** Números pseudoaleatorios fijos (las escenas son siempre iguales). */
function azar(semilla: number): () => number {
  let s = semilla
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/** Estrella de `puntas` puntas, radios exterior e interior, centrada en el origen. */
function estrella(r1: number, r2: number, puntas = 5): string {
  const puntos: string[] = []
  for (let i = 0; i < puntas * 2; i++) {
    const r = i % 2 === 0 ? r1 : r2
    const a = (Math.PI * i) / puntas - Math.PI / 2
    puntos.push(`${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`)
  }
  return `M ${puntos.join(' L ')} Z`
}

/** Una cuña de un sol de rayos (del centro hacia afuera). */
function cuna(i: number, total: number, radio: number): string {
  const a0 = (2 * Math.PI * i) / total
  const a1 = (2 * Math.PI * (i + 0.5)) / total
  return `M 0 0 L ${(radio * Math.cos(a0)).toFixed(1)} ${(radio * Math.sin(a0)).toFixed(1)} L ${(radio * Math.cos(a1)).toFixed(1)} ${(radio * Math.sin(a1)).toFixed(1)} Z`
}

const NUBE = 'M -45 15 C -62 15 -62 -9 -42 -9 C -40 -29 -12 -33 -4 -19 C 4 -39 40 -35 38 -12 C 57 -12 59 15 42 15 Z'
const HOJA = 'M 0 -10 C 7 -6 8 4 0 10 C -8 4 -7 -6 0 -10 Z'

/** Ondas de sonido que se abren desde la letra. */
function Ondas() {
  return (
    <g className="m-ondas">
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} className="tinta onda" r={30} style={v({ '--r': `${i * 0.75}s` })} />
      ))}
    </g>
  )
}

/** Una estrella que sube hasta lo más alto y se queda meciéndose, con sus chispas. */
function Estrella() {
  const chispas: [number, number, number][] = [
    [52, -70, 0.9],
    [104, -62, 1.1],
    [64, -30, 1.3],
    [112, -24, 1.5],
  ]
  return (
    <g className="m-estrella">
      <g className="sube">
        <circle className="halo" r={30} />
        <g className="mece">
          <path className="tinta oro" d={estrella(17, 7.5)} />
        </g>
      </g>
      {chispas.map(([x, y, r], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <g className="estalla" style={v({ '--r': `${r}s` })}>
            <path className="tinta oro" d={estrella(4, 1.4, 4)} />
          </g>
        </g>
      ))}
    </g>
  )
}

const SENDERO = 'M -112 46 C -82 -6 -56 72 -28 22 S 8 -44 30 6 S 70 64 112 -32'

/** Un sendero que tantea: se dibuja buscando, con un farolito que lo recorre. */
function Sendero() {
  return (
    <g className="m-sendero">
      <path className="tinta punteado" d={SENDERO} />
      <path className="tinta dibuja" d={SENDERO} pathLength={1} style={v({ '--t': '3.2s' })} />
      <circle className="farol" r={4}>
        <animateMotion dur="3.2s" fill="freeze" path={SENDERO} calcMode="spline" keyTimes="0;1" keySplines="0.45 0.05 0.3 1" />
      </circle>
    </g>
  )
}

const TRAZO = 'M -116 36 C -62 36 -40 -6 0 -6 S 70 28 112 -24'

/** El camino, encontrado: un trazo decidido que acaba en una chispa. */
function Trazo() {
  return (
    <g className="m-trazo">
      <path className="tinta gruesa dibuja" d={TRAZO} pathLength={1} style={v({ '--t': '1.3s' })} />
      <g transform="translate(112 -24)">
        <g className="estalla" style={v({ '--r': '1.15s' })}>
          <path className="tinta oro" d={estrella(9, 3, 4)} />
        </g>
      </g>
    </g>
  )
}

/** Un reloj con las agujas desbocadas que se deshace en estrellas. */
function Reloj() {
  return (
    <g className="m-reloj">
      <circle className="tinta dibuja esfera" r={64} pathLength={1} style={v({ '--t': '1.4s' })} />
      {Array.from({ length: 12 }, (_, i) => (
        <g key={i} transform={`rotate(${i * 30})`}>
          <g transform="translate(0 -56)">
            <g className="tic" style={v({ '--r': `${1.8 + i * 0.07}s` })}>
              <path className="tinta oro" d={i % 3 === 0 ? estrella(4, 1.5, 4) : estrella(2.6, 1, 4)} />
            </g>
          </g>
        </g>
      ))}
      <g className="agujas">
        <line className="tinta gruesa aguja-h" x1={0} y1={0} x2={0} y2={-30} />
        <line className="tinta aguja-m" x1={0} y1={0} x2={0} y2={-48} />
        <circle className="tinta oro" r={3} />
      </g>
    </g>
  )
}

/** Estrellas que aparecen y se unen al azar, sin por qué. */
function Constelacion() {
  const r = azar(9)
  const puntos = Array.from({ length: 9 }, () => [(r() * 2 - 1) * 128, (r() * 2 - 1) * 84] as const)
  return (
    <g className="m-constelacion">
      {puntos.slice(1).map((p, i) => (
        <line
          key={i}
          className="tinta fina dibuja"
          x1={puntos[i][0]}
          y1={puntos[i][1]}
          x2={p[0]}
          y2={p[1]}
          pathLength={1}
          style={v({ '--t': '0.6s', '--r': `${0.4 + i * 0.32}s` })}
        />
      ))}
      {puntos.map(([x, y], i) => (
        <g key={i} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
          <g className="estalla" style={v({ '--r': `${i * 0.32}s` })}>
            <path className="tinta oro" d={estrella(5, 1.8, 4)} />
          </g>
        </g>
      ))}
    </g>
  )
}

/** Dos luces que se buscan en espiral hasta girar juntas. */
function Imanes() {
  return (
    <g className="m-imanes">
      <circle className="tinta fina punteado" r={92} />
      <g className="gira">
        <g className="acerca-a">
          <circle className="halo" r={13} />
          <circle className="tinta oro" r={6.5} />
        </g>
        <g className="acerca-b">
          <circle className="halo" r={13} />
          <circle className="tinta rosa" r={6.5} />
        </g>
      </g>
    </g>
  )
}

/** Un sol de rayos que se abre detrás de la letra y gira despacio. */
function Rayos() {
  return (
    <g className="m-rayos">
      <g className="abre">
        <g className="gira-lento">
          {Array.from({ length: 16 }, (_, i) => (
            <path key={i} className="cuna" d={cuna(i, 16, 190)} />
          ))}
        </g>
      </g>
      <circle className="nucleo" r={26} />
    </g>
  )
}

const ORBITA = 'M -96 0 A 96 34 0 1 1 96 0 A 96 34 0 1 1 -96 0'

/** Un planeta dando vueltas a un sol (sin cara). */
function Sol() {
  return (
    <g className="m-sol">
      <g className="abre">
        <g className="gira-lento">
          {Array.from({ length: 12 }, (_, i) => (
            <g key={i} transform={`rotate(${i * 30})`}>
              <path className="tinta rayo-sol" d="M 0 -40 Q 5 -47 0 -54 Q -5 -61 0 -67" />
            </g>
          ))}
        </g>
        <circle className="tinta disco-sol" r={32} />
      </g>
      <g transform="rotate(-10)">
        <path className="tinta fina punteado" d={ORBITA} />
        <g>
          <circle className="halo" r={11} />
          <circle className="tinta planeta" r={6} />
          <animateMotion dur="7s" repeatCount="indefinite" path={ORBITA} />
        </g>
      </g>
    </g>
  )
}

/** Muchas estrellas pequeñas y una que crece hasta ser la que más brilla. */
function Elegida() {
  const r = azar(21)
  const puntos = Array.from({ length: 34 }, () => [(r() * 2 - 1) * 150, (r() * 2 - 1) * 100, r()] as const)
  return (
    <g className="m-elegida">
      {puntos.map(([x, y, s], i) => (
        <circle key={i} className="punto" cx={x.toFixed(1)} cy={y.toFixed(1)} r={(0.7 + s * 1.3).toFixed(2)} style={v({ '--r': `${(s * 1.4).toFixed(2)}s` })} />
      ))}
      <g transform="translate(64 -54)">
        <g className="crece">
          <circle className="halo" r={24} />
          <path className="tinta oro" d={estrella(17, 4, 4)} />
        </g>
      </g>
    </g>
  )
}

/** Un cometa que se aleja (y otro, más pequeño, detrás). */
function Cometa() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <g className="m-cometa">
      <defs>
        <linearGradient id={`cola${id}`} x1="0" x2="1">
          <stop offset="0" stopColor="#fff0d0" stopOpacity="0" />
          <stop offset="1" stopColor="#fff0d0" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      {[0, 1].map((k) => (
        <g key={k} className={`vuela v${k}`}>
          <g transform="rotate(-36)">
            <path d="M -80 -4 Q -24 0 0 -5 L 0 5 Q -24 0 -80 4 Z" fill={`url(#cola${id})`} />
            <circle className="tinta cabeza" r={5} />
          </g>
        </g>
      ))}
    </g>
  )
}

const ELIPSE = 'M -58 0 A 58 22 0 1 1 58 0 A 58 22 0 1 1 -58 0'

/** Dos anillos entrelazados, cada uno con su estrella que lo recorre (en sentidos contrarios). */
function Anillos() {
  return (
    <g className="m-anillos">
      {[
        { x: -20, a: -22, clase: 'oro', puntos: '0;1', r: '0s' },
        { x: 20, a: 22, clase: 'rosa', puntos: '1;0', r: '0.4s' },
      ].map(({ x, a, clase, puntos, r }) => (
        <g key={x} transform={`translate(${x} 0) rotate(${a})`}>
          <path className="tinta gruesa dibuja" d={ELIPSE} pathLength={1} style={v({ '--t': '1.6s', '--r': r })} />
          <g>
            <circle className="halo" r={9} />
            <path className={`tinta ${clase}`} d={estrella(5.5, 2, 4)} />
            <animateMotion dur="5s" repeatCount="indefinite" path={ELIPSE} keyPoints={puntos} keyTimes="0;1" calcMode="linear" />
          </g>
        </g>
      ))}
    </g>
  )
}

/** Un girasol que se abre pétalo a pétalo detrás de la letra. */
function Girasol() {
  const semillas = Array.from({ length: 70 }, (_, i) => {
    const a = i * 2.39996
    const rr = 2.9 * Math.sqrt(i)
    return [rr * Math.cos(a), rr * Math.sin(a)] as const
  })
  return (
    <g className="m-girasol">
      <g className="gira-lento">
        {Array.from({ length: 20 }, (_, i) => (
          <g key={i} transform={`rotate(${i * 18})`}>
            <g transform="translate(0 -34)">
              <path className="tinta petalo" d="M 0 0 C 10 -10 10 -36 0 -48 C -10 -36 -10 -10 0 0 Z" style={v({ '--r': `${(i * 0.06).toFixed(2)}s` })} />
            </g>
          </g>
        ))}
        <circle className="tinta disco" r={30} />
        {semillas.map(([x, y], i) => (
          <circle key={i} className="semilla" cx={x.toFixed(1)} cy={y.toFixed(1)} r={1.3} style={v({ '--r': `${(1.1 + i * 0.012).toFixed(3)}s` })} />
        ))}
      </g>
    </g>
  )
}

/** Una tormenta: nubes oscuras, rayos que destellan y lluvia. */
function Tormenta() {
  const r = azar(5)
  const gotas = Array.from({ length: 22 }, () => [(r() * 2 - 1) * 160, r()] as const)
  return (
    <g className="m-tormenta">
      {gotas.map(([x, s], i) => (
        <line
          key={i}
          className="gota"
          x1={x.toFixed(1)}
          y1={-60}
          x2={(x - 4).toFixed(1)}
          y2={-48}
          style={v({ '--r': `${(s * 1.2).toFixed(2)}s`, '--d': `${(0.8 + s * 0.5).toFixed(2)}s` })}
        />
      ))}
      <path className="tinta rayo" d="M -26 -46 L -36 -20 L -24 -20 L -34 6" />
      <path className="tinta rayo r2" d="M 52 -44 L 44 -24 L 54 -24 L 46 -4" />
      <g transform="translate(-32 -62) scale(1.15)">
        <g className="flota">
          <path className="tinta nube-oscura" d={NUBE} />
        </g>
      </g>
      <g transform="translate(50 -58) scale(0.85)">
        <g className="flota f2">
          <path className="tinta nube-oscura" d={NUBE} />
        </g>
      </g>
    </g>
  )
}

/** Dos nubes que se separan, cada una por su lado. */
function Nubes() {
  return (
    <g className="m-nubes">
      <g transform="translate(-12 -44)">
        <g className="se-va izq">
          <path className="tinta nube" d={NUBE} />
        </g>
      </g>
      <g transform="translate(16 40) scale(0.85)">
        <g className="se-va der">
          <path className="tinta nube" d={NUBE} />
        </g>
      </g>
    </g>
  )
}

/** El cielo que se abre: las nubes se apartan y baja la luz. */
function Claro() {
  return (
    <g className="m-claro">
      <g className="luz">
        {[-3, -2, -1, 0, 1, 2, 3].map((k) => (
          <path key={k} className="haz" d={`M ${k * 6} -120 L ${k * 34 - 9} 120 L ${k * 34 + 9} 120 Z`} />
        ))}
      </g>
      <g transform="translate(-36 -80)">
        <g className="se-abre izq">
          <path className="tinta nube" d={NUBE} />
        </g>
      </g>
      <g transform="translate(36 -80)">
        <g className="se-abre der">
          <path className="tinta nube" d={NUBE} />
        </g>
      </g>
    </g>
  )
}

/** Un brote que crece desde abajo y abre sus dos hojas. */
function Brote() {
  return (
    <g className="m-brote">
      <path className="tinta" d="M -64 94 Q 0 80 64 94" />
      <path className="tinta gruesa dibuja tallo" d="M 0 90 C -7 64 8 44 0 18" pathLength={1} style={v({ '--t': '1.5s' })} />
      <g transform="translate(0 36)">
        <g className="hoja-brota" style={v({ '--r': '1.1s' })}>
          <path className="tinta verde" d="M 0 0 C -10 -14 -30 -12 -36 -2 C -24 7 -8 6 0 0 Z" />
        </g>
      </g>
      <g transform="translate(0 26)">
        <g className="hoja-brota" style={v({ '--r': '1.35s' })}>
          <path className="tinta verde" d="M 0 0 C 10 -14 30 -12 36 -2 C 24 7 8 6 0 0 Z" />
        </g>
      </g>
      <g transform="translate(0 14)">
        <g className="estalla" style={v({ '--r': '1.6s' })}>
          <path className="tinta oro" d={estrella(6, 2, 4)} />
        </g>
      </g>
    </g>
  )
}

/** Hojas que caen meciéndose, como el paso de los años. */
function Hojas() {
  const r = azar(33)
  return (
    <g className="m-hojas">
      {Array.from({ length: 11 }, (_, i) => {
        const x = (r() * 2 - 1) * 150
        return (
          <g key={i} transform={`translate(${x.toFixed(1)} -132)`}>
            <g
              className="cae"
              style={v({ '--r': `${(r() * 3.2).toFixed(2)}s`, '--d': `${(5 + r() * 3).toFixed(2)}s`, '--dx': `${((r() * 2 - 1) * 30).toFixed(1)}px` })}
            >
              <path className={`tinta otono c${i % 3}`} d={HOJA} />
              <path className="tinta fina" d="M 0 -9 L 0 9" />
            </g>
          </g>
        )
      })}
    </g>
  )
}

/** Fotos que flotan, con su luz de recuerdo. */
function Recuerdos() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const fotos: [number, number, number][] = [
    [-80, -44, -9],
    [76, -32, 7],
    [-56, 52, 5],
    [66, 58, -6],
  ]
  return (
    <g className="m-recuerdos">
      <defs>
        <radialGradient id={`sepia${id}`}>
          <stop offset="0" stopColor="#ffe6b8" stopOpacity="0.85" />
          <stop offset="1" stopColor="#c98a4b" stopOpacity="0.35" />
        </radialGradient>
      </defs>
      {fotos.map(([x, y, a], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${a})`}>
          <g className="foto" style={v({ '--r': `${i * 0.45}s` })}>
            <g className="flota" style={v({ '--r': `${1 + i * 0.45}s` })}>
              <rect className="tinta marco" x={-17} y={-20} width={34} height={40} rx={1.5} />
              <rect x={-13} y={-16} width={26} height={26} fill={`url(#sepia${id})`} />
            </g>
          </g>
        </g>
      ))}
    </g>
  )
}

const LINEA = 'M -124 42 C -94 -40 -62 62 -32 2 C -12 -40 10 -52 20 -12 C 30 30 60 42 72 2 C 82 -30 62 -62 42 -42 C 22 -22 62 12 92 -10 C 112 -24 122 -42 130 -62'

/** Una sola línea que se dibuja sola, despacio, como quien recorre un rostro con el dedo. */
function Contorno() {
  return (
    <g className="m-contorno">
      <path className="tinta dibuja" d={LINEA} pathLength={1} style={v({ '--t': '5s' })} />
      <g>
        <circle className="halo" r={8} />
        <circle className="pluma" r={3} />
        <animateMotion dur="5s" fill="freeze" path={LINEA} />
      </g>
    </g>
  )
}

const FIRMA = 'M -92 52 C -72 22 -52 72 -42 42 C -32 12 -12 62 -2 40 C 6 22 18 32 16 46 C 14 60 38 58 50 42 C 62 26 80 42 98 32'

/** Una firma con floritura (sin letras) que acaba en una chispa. */
function Firma() {
  return (
    <g className="m-firma">
      <path className="tinta gruesa dibuja" d={FIRMA} pathLength={1} style={v({ '--t': '2.6s' })} />
      <g transform="translate(98 32)">
        <g className="estalla" style={v({ '--r': '2.5s' })}>
          <path className="tinta oro" d={estrella(9, 3, 4)} />
        </g>
      </g>
    </g>
  )
}

/** Por defecto: unas estrellitas que titilan. */
function Cielo() {
  const r = azar(77)
  return (
    <g className="m-cielo">
      {Array.from({ length: 14 }, (_, i) => (
        <g key={i} transform={`translate(${((r() * 2 - 1) * 140).toFixed(1)} ${((r() * 2 - 1) * 95).toFixed(1)})`}>
          <g className="estalla" style={v({ '--r': `${(r() * 1.5).toFixed(2)}s` })}>
            <path className="tinta oro" d={estrella(3.5, 1.3, 4)} />
          </g>
        </g>
      ))}
    </g>
  )
}

const MOTIVOS: Record<MotivoEscena, ComponentType> = {
  ondas: Ondas,
  estrella: Estrella,
  sendero: Sendero,
  trazo: Trazo,
  reloj: Reloj,
  constelacion: Constelacion,
  imanes: Imanes,
  rayos: Rayos,
  sol: Sol,
  elegida: Elegida,
  cometa: Cometa,
  anillos: Anillos,
  girasol: Girasol,
  tormenta: Tormenta,
  nubes: Nubes,
  claro: Claro,
  brote: Brote,
  hojas: Hojas,
  recuerdos: Recuerdos,
  contorno: Contorno,
  firma: Firma,
  cielo: Cielo,
}

export interface EscenaVisible {
  readonly indice: number
  readonly motivo: MotivoEscena
  /** `actual`: se ve; `sale`: se desvanece. */
  readonly estado: 'actual' | 'sale'
}

export function EscenasLetra({ escenas }: { escenas: readonly EscenaVisible[] }) {
  return (
    <div className="letras-escenas" aria-hidden="true">
      {escenas.map(({ indice, motivo, estado }) => {
        const Motivo = MOTIVOS[motivo]
        return (
          <svg key={indice} className="escena" data-estado={estado} data-motivo={motivo} viewBox="-100 -100 200 200" preserveAspectRatio="xMidYMid meet">
            <g transform="translate(0 -6)">
              <Motivo />
            </g>
          </svg>
        )
      })}
    </div>
  )
}
