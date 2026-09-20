'use client'

import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { useFrame } from '@react-three/fiber'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo } from 'react'
import { ajuste } from '../store/vistaCamaraStore'
import { EfectoGas } from '../utils/efectoGas'

/**
 * Bloom del gas (ver `utils/efectoGas.ts`): florece SOLO el buffer del gas (disco, anillo,
 * bruma), ancho y de tamaño fijo en píxeles CSS (altura de referencia 720). Es el resplandor
 * que en las capturas del usuario crece con la distancia: a 140 unidades envuelve el anillo
 * hasta ~4 R (captura 28), a 38 llena de luz el interior (captura 22) y a 19.5 apenas se nota
 * frente a un anillo enorme (captura 29). Un solo ajuste para todas las vistas.
 */
const BLOOM_GAS = { umbral: 0.9, intensidad: 8, radio: 0.9, niveles: 8 } as const

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
        levels: BLOOM_GAS.niveles,
        // Altura fija del bloom: sus escalas no dependen del pixel ratio (mi captura a dpr 1 y la
        // pantalla del usuario a 1.5 ven el mismo resplandor en píxeles CSS).
        resolutionY: 720,
      }),
    [],
  )

  useEffect(() => () => efectoGas.dispose(), [efectoGas])

  useFrame(() => {
    // Ajustables desde la URL sólo en desarrollo (ver `store/vistaCamaraStore.ts`).
    efectoGas.luminanceMaterial.threshold = ajuste('bloomUmbral', BLOOM_GAS.umbral)
    efectoGas.intensity = ajuste('bloomIntensidad', BLOOM_GAS.intensidad)
    efectoGas.mipmapBlurPass.radius = ajuste('bloomRadio', BLOOM_GAS.radio)
    const niveles = Math.round(ajuste('bloomNiveles', BLOOM_GAS.niveles))
    if (efectoGas.mipmapBlurPass.levels !== niveles) {
      efectoGas.mipmapBlurPass.levels = niveles
      // Cambiar los niveles recrea los buffers del bloom sin tamaño: hay que redimensionar.
      efectoGas.setSize(efectoGas.resolution.baseWidth, efectoGas.resolution.baseHeight)
    }
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
