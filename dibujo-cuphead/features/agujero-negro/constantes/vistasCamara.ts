import { FOTOGRAMAS_CAMARA, type FotogramaCamara } from '../utils/fotogramasCamara'
import { ENCUADRE_PANTALLA, INCLINACION_PANTALLA } from './parametrosAgujero'

export type IdVista = 'canto' | 'anillo' | 'elevada' | 'elevadaCercana' | 'inferior' | 'cenital' | 'lejana'

/** Parámetros de una vista que no dependen del scroll: cómo se coloca el agujero en pantalla. */
export interface EncuadreVista {
  /** Roll de cámara en radianes: inclinación aparente del disco (positivo = asciende a la derecha). */
  readonly inclinacion: number
  /** Desplazamiento NDC del agujero respecto al centro (x → derecha, y → arriba). */
  readonly encuadre: { readonly x: number; readonly y: number }
}

export interface VistaCamara extends EncuadreVista {
  readonly id: IdVista
  /** Texto del selector de la cabecera (en inglés, como el resto de la interfaz). */
  readonly etiqueta: string
  readonly descripcion: string
  /** Recorrido ligado al scroll. Todas las vistas comparten los `progreso` y azimuts de canto. */
  readonly fotogramas: readonly FotogramaCamara[]
}

/** Recorrido que conserva el ritmo de azimut de canto con elevación, distancia y fov fijos. */
const derivarRecorrido = (fijo: { polar: number; distancia: number; fov: number }): readonly FotogramaCamara[] =>
  FOTOGRAMAS_CAMARA.map(({ progreso, azimut }) => ({ progreso, azimut, ...fijo }))

export const VISTAS_CAMARA: Readonly<Record<IdVista, VistaCamara>> = {
  canto: {
    id: 'canto',
    etiqueta: 'Edge-on',
    descripcion: 'Camera in the plane of the disk: the gas is a blade of light through the shadow.',
    fotogramas: FOTOGRAMAS_CAMARA,
    inclinacion: INCLINACION_PANTALLA,
    encuadre: ENCUADRE_PANTALLA,
  },
  anillo: {
    id: 'anillo',
    etiqueta: 'Ring',
    descripcion: 'Camera in the plane and close in: the blade runs straight through the photon ring, sparks all around it.',
    // Calibrado contra las capturas 11 y 14 del usuario (3456×1604): anillo de fotones de
    // 310 px = 39 % de la altura → 18.5–20 unidades a fov 40°; sombra en el 54 % del ancho y el
    // 32 % de la altura; el haz cruza el anillo por su centro: cámara exactamente en el plano.
    fotogramas: derivarRecorrido({ polar: Math.PI / 2, distancia: 19.5, fov: 40 }),
    inclinacion: INCLINACION_PANTALLA,
    encuadre: ENCUADRE_PANTALLA,
  },
  elevada: {
    id: 'elevada',
    etiqueta: 'Above',
    descripcion: 'Camera raised 12.6° over the disk: its far side bends into arcs above and below the shadow.',
    // Calibrada contra la referencia (3448×1244, sombra en el 50.8 % del ancho y el 32.2 % de la
    // altura, anillo de fotones = 24.4 % de la altura): con fov 41° eso exige 27.5 unidades.
    fotogramas: derivarRecorrido({ polar: 1.35, distancia: 27.5, fov: 41 }),
    inclinacion: INCLINACION_PANTALLA,
    encuadre: ENCUADRE_PANTALLA,
  },
  elevadaCercana: {
    id: 'elevadaCercana',
    etiqueta: 'Above close',
    descripcion: 'Camera 16° over the disk and close in: the near face fills the frame and covers the lower half of the shadow.',
    // Calibrado contra la captura 19 del usuario (3450×2084): anillo de fotones de 369 px = 35.4 %
    // de la altura → 20.8 unidades a fov 40°; sombra en el 52.4 % del ancho y el 32.9 % de la
    // altura; la cara cercana cubre la sombra desde 0.36 R por debajo de su centro (16°).
    fotogramas: derivarRecorrido({ polar: Math.PI / 2 - 0.28, distancia: 20.8, fov: 40 }),
    inclinacion: INCLINACION_PANTALLA,
    encuadre: ENCUADRE_PANTALLA,
  },
  inferior: {
    id: 'inferior',
    etiqueta: 'Below',
    descripcion: 'Camera just under the disk, close in: the blade crosses above the shadow and the far side loops under it.',
    // Calibrada contra la referencia (3456×1676): anillo de fotones de 308 px = 36.8 % de la
    // altura → 19.5 unidades a fov 40°; sombra en el 52 % del ancho y el 34.8 % de la altura;
    // la banda cercana cruza por encima de la sombra: 4.6° bajo el plano.
    fotogramas: derivarRecorrido({ polar: Math.PI / 2 + 0.08, distancia: 19.5, fov: 40 }),
    inclinacion: INCLINACION_PANTALLA,
    encuadre: ENCUADRE_PANTALLA,
  },
  cenital: {
    id: 'cenital',
    etiqueta: 'Overhead',
    descripcion: 'Camera almost over the pole: the disk is a surface of fine wavy streaks around the shadow.',
    fotogramas: derivarRecorrido({ polar: 0.3, distancia: 30, fov: 41 }),
    // El mismo roll que las demás vistas: desde arriba sólo gira la imagen del disco, y así
    // entrar o salir de esta vista no hace rotar toda la pantalla.
    inclinacion: INCLINACION_PANTALLA,
    encuadre: ENCUADRE_PANTALLA,
  },
  lejana: {
    id: 'lejana',
    etiqueta: 'Wide',
    descripcion: 'Camera far out, slightly above the plane: the whole ring system around the hole.',
    // Calibrado contra las capturas 5, 6, 13, 17 y 18 del usuario: anillo de 4.5–5.5 % de la
    // altura → 60–80 unidades; sombra en el 54–57 % del ancho y el 41–46 % de la altura; unos 5°
    // sobre el plano.
    fotogramas: derivarRecorrido({ polar: 1.45, distancia: 60, fov: 40 }),
    inclinacion: INCLINACION_PANTALLA,
    encuadre: ENCUADRE_PANTALLA,
  },
}

export const ORDEN_VISTAS: readonly IdVista[] = ['canto', 'anillo', 'elevada', 'elevadaCercana', 'inferior', 'cenital', 'lejana']

export const VISTA_INICIAL: IdVista = 'canto'

/**
 * Distancias a las que puede llegar el zoom libre. El mínimo entra en el borde del gas (17): las
 * capturas del usuario a ~15 unidades, con el anillo enorme y el haz cruzándolo, se ven bien.
 */
export const DISTANCIA_LIBRE = { minima: 13, maxima: 140 } as const

export const esIdVista = (valor: unknown): valor is IdVista =>
  typeof valor === 'string' && (ORDEN_VISTAS as readonly string[]).includes(valor)
