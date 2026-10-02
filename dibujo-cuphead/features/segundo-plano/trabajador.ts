import { TAREAS, buferesDe, type NombreTarea } from './tareas'

/**
 * El hilo aparte (un Web Worker, ver `calcularEnSegundoPlano.ts`): hace las tareas que se le piden,
 * de una en una, y devuelve sus arreglos sin copiarlos. Si una falla, avisa y se hace en la página.
 */
interface Pedido {
  id: number
  nombre: NombreTarea
  argumentos: unknown[]
}

const hilo = self as unknown as {
  onmessage: ((evento: MessageEvent<Pedido>) => void) | null
  postMessage: (mensaje: unknown, transferir: Transferable[]) => void
}

hilo.onmessage = ({ data: { id, nombre, argumentos } }) => {
  try {
    const resultado = (TAREAS[nombre] as (...argumentos: unknown[]) => unknown)(...argumentos)
    hilo.postMessage({ id, resultado }, buferesDe(resultado))
  } catch (error) {
    hilo.postMessage({ id, error: String(error) }, [])
  }
}
