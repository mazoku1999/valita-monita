import { TAREAS, type NombreTarea, type Tareas } from './tareas'

interface Pendiente {
  nombre: NombreTarea
  argumentos: unknown[]
  resolver: (resultado: unknown) => void
}

/** Segundos sin trabajo tras los que se cierra el hilo. */
const CIERRE_TRAS = 5

/** El hilo: sin crear todavía (`undefined`) o imposible (`null`). */
let hilo: Worker | null | undefined
let siguienteId = 1
let cierre = 0
const pendientes = new Map<number, Pendiente>()
const hechas = new Map<string, Promise<unknown>>()

function enLaPagina({ nombre, argumentos, resolver }: Pendiente): void {
  window.setTimeout(() => resolver((TAREAS[nombre] as (...argumentos: unknown[]) => unknown)(...argumentos)), 0)
}

function obtenerHilo(): Worker | null {
  if (hilo !== undefined) return hilo
  try {
    const nuevo = new Worker(new URL('./trabajador.ts', import.meta.url), { type: 'module' })
    nuevo.onmessage = ({ data }: MessageEvent<{ id: number; resultado?: unknown; error?: string }>) => {
      const pendiente = pendientes.get(data.id)
      if (!pendiente) return
      pendientes.delete(data.id)
      if (data.error !== undefined) enLaPagina(pendiente)
      else pendiente.resolver(data.resultado)
      if (pendientes.size === 0) {
        window.clearTimeout(cierre)
        cierre = window.setTimeout(() => {
          if (pendientes.size > 0 || hilo !== nuevo) return
          nuevo.terminate()
          hilo = undefined
        }, CIERRE_TRAS * 1000)
      }
    }
    // Si el hilo no carga o se rompe, lo que tenía pendiente se hace aquí, y ya no se usa.
    nuevo.onerror = (evento) => {
      evento.preventDefault()
      nuevo.terminate()
      hilo = null
      const quedan = [...pendientes.values()]
      pendientes.clear()
      quedan.forEach(enLaPagina)
    }
    hilo = nuevo
  } catch {
    hilo = null
  }
  return hilo
}

/**
 * Hace una de las `TAREAS` en un hilo aparte (un Web Worker, ver `trabajador.ts`) y devuelve su
 * resultado: mientras tanto, la animación y el scroll siguen fluidos. Cada tarea se hace una sola
 * vez (quien la vuelva a pedir recibe el mismo resultado). Si el navegador no puede crear el hilo, o
 * el hilo falla, la tarea se hace aquí mismo, fuera del fotograma en curso. El hilo se cierra
 * cuando se queda sin trabajo (y se vuelve a crear si hace falta).
 */
export function calcularEnSegundoPlano<N extends NombreTarea>(nombre: N, ...argumentos: Parameters<Tareas[N]>): Promise<ReturnType<Tareas[N]>> {
  const clave = `${nombre}:${JSON.stringify(argumentos)}`
  let resultado = hechas.get(clave)
  if (!resultado) {
    resultado = new Promise<unknown>((resolver) => {
      const pendiente: Pendiente = { nombre, argumentos, resolver }
      const actual = obtenerHilo()
      if (!actual) {
        enLaPagina(pendiente)
        return
      }
      window.clearTimeout(cierre)
      const id = siguienteId++
      pendientes.set(id, pendiente)
      actual.postMessage({ id, nombre, argumentos })
    })
    hechas.set(clave, resultado)
  }
  return resultado as Promise<ReturnType<Tareas[N]>>
}
