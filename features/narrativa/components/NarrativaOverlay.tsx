'use client'

import { useEffect } from 'react'
import { aplicarVistaDesdeUrl } from '@/features/agujero-negro/store/vistaCamaraStore'
import { useSincronizarScroll } from '../hooks/useSincronizarScroll'

/**
 * Sin textos en la interfaz (petición del usuario): ni cabecera, ni capítulo, ni epílogo, ni pie,
 * ni rail de progreso. Queda sólo el agujero negro. El recorrido de scroll se conserva con un
 * carril invisible de 640vh: la mitad para acercarse desde lejos al encuadre y la otra mitad para
 * la inmersión en el agujero y el anillo de papel final (ver `CamaraNarrativa`). Los encuadres se
 * eligen con `?vista=…` en la URL o arrastrando; los componentes de texto siguen en el repositorio
 * por si se quieren recuperar.
 */
export function NarrativaOverlay() {
  useSincronizarScroll()

  // Enlace profundo a una vista (`?vista=elevada`): se aplica tras montar para no alterar la hidratación.
  useEffect(() => {
    aplicarVistaDesdeUrl(window.location.search)
  }, [])

  return (
    <main className="pointer-events-none relative z-10 select-none">
      <div aria-hidden="true" className="h-[640vh]" />
    </main>
  )
}
