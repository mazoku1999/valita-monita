'use client'

import { useEffect } from 'react'

/** Un toque corto (sin arrastrar): lo que puede moverse (px) y durar (ms); y el doble toque, el tiempo entre los dos (ms). */
const TOQUE = { movimiento: 12, duracion: 300, doble: 350 } as const

/**
 * Sin zoom (lo pidió el usuario: ni pellizcando ni con doble toque o doble clic, en el celular ni en
 * la web): el navegador no amplía la página. En Android y en el ordenador basta la ventana
 * (`userScalable: false` en `app/layout.tsx`) y `touch-action` (ver `globals.css`), más el pellizco
 * del trackpad y Ctrl + rueda, que llegan como una rueda con Ctrl. Safari (iPhone) no los respeta
 * (por accesibilidad): en el paseo, con el pulgar en la palanca y otro dedo, se amplió la página y ya
 * no se podía volver. Allí, además:
 *
 * - dos dedos a la vez no amplían: se impide en cuanto se apoya el segundo (y sus gestos de pellizco);
 * - un doble toque rápido tampoco (sólo entre toques cortos: deslizar sigue igual);
 * - y si aun así se ampliara, la página vuelve sola a su escala.
 */
export function useSinZoom(): void {
  useEffect(() => {
    const impedir = (evento: Event): void => evento.preventDefault()
    const alRueda = (evento: WheelEvent): void => {
      if (evento.ctrlKey || evento.metaKey) evento.preventDefault()
    }

    // Dos dedos: desde que se apoya el segundo, ni pellizco ni nada (el movimiento se escucha sólo
    // mientras hay dos, para no frenar el scroll de un dedo).
    const alMoverDosDedos = (evento: TouchEvent): void => {
      if (evento.touches.length > 1) evento.preventDefault()
    }
    let escuchandoMovimiento = false
    let inicio: { x: number; y: number; t: number } | null = null
    let ultimoToque: { x: number; y: number; t: number } | null = null
    const alEmpezarToque = (evento: TouchEvent): void => {
      if (evento.touches.length > 1) {
        evento.preventDefault()
        if (!escuchandoMovimiento) {
          document.addEventListener('touchmove', alMoverDosDedos, { passive: false })
          escuchandoMovimiento = true
        }
        inicio = null
        return
      }
      const toque = evento.touches[0]
      inicio = { x: toque.clientX, y: toque.clientY, t: evento.timeStamp }
    }
    const alTerminarToque = (evento: TouchEvent): void => {
      if (evento.touches.length < 2 && escuchandoMovimiento) {
        document.removeEventListener('touchmove', alMoverDosDedos)
        escuchandoMovimiento = false
      }
      const toque = evento.changedTouches[0]
      if (!inicio || !toque || evento.touches.length > 0) return
      const corto =
        Math.hypot(toque.clientX - inicio.x, toque.clientY - inicio.y) < TOQUE.movimiento && evento.timeStamp - inicio.t < TOQUE.duracion
      inicio = null
      if (!corto) {
        ultimoToque = null
        return
      }
      // El segundo de dos toques cortos seguidos, cerca: el doble toque que amplía en Safari.
      if (ultimoToque && evento.timeStamp - ultimoToque.t < TOQUE.doble && Math.hypot(toque.clientX - ultimoToque.x, toque.clientY - ultimoToque.y) < 60) {
        evento.preventDefault()
        ultimoToque = null
        return
      }
      ultimoToque = { x: toque.clientX, y: toque.clientY, t: evento.timeStamp }
    }

    // Si aun así se amplió, de vuelta a la escala 1: cambiar la ventana hace que Safari la restablezca.
    const vista = window.visualViewport
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
    let restableciendo = false
    const alCambiarVista = (): void => {
      if (!vista || !meta || restableciendo || vista.scale <= 1.01) return
      restableciendo = true
      const original = meta.content
      meta.content = `${original}, minimum-scale=1`
      window.setTimeout(() => {
        meta.content = original
        restableciendo = false
      }, 300)
    }

    const gestos = ['gesturestart', 'gesturechange', 'gestureend'] as const
    for (const tipo of gestos) document.addEventListener(tipo, impedir, { passive: false })
    window.addEventListener('wheel', alRueda, { passive: false })
    document.addEventListener('touchstart', alEmpezarToque, { passive: false })
    document.addEventListener('touchend', alTerminarToque, { passive: false })
    document.addEventListener('touchcancel', alTerminarToque, { passive: false })
    vista?.addEventListener('resize', alCambiarVista)
    return () => {
      for (const tipo of gestos) document.removeEventListener(tipo, impedir)
      window.removeEventListener('wheel', alRueda)
      document.removeEventListener('touchstart', alEmpezarToque)
      document.removeEventListener('touchend', alTerminarToque)
      document.removeEventListener('touchcancel', alTerminarToque)
      document.removeEventListener('touchmove', alMoverDosDedos)
      vista?.removeEventListener('resize', alCambiarVista)
    }
  }, [])
}
