'use client'

import dynamic from 'next/dynamic'
import { useCallback, useState } from 'react'
import { CancionDelAgujero } from '@/features/cancion/components/CancionDelAgujero'
import { CartaEstrellada } from '@/features/cochabamba/components/CartaEstrellada'
import { ControlesPaseo } from '@/features/cochabamba/components/ControlesPaseo'
import { AvisoPantallaCompleta, BotonPantallaCompleta } from '@/features/narrativa/components/BotonPantallaCompleta'
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
        recorrer la historia y arrastra para orbitar alrededor. Al final, en el corazón de flores, se pasea con
        las flechas o WASD o, en pantallas táctiles, con la palanca.
      </p>
      <NarrativaOverlay />
      {/* Al cruzar el agujero negro, la canción con su letra (la cámara cruza sola a su compás). */}
      <CancionDelAgujero />
      {/* Al final, posada la cámara en el corazón de flores: la palanca y los botones del paseo. */}
      <ControlesPaseo />
      {/* Y al abrir la cajita, la carta en el cielo de la noche estrellada. */}
      <CartaEstrellada />
      {/* Pantalla completa (en el iPhone, cómo agregarla a inicio). */}
      <BotonPantallaCompleta />
      <AvisoPantallaCompleta />
    </>
  )
}
