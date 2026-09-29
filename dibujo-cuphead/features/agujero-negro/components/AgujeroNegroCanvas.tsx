'use client'

import { Canvas } from '@react-three/fiber'
import { CAMARA_AGUJERO } from '../constantes/parametrosAgujero'
import { CamaraNarrativa } from './CamaraNarrativa'
import { EfectosPost } from './EfectosPost'
import { EscenaSistemaSolar } from './EscenaSistemaSolar'
import { LenteGravitacionalQuad } from './LenteGravitacionalQuad'
import { TunelAgujeroGusano } from './TunelAgujeroGusano'

interface AgujeroNegroCanvasProps {
  onListo?: () => void
}

export function AgujeroNegroCanvas({ onListo }: AgujeroNegroCanvasProps) {
  return (
    <Canvas
      flat
      dpr={[1, 1.5]}
      camera={{
        fov: CAMARA_AGUJERO.fov,
        near: CAMARA_AGUJERO.cerca,
        far: CAMARA_AGUJERO.lejos,
        position: [0, 1, 82],
      }}
      gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }}
      onCreated={({ gl }) => {
        gl.setClearColor('#050404', 1)
        onListo?.()
      }}
      style={{ width: '100%', height: '100%' }}
    >
      <LenteGravitacionalQuad />
      {/* Sin el polvo realista: en el dibujo animado lo sustituyen los destellos de caricatura. */}
      <CamaraNarrativa />
      <TunelAgujeroGusano>
        <EscenaSistemaSolar />
      </TunelAgujeroGusano>
      <EfectosPost />
    </Canvas>
  )
}
