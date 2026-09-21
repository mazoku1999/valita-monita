'use client'

import { useEffect } from 'react'
import { aplicarVistaDesdeUrl } from '@/features/agujero-negro/store/vistaCamaraStore'
import { useSincronizarScroll } from '../hooks/useSincronizarScroll'

/**
 * Sin textos en la interfaz (petición del usuario): ni cabecera, ni capítulo, ni epílogo, ni pie,
 * ni rail de progreso. Queda sólo el agujero negro. El recorrido de scroll se conserva con un
 * carril invisible de la misma altura que tenían las secciones (60vh + 200vh + 100vh), para que
 * el zoom y el recorrido de cámara ligados al scroll sigan funcionando igual. Los encuadres se
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
      <div aria-hidden="true" className="h-[360vh]" />
    </main>
  )
}
