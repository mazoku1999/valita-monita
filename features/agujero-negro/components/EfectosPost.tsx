'use client'

import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { useFrame } from '@react-three/fiber'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo } from 'react'
import { ajuste } from '../store/vistaCamaraStore'
import { EfectoGas } from '../utils/efectoGas'

/**
 * Bloom del gas (ver `utils/efectoGas.ts`): florece SOLO el buffer del gas (disco, anillo,
 * bruma, envoltura). Umbral por encima del gas comprimido (1.05) para que sólo el núcleo del haz
 * y el anillo florezcan y el filamento del anillo de fotones no se emborrone. Un solo ajuste
 * para todas las vistas: es un efecto de pantalla y se comporta igual desde cualquier ángulo.
 */
const BLOOM_GAS = { umbral: 1.05, intensidad: 2.0, radio: 0.85 } as const

/**
 * Bloom de las chispas: la escena que entra al compositor sólo contiene el polvo (el gas se
 * compone después), así que este bloom no toca el gas. Umbral alto y radio corto: las
 * estrellitas más vivas tienen una aureola pequeña y siguen siendo puntos, no manchas.
 */
const BLOOM_CHISPAS = { umbral: 1.05, intensidad: 2.0, radio: 0.85 } as const

export function EfectosPost() {
  const efectoGas = useMemo(
    () =>
      new EfectoGas({
        mipmapBlur: true,
        luminanceThreshold: BLOOM_GAS.umbral,
        luminanceSmoothing: 0.2,
        intensity: BLOOM_GAS.intensidad,
        radius: BLOOM_GAS.radio,
        // Ocho niveles de mip: el resplandor necesita alcanzar ~300 px.
        levels: 8,
      }),
    [],
  )

  useEffect(() => () => efectoGas.dispose(), [efectoGas])

  useFrame(() => {
    // Ajustables desde la URL sólo en desarrollo (ver `store/vistaCamaraStore.ts`).
    efectoGas.luminanceMaterial.threshold = ajuste('bloomUmbral', BLOOM_GAS.umbral)
    efectoGas.intensity = ajuste('bloomIntensidad', BLOOM_GAS.intensidad)
    efectoGas.mipmapBlurPass.radius = ajuste('bloomRadio', BLOOM_GAS.radio)
    const niveles = Math.round(ajuste('bloomNiveles', 8))
    if (efectoGas.mipmapBlurPass.levels !== niveles) efectoGas.mipmapBlurPass.levels = niveles
  })

  return (
    <EffectComposer multisampling={0}>
      <Bloom
        mipmapBlur
        luminanceThreshold={BLOOM_CHISPAS.umbral}
        luminanceSmoothing={0.2}
        intensity={BLOOM_CHISPAS.intensidad}
        radius={BLOOM_CHISPAS.radio}
        levels={8}
      />
      <primitive object={efectoGas} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Noise premultiply blendFunction={BlendFunction.ADD} opacity={0.28} />
      <Vignette eskil={false} offset={0.12} darkness={0.66} />
    </EffectComposer>
  )
}
