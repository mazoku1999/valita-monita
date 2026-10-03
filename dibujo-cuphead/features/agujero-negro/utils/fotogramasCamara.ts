export type FotogramaCamara = {
  progreso: number
  azimut: number
  polar: number
  distancia: number
  fov: number
}

export type EstadoCamara = Omit<FotogramaCamara, 'progreso'>

/**
 * Recorrido de cámara ligado al scroll para la vista DE CANTO. En el original, calibrado con las
 * referencias del usuario, la cámara iba apenas 0.45°–0.7° por encima del plano del gas: el disco
 * era una línea fina que atravesaba la sombra. En el dibujo va unos 5° por encima (paso 57): de
 * canto, lo que se veía era una hoja dorada y el anillo de la lente, y el usuario veía "casi lo
 * mismo" por mucho que cambiara el disco; así se ve la cara del disco con sus bandas, su remolino,
 * sus bolas de fuego y sus anillos de fuera cruzando por delante de la sombra, y el arco de la lente
 * por encima (como Gargantua). La hoja de canto sigue a mano con el cursor o arrastrando. El viaje
 * conserva ese ángulo y sólo varía el azimut y la distancia.
 *
 * El ángulo polar se mide desde la normal del disco (π/2 = de canto). La distancia mínima se
 * mantiene por encima del radio externo del disco (17): si la cámara entra en el gas, la emisión
 * acumulada lava toda la imagen y la sombra deja de ser negra.
 *
 * Escala calibrada con el diámetro de la sombra (5.2): 11 % del ancho de pantalla a 45 unidades.
 *
 * Los `progreso` de esta lista son los compases de la narrativa: el rail de progreso los marca y
 * las demás vistas (ver `constantes/vistasCamara.ts`) heredan el mismo ritmo de azimut para que
 * cambiar de vista a mitad de scroll no gire el agujero de golpe.
 */
export const FOTOGRAMAS_CAMARA: readonly FotogramaCamara[] = [
  { progreso: 0.0, azimut: 0.05, polar: 1.49, distancia: 42, fov: 40 },
  { progreso: 0.15, azimut: -0.3, polar: 1.48, distancia: 41, fov: 40 },
  { progreso: 0.3, azimut: -0.7, polar: 1.47, distancia: 39, fov: 41 },
  { progreso: 0.45, azimut: -1.2, polar: 1.47, distancia: 37, fov: 42 },
  { progreso: 0.6, azimut: -1.8, polar: 1.47, distancia: 35, fov: 43 },
  { progreso: 0.75, azimut: -2.4, polar: 1.47, distancia: 37, fov: 42 },
  { progreso: 0.88, azimut: -2.9, polar: 1.48, distancia: 40, fov: 41 },
  { progreso: 1.0, azimut: -3.3, polar: 1.49, distancia: 42, fov: 40 },
]

const suavizar = (t: number): number => t * t * (3 - 2 * t)

/**
 * Interpola un recorrido de fotogramas en un progreso de scroll [0, 1] con suavizado Hermite
 * entre fotogramas consecutivos. Por defecto usa el recorrido de canto.
 */
export function interpolarFotograma(
  progreso: number,
  fotogramas: readonly FotogramaCamara[] = FOTOGRAMAS_CAMARA,
): EstadoCamara {
  const p = Math.min(1, Math.max(0, progreso))
  const ultimo = fotogramas[fotogramas.length - 1]

  for (let i = 0; i < fotogramas.length - 1; i += 1) {
    const a = fotogramas[i]
    const b = fotogramas[i + 1]
    if (p >= a.progreso && p <= b.progreso) {
      const t = suavizar((p - a.progreso) / (b.progreso - a.progreso))
      return {
        azimut: a.azimut + (b.azimut - a.azimut) * t,
        polar: a.polar + (b.polar - a.polar) * t,
        distancia: a.distancia + (b.distancia - a.distancia) * t,
        fov: a.fov + (b.fov - a.fov) * t,
      }
    }
  }

  return { azimut: ultimo.azimut, polar: ultimo.polar, distancia: ultimo.distancia, fov: ultimo.fov }
}
