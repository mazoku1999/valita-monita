'use client'

import { useEffect } from 'react'

/**
 * Sin zoom (lo pidió el usuario: ni pellizcando ni con doble toque o doble clic, en el celular ni en
 * la web): el navegador no amplía la página. En los móviles lo impiden la ventana (`userScalable:
 * false` en `app/layout.tsx`) y `touch-action` (ver `globals.css`); en Safari (iPhone y Mac), que
 * no siempre los respeta, también sus gestos de pellizco; en el ordenador, el pellizco del trackpad
 * y Ctrl + rueda, que llegan como una rueda con Ctrl.
 */
export function useSinZoom(): void {
  useEffect(() => {
    const impedir = (evento: Event): void => evento.preventDefault()
    const alRueda = (evento: WheelEvent): void => {
      if (evento.ctrlKey || evento.metaKey) evento.preventDefault()
    }
    const gestos = ['gesturestart', 'gesturechange', 'gestureend'] as const
    for (const tipo of gestos) document.addEventListener(tipo, impedir, { passive: false })
    window.addEventListener('wheel', alRueda, { passive: false })
    return () => {
      for (const tipo of gestos) document.removeEventListener(tipo, impedir)
      window.removeEventListener('wheel', alRueda)
    }
  }, [])
}
