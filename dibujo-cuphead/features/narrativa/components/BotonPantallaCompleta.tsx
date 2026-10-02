'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { faseCarta, suscribirCarta } from '@/features/cochabamba/store/carta'
import { paseoActivo, suscribirPaseo } from '@/features/cochabamba/store/paseo'
import {
  avisoDeInicioAbierto,
  cerrarAvisoDeInicio,
  enPantallaCompleta,
  modoPantallaCompleta,
  pulsarPantallaCompleta,
  suscribirAvisoDeInicio,
  suscribirModo,
  suscribirPantallaCompleta,
} from '../store/pantallaCompleta'

/** El dibujo del botón: las cuatro esquinas hacia fuera (entrar) o hacia dentro (salir). */
export function IconoPantallaCompleta({ dentro }: { dentro: boolean }) {
  return dentro ? <path d="M9 4 V9 H4 M20 9 H15 V4 M15 20 V15 H20 M4 15 H9 V20" /> : <path d="M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15" />
}

/** Si hay que ofrecer el botón (con el navegador o, en el iPhone, el aviso de agregarla a inicio). */
export function usePantallaCompleta(): { ofrecer: boolean; dentro: boolean } {
  const modo = useSyncExternalStore(suscribirModo, modoPantallaCompleta, () => 'no' as const)
  const dentro = useSyncExternalStore(suscribirPantallaCompleta, enPantallaCompleta, () => false)
  return { ofrecer: modo === 'navegador' || modo === 'inicio', dentro }
}

/**
 * El botón de pantalla completa durante el viaje: de cristal, arriba a la derecha (el del sonido se
 * corre a su izquierda). En el paseo del final va entre sus botones (ver `ControlesPaseo`) y con la
 * carta abierta no hace falta. Ver `store/pantallaCompleta.ts`.
 */
export function BotonPantallaCompleta() {
  const { ofrecer, dentro } = usePantallaCompleta()
  const posado = useSyncExternalStore(suscribirPaseo, paseoActivo, () => false)
  const carta = useSyncExternalStore(suscribirCarta, faseCarta, () => 'cerrada' as const)
  const visible = ofrecer && !posado && carta === 'cerrada'

  // Con el botón en la esquina, el del sonido va a su lado (ver `globals.css`).
  useEffect(() => {
    if (!visible) return
    const raiz = document.documentElement
    raiz.dataset.botonPantalla = ''
    return () => {
      delete raiz.dataset.botonPantalla
    }
  }, [visible])

  if (!visible) return null
  return (
    <button
      type="button"
      className="boton-cristal boton-pantalla"
      aria-label={dentro ? 'Salir de la pantalla completa' : 'Pantalla completa'}
      aria-pressed={dentro}
      onClick={pulsarPantallaCompleta}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <IconoPantallaCompleta dentro={dentro} />
      </svg>
    </button>
  )
}

/** Cuánto se queda el aviso a la vista si no se toca (s). */
const AVISO_DURA = 14

/**
 * En el iPhone, al tocar el botón: cómo ver la página a pantalla completa (agregándola a inicio).
 * Un cartel de papel crema con tinta, como el resto del dibujo; se cierra al tocarlo o solo.
 */
export function AvisoPantallaCompleta() {
  const abierto = useSyncExternalStore(suscribirAvisoDeInicio, avisoDeInicioAbierto, () => false)
  useEffect(() => {
    if (!abierto) return
    const espera = window.setTimeout(cerrarAvisoDeInicio, AVISO_DURA * 1000)
    return () => window.clearTimeout(espera)
  }, [abierto])
  if (!abierto) return null
  return (
    <div className="aviso-pantalla" role="status" onClick={cerrarAvisoDeInicio}>
      <p>
        Para verla en pantalla completa en el iPhone: toca Compartir (en el menú ··· de Safari) y luego «Agregar a inicio».
        Después ábrela desde ese ícono.
      </p>
      <button type="button" aria-label="Cerrar el aviso" onClick={cerrarAvisoDeInicio}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6 L18 18 M18 6 L6 18" />
        </svg>
      </button>
    </div>
  )
}
