'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { obtenerProgreso } from '@/features/narrativa/store/progresoScrollStore'
import { AnilloPapel } from '@/features/anillo-papel/components/AnilloPapel'
import { VIAJE } from '../constantes/viajeScroll'

/** El anillo se coloca delante de la cámara, a esta distancia y con esta escala (pequeño: ~un cuarto de la altura). */
const DISTANCIA_ANILLO = 1.0
const ESCALA_ANILLO = 0.11
/** El girasol sube hasta +1.6 radios sobre el centro de la banda: se baja el conjunto para centrarlo. */
const DESPLAZAMIENTO_VERTICAL = -0.45

const suavizar = (borde0: number, borde1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - borde0) / (borde1 - borde0)))
  return t * t * (3 - 2 * t)
}

/**
 * Escena final: tras el paso por el agujero de gusano y la llegada al sistema solar, el anillo de
 * papel aparece delante de la cámara (con el sistema solar detrás), crece y se balancea despacio. Se ancla al marco de la cámara para que el arrastre y el
 * seguimiento del cursor no lo saquen de cuadro.
 */
export function EscenaAnilloFinal() {
  const ancla = useRef<THREE.Group>(null)
  const giro = useRef<THREE.Group>(null)
  const [movimientoReducido, setMovimientoReducido] = useState(false)
  const direccion = useRef(new THREE.Vector3())
  const tiempo = useRef(0)

  useEffect(() => {
    const consulta = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sincronizar = (): void => setMovimientoReducido(consulta.matches)
    sincronizar()
    consulta.addEventListener('change', sincronizar)
    return () => consulta.removeEventListener('change', sincronizar)
  }, [])

  useFrame(({ camera }, delta) => {
    const grupo = ancla.current
    if (!grupo) return
    const aparicion = suavizar(VIAJE.anilloInicio, VIAJE.anilloPleno, obtenerProgreso())
    grupo.visible = aparicion > 0.002
    if (!grupo.visible) return

    grupo.quaternion.copy(camera.quaternion)
    direccion.current.set(0, 0, -1).applyQuaternion(camera.quaternion)
    grupo.position.copy(camera.position).addScaledVector(direccion.current, DISTANCIA_ANILLO)
    grupo.scale.setScalar(ESCALA_ANILLO * (0.55 + 0.45 * aparicion))
    grupo.traverse((objeto) => {
      if (objeto instanceof THREE.Mesh) {
        const material = objeto.material as THREE.Material
        material.opacity = aparicion
      }
    })
    if (giro.current) {
      // Como en la foto: el aro inclinado hacia el espectador con la flor arriba, mirándonos, y
      // un balanceo lento en vez de un giro completo (de perfil el aro es sólo una línea).
      tiempo.current += delta
      const t = movimientoReducido ? 0 : tiempo.current
      giro.current.rotation.set(0.5 + 0.08 * Math.sin(t * 0.31), 0.35 * Math.sin(t * 0.47), 0.05 * Math.sin(t * 0.23))
    }
  })

  return (
    <group ref={ancla} visible={false}>
      <group ref={giro}>
        <group position={[0, DESPLAZAMIENTO_VERTICAL, 0]}>
          <AnilloPapel radio={1} />
        </group>
      </group>
    </group>
  )
}
