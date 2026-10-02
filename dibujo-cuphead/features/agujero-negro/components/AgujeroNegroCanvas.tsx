'use client'

import { Canvas } from '@react-three/fiber'
import { EscenarioCancion } from '@/features/cancion/components/EscenarioCancion'
import { EscenaCochabamba } from '@/features/cochabamba/components/EscenaCochabamba'
import { ProgresoSuave } from '@/features/narrativa/components/ProgresoSuave'
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
      {/* Primero: el progreso con inercia que leen las escenas del espacio y del valle. */}
      <ProgresoSuave />
      <LenteGravitacionalQuad />
      {/* Sin el polvo realista: en el dibujo animado lo sustituyen los destellos de caricatura. */}
      <CamaraNarrativa />
      <TunelAgujeroGusano>
        <EscenaSistemaSolar />
        <EscenaCochabamba />
      </TunelAgujeroGusano>
      {/* El escenario de la canción, antes del posproceso que lo compone. */}
      <EscenarioCancion />
      <EfectosPost />
    </Canvas>
  )
}
