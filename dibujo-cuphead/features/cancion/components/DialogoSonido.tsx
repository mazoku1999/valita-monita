'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { CANCION } from '../constantes/cancion'
import { estadoDelSonido, permitirSonido, suscribirSonido } from '../utils/audio'

/** La página quieta mientras está el diálogo (en el iPhone, `overflow` solo no basta con el dedo). */
function quietarPagina(): () => void {
  const raiz = document.documentElement
  const antes = raiz.style.overflow
  raiz.style.overflow = 'hidden'
  const impedir = (evento: Event): void => evento.preventDefault()
  window.addEventListener('wheel', impedir, { passive: false })
  window.addEventListener('touchmove', impedir, { passive: false })
  return () => {
    raiz.style.overflow = antes
    window.removeEventListener('wheel', impedir)
    window.removeEventListener('touchmove', impedir)
  }
}

/**
 * Al abrir la página, antes de nada: un cartel que hay que presionar para activar el sonido (lo
 * pidió el usuario en lugar del botón de cristal que, con su animación, iba del centro a la
 * esquina). Los navegadores sólo dejan sonar después de un gesto, y así la canción del agujero
 * suena desde el principio. Mientras está, la página no se desplaza y sólo se cierra con él. De
 * papel crema con tinta, como el resto del dibujo; quieto, sin brillos.
 */
export function DialogoSonido() {
  const estado = useSyncExternalStore(suscribirSonido, estadoDelSonido, () => 'pendiente' as const)
  const abierto = estado === 'pendiente'
  const boton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!abierto) return
    boton.current?.focus({ preventScroll: true })
    return quietarPagina()
  }, [abierto])

  if (!abierto) return null
  return (
    <div
      className="dialogo-sonido"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialogo-sonido-texto"
      // Tocar fuera no lo cierra ni le quita el foco al botón (con el teclado, Enter sigue valiendo).
      onPointerDown={(evento) => {
        if (evento.target === evento.currentTarget) evento.preventDefault()
      }}
    >
      <button ref={boton} type="button" className="dialogo-sonido-boton" onClick={() => permitirSonido(CANCION.audio)}>
        <svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3.5 9.4 H7 L11.6 5.6 V18.4 L7 14.6 H3.5 Z" fill="currentColor" />
          <path d="M15.1 9.2 C16.4 10.6 16.4 13.4 15.1 14.8" />
          <path d="M17.8 6.6 C20.6 9.3 20.6 14.7 17.8 17.4" />
        </svg>
        <span id="dialogo-sonido-texto">Presiona aquí para activar el sonido</span>
      </button>
    </div>
  )
}
