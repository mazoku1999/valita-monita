'use client'

import { ORDEN_VISTAS, VISTAS_CAMARA } from '../constantes/vistasCamara'
import { establecerVista, solicitarZoom, useModoLibre, useVistaCamara } from '../store/vistaCamaraStore'

const estiloBoton = (activo: boolean): string =>
  `cursor-pointer transition-colors duration-500 ${activo ? 'text-crema' : 'text-gris hover:text-crema/80'}`

/**
 * Selector de encuadre y zoom para la cabecera. Cada encuadre es un botón con `aria-pressed`;
 * cuando el usuario orbita o hace zoom a mano, el encuadre activo se atenúa y se enciende "Free":
 * volver a pulsar cualquier encuadre devuelve la cámara a él con un travelling.
 */
export function SelectorVista() {
  const vistaActiva = useVistaCamara()
  const libre = useModoLibre()
  const indice = ORDEN_VISTAS.indexOf(vistaActiva)
  const siguiente = ORDEN_VISTAS[(indice + 1) % ORDEN_VISTAS.length]

  return (
    <div
      role="group"
      aria-label="Camera"
      className="pointer-events-auto flex items-center gap-3 font-mono-narrativa text-[11px] uppercase tracking-[0.32em]"
    >
      <span className="hidden text-gris-tenue xl:inline">Angle</span>

      {/* Pantallas anchas: todos los encuadres a la vista. */}
      <span className="hidden items-center gap-3 xl:flex">
        {ORDEN_VISTAS.map((id, posicion) => {
          const vista = VISTAS_CAMARA[id]
          const activa = id === vistaActiva && !libre
          return (
            <span key={id} className="flex items-center gap-3">
              {posicion > 0 && (
                <span aria-hidden="true" className="text-gris-tenue">
                  /
                </span>
              )}
              <button
                type="button"
                aria-pressed={activa}
                title={vista.descripcion}
                onClick={() => establecerVista(id)}
                className={estiloBoton(activa)}
              >
                {vista.etiqueta}
              </button>
            </span>
          )
        })}
      </span>

      {/* Pantallas estrechas: un solo botón que recorre los encuadres. */}
      <button
        type="button"
        title={`Next angle: ${VISTAS_CAMARA[siguiente].etiqueta}`}
        onClick={() => establecerVista(siguiente)}
        className={`xl:hidden ${estiloBoton(!libre)}`}
      >
        {VISTAS_CAMARA[vistaActiva].etiqueta}
      </button>

      <span
        aria-live="polite"
        className={`transition-colors duration-500 ${libre ? 'text-oro' : 'text-gris-tenue'}`}
        title="Drag to orbit, pinch or Ctrl+scroll to zoom, + and − keys"
      >
        {libre ? 'Free' : '·'}
      </span>

      <span className="flex items-center gap-2" aria-label="Zoom">
        <button type="button" aria-label="Zoom out" onClick={() => solicitarZoom(-1)} className={estiloBoton(false)}>
          −
        </button>
        <button type="button" aria-label="Zoom in" onClick={() => solicitarZoom(1)} className={estiloBoton(false)}>
          +
        </button>
      </span>
    </div>
  )
}
