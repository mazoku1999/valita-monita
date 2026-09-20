'use client'

import { useEffect } from 'react'
import { aplicarVistaDesdeUrl } from '@/features/agujero-negro/store/vistaCamaraStore'
import { CAPITULO_ACTUAL, EPILOGO } from '../contenido/capitulos'
import { useSincronizarScroll } from '../hooks/useSincronizarScroll'
import { CapituloSection } from './CapituloSection'
import { EpilogoSection } from './EpilogoSection'
import { NarrativaFooter } from './NarrativaFooter'
import { NarrativaHeader } from './NarrativaHeader'
import { ProgresoRail } from './ProgresoRail'

export function NarrativaOverlay() {
  useSincronizarScroll()

  // Enlace profundo a una vista (`?vista=elevada`): se aplica tras montar para no alterar la hidratación.
  useEffect(() => {
    aplicarVistaDesdeUrl(window.location.search)
  }, [])

  return (
    <>
      <NarrativaHeader />
      <ProgresoRail />
      <main className="pointer-events-none relative z-10 select-none">
        <div aria-hidden="true" className="h-[60vh]" />
        <CapituloSection capitulo={CAPITULO_ACTUAL} />
        <EpilogoSection epilogo={EPILOGO} />
      </main>
      <NarrativaFooter />
    </>
  )
}
