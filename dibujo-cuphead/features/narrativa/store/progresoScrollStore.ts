import { useSyncExternalStore } from 'react'

type Escucha = () => void

let progresoActual = 0
const escuchas = new Set<Escucha>()

const limitar = (valor: number): number => Math.min(1, Math.max(0, valor))

export function establecerProgreso(valor: number): void {
  const siguiente = limitar(Number.isFinite(valor) ? valor : 0)
  if (siguiente === progresoActual) return
  progresoActual = siguiente
  escuchas.forEach((escucha) => escucha())
}

export function obtenerProgreso(): number {
  return progresoActual
}

export function suscribirProgreso(escucha: Escucha): () => void {
  escuchas.add(escucha)
  return () => {
    escuchas.delete(escucha)
  }
}

const obtenerProgresoServidor = (): number => 0

export function useProgresoScroll(): number {
  return useSyncExternalStore(suscribirProgreso, obtenerProgreso, obtenerProgresoServidor)
}
