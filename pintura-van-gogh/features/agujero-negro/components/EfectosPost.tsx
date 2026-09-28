'use client'

import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { useFrame } from '@react-three/fiber'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { PasoPintura } from '@/features/pintura/utils/PasoPintura'
import { ajuste } from '../store/vistaCamaraStore'
import { columnaPolvo } from '../utils/columnaPolvo'
import { suavizar } from '../utils/aleatorio'
import { EfectoGas } from '../utils/efectoGas'

/**
 * Resplandor del gas (ver `utils/efectoGas.ts`): florece SOLO el buffer del gas (disco, niebla,
 * anillo, cielo), fijo en píxeles CSS (altura de referencia 720), y tiene dos partes físicas:
 * - `camara`: la dispersión en la óptica de la cámara, ancha y suave (mucho peso en los niveles
 *   gruesos): llena la sombra y pone la falda bajo la cara cercana; igual en todas las vistas.
 * - `polvo`: la dispersión hacia delante del polvo que hay entre la cámara y el agujero, de
 *   anchura media (seis niveles: en la captura lejana 32 el resplandor cae con una escala de ~3 R;
 *   con ocho niveles se extendía a 10 R y con cinco no llegaba a 4 R), proporcional a la columna
 *   real de escombros delante de la cámara
 *   (`utils/columnaPolvo.ts`): es el pedestal del haz de la captura 22 (cámara dentro del sistema
 *   de anillos), que a 19.5 unidades se reduce a la mitad y desde arriba desaparece.
 * En las capturas del usuario el pedestal mide 57 px a 38 unidades y 31–44 px a 19.5 (a 720 px de
 * alto): sólo la parte de polvo cambia entre ellas.
 */
const RESPLANDOR_CAMARA = { umbral: 0.5, radio: 0.9, niveles: 7, intensidad: 4.5 } as const
const RESPLANDOR_POLVO = { umbral: 0.5, radio: 0.85, niveles: 6, intensidad: 7.5 } as const

/**
 * Bloom de las chispas: la escena que entra al compositor sólo contiene el polvo (el gas se
 * compone después), así que este bloom no toca el gas. Umbral alto y radio corto: las
 * estrellitas más vivas tienen una aureola pequeña y siguen siendo puntos, no manchas.
 */
const BLOOM_CHISPAS = { umbral: 0.9, intensidad: 2.0, radio: 0.85 } as const

/** El mismo balance de color que el gas y el polvo (ver el shader de la lente): naranja melocotón. */
const BALANCE_COLOR = new THREE.Vector3(1.0, 1.05, 1.2).divideScalar(1.05)

export function EfectosPost() {
  const efectoCamara = useMemo(
    () =>
      new EfectoGas({
        // Luz del gas dispersada: llega enrojecida (oro), no crema.
        tinte: new THREE.Vector3(1.0, 0.8, 0.55).multiply(BALANCE_COLOR),
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
        tinte: new THREE.Vector3(1.0, 0.86, 0.66).multiply(BALANCE_COLOR),
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

  // La escena ya revelada se repinta con pinceladas (ver `features/pintura`).
  const pasoPintura = useMemo(() => new PasoPintura(), [])

  useEffect(() => () => efectoCamara.dispose(), [efectoCamara])
  useEffect(() => () => efectoPolvo.dispose(), [efectoPolvo])
  useEffect(() => () => pasoPintura.dispose(), [pasoPintura])

  useFrame(({ camera }) => {
    pasoPintura.camara = camera
    // El cielo abierto se pinta como cielo nocturno salvo dentro del horizonte, entre que se cruza
    // y que aparece la boca del agujero de gusano (0.6 → 0.4 del centro): ahí todo es oscuridad.
    const distanciaCentro = camera.position.length()
    pasoPintura.cieloPintado = Math.max(suavizar(0.95, 1.4, distanciaCentro), suavizar(0.6, 0.4, distanciaCentro))
    pasoPintura.ajustes.activa = ajuste('pintura', 1) > 0.5
    pasoPintura.ajustes.depurar = ajuste('pinturaDepurar', 0) > 0.5
    pasoPintura.ajustes.escalaAncho = ajuste('pinturaAncho', 1)
    pasoPintura.ajustes.escalaLargo = ajuste('pinturaLargo', 1)
    // Ajustables desde la URL sólo en desarrollo (ver `store/vistaCamaraStore.ts`).
    efectoCamara.luminanceMaterial.threshold = ajuste('bloomUmbral', RESPLANDOR_CAMARA.umbral)
    // En la zambullida (por dentro de 13 unidades, donde no llega ningún encuadre) el disco y el
    // anillo ocupan media pantalla y el resplandor ancho de la óptica la velaba de gris; se
    // reduce para que la sombra siga negra junto al anillo de luz.
    const zambullida = suavizar(2, 13, camera.position.length())
    efectoCamara.intensity = ajuste('resplandorBase', RESPLANDOR_CAMARA.intensidad) * (0.2 + 0.8 * zambullida)
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
      {/* Sin grano de película (sus puntos teñirían las pinceladas); la viñeta la pone el lienzo. */}
      <primitive object={pasoPintura} />
    </EffectComposer>
  )
}
