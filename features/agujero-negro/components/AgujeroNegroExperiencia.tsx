'use client'

import dynamic from 'next/dynamic'
import { useCallback, useState } from 'react'
import { NarrativaOverlay } from '@/features/narrativa/components/NarrativaOverlay'

const AgujeroNegroCanvas = dynamic(
  () => import('./AgujeroNegroCanvas').then((modulo) => modulo.AgujeroNegroCanvas),
  { ssr: false },
)

export function AgujeroNegroExperiencia() {
  const [listo, setListo] = useState(false)
  const marcarListo = useCallback(() => setListo(true), [])

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-0 transition-opacity duration-[2400ms] ease-out"
        style={{ opacity: listo ? 1 : 0 }}
      >
        <AgujeroNegroCanvas onListo={marcarListo} />
      </div>
      <p className="sr-only">
        Simulación interactiva de un agujero negro con disco de acreción y lente gravitacional. Desplázate para
        recorrer la historia y arrastra para orbitar alrededor.
      </p>
      <NarrativaOverlay />
    </>
  )
}
