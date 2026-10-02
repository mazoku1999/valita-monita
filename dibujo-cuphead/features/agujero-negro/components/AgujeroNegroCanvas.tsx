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
import { PrecalentarSombreadores } from './PrecalentarSombreadores'
import { ResolucionAdaptable } from './ResolucionAdaptable'
import { TunelAgujeroGusano } from './TunelAgujeroGusano'

/**
 * Resolución máxima del dibujo (píxeles del lienzo por píxel de CSS): en las pantallas táctiles
 * (móviles), algo menos, para que puedan ir fluidos (el grano de la película disimula la diferencia).
 */
const DPR_MAXIMO = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? 1.25 : 1.5

interface AgujeroNegroCanvasProps {
  onListo?: () => void
}

export function AgujeroNegroCanvas({ onListo }: AgujeroNegroCanvasProps) {
  return (
    <Canvas
      flat
      dpr={[1, DPR_MAXIMO]}
      // Al cambiar de tamaño (la barra del navegador del móvil que aparece o se esconde, girar el
      // teléfono, pantalla completa), el lienzo se rehace una sola vez, cuando ya no cambia (rehacerlo
      // traba un momento); mientras tanto se estira (ver `.lienzo-agujero` en `globals.css`).
      resize={{ scroll: false, debounce: { scroll: 0, resize: 250 } }}
      className="lienzo-agujero"
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
      {/* Los programas de la GPU de lo que aún no se ve, preparados de antemano (sin tirones luego). */}
      <PrecalentarSombreadores />
      {/* Menos píxeles si el aparato no llega a 60 por segundo. */}
      <ResolucionAdaptable maxima={DPR_MAXIMO} />
    </Canvas>
  )
}
