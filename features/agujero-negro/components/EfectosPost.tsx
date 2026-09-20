'use client'

import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { useFrame } from '@react-three/fiber'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { ajuste } from '../store/vistaCamaraStore'
import { columnaPolvo } from '../utils/columnaPolvo'
import { EfectoGas } from '../utils/efectoGas'

/**
 * Resplandor del gas (ver `utils/efectoGas.ts`): florece SOLO el buffer del gas (disco, niebla,
 * anillo, cielo), fijo en píxeles CSS (altura de referencia 720), y tiene dos partes físicas:
 * - `camara`: la dispersión en la óptica de la cámara, ancha y suave (mucho peso en los niveles
 *   gruesos): llena la sombra y pone la falda bajo la cara cercana; igual en todas las vistas.
 * - `polvo`: la dispersión hacia delante del polvo que hay entre la cámara y el agujero, estrecha
 *   (ángulos pequeños) e intensa, proporcional a la columna real de escombros delante de la cámara
 *   (`utils/columnaPolvo.ts`): es el pedestal del haz de la captura 22 (cámara dentro del sistema
 *   de anillos), que a 19.5 unidades se reduce a la mitad y desde arriba desaparece.
 * En las capturas del usuario el pedestal mide 57 px a 38 unidades y 31–44 px a 19.5 (a 720 px de
 * alto): sólo la parte de polvo cambia entre ellas.
 */
const RESPLANDOR_CAMARA = { umbral: 0.5, radio: 0.9, niveles: 7, intensidad: 6 } as const
const RESPLANDOR_POLVO = { umbral: 0.5, radio: 0.6, niveles: 5, intensidad: 12 } as const

/**
 * Bloom de las chispas: la escena que entra al compositor sólo contiene el polvo (el gas se
 * compone después), así que este bloom no toca el gas. Umbral alto y radio corto: las
 * estrellitas más vivas tienen una aureola pequeña y siguen siendo puntos, no manchas.
 */
const BLOOM_CHISPAS = { umbral: 0.9, intensidad: 2.0, radio: 0.85 } as const

export function EfectosPost() {
  const efectoCamara = useMemo(
    () =>
      new EfectoGas({
        // Luz del gas dispersada: llega enrojecida (oro), no crema.
        tinte: new THREE.Vector3(1.0, 0.8, 0.55),
        mipmapBlur: true,
        luminanceThreshold: RESPLANDOR_CAMARA.umbral,
        luminanceSmoothing: 0.2,
        intensity: RESPLANDOR_CAMARA.intensidad,
        radius: RESPLANDOR_CAMARA.radio,
        levels: RESPLANDOR_CAMARA.niveles,
        // Altura fija del bloom: sus escalas no dependen del pixel ratio.
        resolutionY: 720,
      }),
    [],
  )
  const efectoPolvo = useMemo(
    () =>
      new EfectoGas({
        componerGas: false,
        tinte: new THREE.Vector3(1.0, 0.86, 0.66),
        mipmapBlur: true,
        luminanceThreshold: RESPLANDOR_POLVO.umbral,
        luminanceSmoothing: 0.2,
        intensity: 0,
        radius: RESPLANDOR_POLVO.radio,
        levels: RESPLANDOR_POLVO.niveles,
        resolutionY: 720,
      }),
    [],
  )

  useEffect(() => () => efectoCamara.dispose(), [efectoCamara])
  useEffect(() => () => efectoPolvo.dispose(), [efectoPolvo])

  useFrame(({ camera }) => {
    // Ajustables desde la URL sólo en desarrollo (ver `store/vistaCamaraStore.ts`).
    efectoCamara.luminanceMaterial.threshold = ajuste('bloomUmbral', RESPLANDOR_CAMARA.umbral)
    efectoCamara.intensity = ajuste('resplandorBase', RESPLANDOR_CAMARA.intensidad)
    efectoCamara.mipmapBlurPass.radius = ajuste('bloomRadio', RESPLANDOR_CAMARA.radio)
    const niveles = Math.round(ajuste('bloomNiveles', RESPLANDOR_CAMARA.niveles))
    if (efectoCamara.mipmapBlurPass.levels !== niveles) {
      efectoCamara.mipmapBlurPass.levels = niveles
      // Cambiar los niveles recrea los buffers del bloom sin tamaño: hay que redimensionar.
      efectoCamara.setSize(efectoCamara.resolution.baseWidth, efectoCamara.resolution.baseHeight)
    }
    efectoPolvo.luminanceMaterial.threshold = ajuste('bloomUmbral', RESPLANDOR_POLVO.umbral)
    efectoPolvo.intensity = ajuste('resplandorPolvo', RESPLANDOR_POLVO.intensidad) * columnaPolvo(camera.position)
    efectoPolvo.mipmapBlurPass.radius = ajuste('resplandorPolvoRadio', RESPLANDOR_POLVO.radio)
    const nivelesPolvo = Math.round(ajuste('resplandorPolvoNiveles', RESPLANDOR_POLVO.niveles))
    if (efectoPolvo.mipmapBlurPass.levels !== nivelesPolvo) {
      efectoPolvo.mipmapBlurPass.levels = nivelesPolvo
      efectoPolvo.setSize(efectoPolvo.resolution.baseWidth, efectoPolvo.resolution.baseHeight)
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
      <primitive object={efectoCamara} />
      <primitive object={efectoPolvo} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Noise premultiply blendFunction={BlendFunction.ADD} opacity={0.28} />
      <Vignette eskil={false} offset={0.12} darkness={0.66} />
    </EffectComposer>
  )
}
