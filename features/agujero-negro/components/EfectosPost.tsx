'use client'

import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { useFrame } from '@react-three/fiber'
import { BlendFunction, ToneMappingMode, type BloomEffect } from 'postprocessing'
import { useRef } from 'react'
import { obtenerProgreso } from '@/features/narrativa/store/progresoScrollStore'
import { ajuste } from '../store/vistaCamaraStore'
import { ASPECTO_CANTO, aspectoEnCamara } from '../utils/campoAspecto'

/**
 * Bloom de canto: umbral por encima del gas comprimido (1.05) para que sólo el núcleo del haz
 * y las chispas más vivas florezcan y el filamento del anillo de fotones no se emborrone.
 */
const BLOOM_CANTO = ASPECTO_CANTO.bloom

export function EfectosPost() {
  const bloom = useRef<BloomEffect>(null)

  useFrame(({ camera }) => {
    const efecto = bloom.current
    if (!efecto) return
    // Fuera del plano el bloom lo fija el aspecto de cada vista (ver `constantes/vistasCamara.ts`),
    // interpolado por la cámara real (`utils/campoAspecto.ts`): desde arriba, la falda lisa bajo
    // el borde del gas que mide la referencia; el relleno de la sombra lo pone la bruma, no el
    // bloom (con umbral 0.4 e intensidad 3.5 la banda perdía surcos).
    const aspecto = aspectoEnCamara(camera, obtenerProgreso())
    efecto.luminanceMaterial.threshold = ajuste('bloomUmbral', aspecto.bloomUmbral)
    efecto.intensity = ajuste('bloomIntensidad', aspecto.bloomIntensidad)
    efecto.mipmapBlurPass.radius = ajuste('bloomRadio', aspecto.bloomRadio)
  })

  return (
    <EffectComposer multisampling={0}>
      <Bloom
        ref={bloom}
        mipmapBlur
        luminanceThreshold={BLOOM_CANTO.umbral}
        luminanceSmoothing={0.2}
        intensity={BLOOM_CANTO.intensidad}
        radius={BLOOM_CANTO.radio}
        // Ocho niveles de mip: el resplandor de la vista elevada necesita alcanzar ~300 px.
        levels={8}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Noise premultiply blendFunction={BlendFunction.ADD} opacity={0.28} />
      <Vignette eskil={false} offset={0.12} darkness={0.66} />
    </EffectComposer>
  )
}
