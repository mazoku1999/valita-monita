'use client'

import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import * as THREE from 'three'
import { escucharRecursosNuevos } from '../store/recursosNuevos'

/** Cuándo se prepara todo la primera vez (ms desde que se monta el lienzo). */
const PRIMERA_VEZ = 4000
/** Tras un aviso de mallas o texturas nuevas, cuánto se espera (ms) por si llegan más juntas. */
const TRAS_AVISO = 300

/**
 * Prepara de antemano los programas de la GPU de todo lo que hay en la escena, también de lo que
 * aún está oculto (el sistema solar, la Tierra, las nubes, el valle y sus flores): si no, se
 * compilaban la primera vez que aparecían y el viaje se congelaba un momento justo ahí (en un móvil,
 * casi un segundo). Se compilan como los dibuja el posproceso, en un objetivo de render (así sirven
 * los mismos programas), y en segundo plano si el navegador lo permite. Después se dibuja todo
 * (también lo oculto) en ese objetivo diminuto: así las mallas grandes (el terreno, las flores) y
 * sus texturas ya están en la GPU cuando aparecen. Se repite cada vez que llegan mallas o texturas
 * nuevas (ver `store/recursosNuevos.ts`).
 */
export function PrecalentarSombreadores() {
  const gl = useThree((estado) => estado.gl)
  const escena = useThree((estado) => estado.scene)
  const camara = useThree((estado) => estado.camera)

  useEffect(() => {
    const objetivo = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: true })
    let vivo = true
    let temporizador = 0
    const subirTodo = (): void => {
      if (!vivo) return
      const ocultos: THREE.Object3D[] = []
      const recortados: THREE.Object3D[] = []
      escena.traverse((objeto) => {
        if (!objeto.visible) {
          ocultos.push(objeto)
          objeto.visible = true
        }
        if (objeto.frustumCulled) {
          recortados.push(objeto)
          objeto.frustumCulled = false
        }
      })
      const anterior = gl.getRenderTarget()
      gl.setRenderTarget(objetivo)
      gl.render(escena, camara)
      gl.setRenderTarget(anterior)
      for (const objeto of ocultos) objeto.visible = false
      for (const objeto of recortados) objeto.frustumCulled = true
    }
    const preparar = (): void => {
      temporizador = 0
      const anterior = gl.getRenderTarget()
      gl.setRenderTarget(objetivo)
      const listo = gl.compileAsync(escena, camara)
      gl.setRenderTarget(anterior)
      listo.then(subirTodo).catch(() => undefined)
    }
    // Uno pendiente ya recoge lo que llegue antes (también el de la primera vez).
    const programar = (ms: number): void => {
      if (temporizador === 0) temporizador = window.setTimeout(preparar, ms)
    }
    programar(PRIMERA_VEZ)
    const dejarDeEscuchar = escucharRecursosNuevos(() => programar(TRAS_AVISO))
    return () => {
      vivo = false
      dejarDeEscuchar()
      window.clearTimeout(temporizador)
      objetivo.dispose()
    }
  }, [gl, escena, camara])

  return null
}
