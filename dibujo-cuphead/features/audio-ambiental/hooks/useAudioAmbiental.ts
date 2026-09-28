'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { obtenerProgreso, suscribirProgreso } from '@/features/narrativa/store/progresoScrollStore'
import { MotorAudioService } from '../servicios/MotorAudioService'

interface EstadoAudioAmbiental {
  readonly activo: boolean
  readonly alternar: () => Promise<void>
}

export function useAudioAmbiental(): EstadoAudioAmbiental {
  const motorRef = useRef<MotorAudioService | null>(null)
  const [activo, setActivo] = useState(false)

  const obtenerMotor = useCallback((): MotorAudioService => {
    if (!motorRef.current) {
      motorRef.current = new MotorAudioService()
    }
    return motorRef.current
  }, [])

  const alternar = useCallback(async (): Promise<void> => {
    const motor = obtenerMotor()
    if (!motor.disponible) return

    if (motor.estaActivo) {
      motor.desactivar()
      setActivo(false)
      return
    }

    try {
      await motor.activar()
      setActivo(true)
    } catch {
      setActivo(false)
    }
  }, [obtenerMotor])

  useEffect(() => {
    // La intensidad sonora sigue la cercanía de la cámara al agujero (máxima a mitad del recorrido).
    const aplicar = (): void => {
      motorRef.current?.establecerIntensidad(Math.sin(Math.PI * obtenerProgreso()))
    }
    aplicar()
    return suscribirProgreso(aplicar)
  }, [])

  useEffect(() => {
    return () => {
      motorRef.current?.destruir()
      motorRef.current = null
    }
  }, [])

  return { activo, alternar }
}
