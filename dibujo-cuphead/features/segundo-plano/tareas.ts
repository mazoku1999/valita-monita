import { generarFlores } from '@/features/cochabamba/utils/flores'
import { calcularSombras, cumulosDeLaLlegada } from '@/features/cochabamba/utils/nubesDestino'
import { calcularParcheRegion } from '@/features/cochabamba/utils/parcheRegion'
import { calcularTerreno } from '@/features/cochabamba/utils/terreno'
import { calcularTexturaRegion } from '@/features/cochabamba/utils/texturaRegion'
import { generarVida } from '@/features/cochabamba/utils/vida'
import { calcularMapasTierra } from '@/features/sistema-solar/utils/texturaTierra'

/**
 * Los cálculos largos del final del viaje, que se hacen en un hilo aparte (ver `trabajador.ts`):
 * sólo números (arreglos), sin nada de la GPU; con ellos, quien los pide arma sus mallas y texturas.
 * En un móvil, cada uno detenía la animación entre medio segundo y dos segundos al empezar el viaje.
 */
export const TAREAS = {
  /** Los mapas de la Tierra (tierra firme, aridez, hielo; población). */
  mapasTierra: calcularMapasTierra,
  /** La región de Cochabamba en una textura, para el mapa de la Tierra. */
  texturaRegion: calcularTexturaRegion,
  /** El relieve de la región en 3D sobre el globo. */
  parcheRegion: calcularParcheRegion,
  /** Las sombras de las nubes de la llegada. */
  sombrasNubes: () => calcularSombras(cumulosDeLaLlegada()),
  /** El relieve del valle. */
  terreno: calcularTerreno,
  /** Las flores del campo y del corazón. */
  flores: () => generarFlores(),
  /** Los eucaliptos, las nubes de la mañana, las mariposas y los pétalos del valle. */
  vida: () => generarVida(),
} as const

export type Tareas = typeof TAREAS
export type NombreTarea = keyof Tareas

/** Los búferes de un resultado (sus arreglos), que pasan de un hilo al otro sin copiarse. */
export function buferesDe(resultado: unknown): ArrayBuffer[] {
  const buferes = new Set<ArrayBuffer>()
  const recorrer = (valor: unknown): void => {
    if (ArrayBuffer.isView(valor)) {
      if (valor.buffer instanceof ArrayBuffer) buferes.add(valor.buffer)
    } else if (valor !== null && typeof valor === 'object') {
      for (const hijo of Object.values(valor)) recorrer(hijo)
    }
  }
  recorrer(resultado)
  return [...buferes]
}
