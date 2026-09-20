'use client'

import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { useFrame } from '@react-three/fiber'
import { BlendFunction, ToneMappingMode, type BloomEffect } from 'postprocessing'
import { useRef } from 'react'
import { VISTAS_CAMARA } from '../constantes/vistasCamara'
import { ajuste, obtenerVista } from '../store/vistaCamaraStore'
import { mezclar, pesoAspecto, senoElevacion } from '../utils/elevacionCamara'

/**
 * Bloom de canto: umbral por encima del gas comprimido (1.05) para que sólo el núcleo del haz
 * y las chispas más vivas florezcan y el filamento del anillo de fotones no se emborrone.
 */
const BLOOM_CANTO = { umbral: 1.05, intensidad: 2.0, radio: 0.85 } as const

export function EfectosPost() {
  const bloom = useRef<BloomEffect>(null)

  useFrame(({ camera }) => {
    const efecto = bloom.current
    if (!efecto) return
    // Fuera del plano el bloom lo fija el aspecto de la vista activa (ver `constantes/vistasCamara.ts`):
    // desde arriba, la falda lisa bajo el borde del gas que mide la referencia; el relleno de la
    // sombra lo pone la bruma, no el bloom (con umbral 0.4 e intensidad 3.5 la banda perdía surcos).
    const vista = VISTAS_CAMARA[obtenerVista()]
    const t = pesoAspecto(senoElevacion(camera.position), vista.pesoMinimoAspecto)
    const bloomVista = vista.aspecto.bloom
    efecto.luminanceMaterial.threshold = ajuste('bloomUmbral', mezclar(BLOOM_CANTO.umbral, bloomVista.umbral, t))
    efecto.intensity = ajuste('bloomIntensidad', mezclar(BLOOM_CANTO.intensidad, bloomVista.intensidad, t))
    efecto.mipmapBlurPass.radius = ajuste('bloomRadio', mezclar(BLOOM_CANTO.radio, bloomVista.radio, t))
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
