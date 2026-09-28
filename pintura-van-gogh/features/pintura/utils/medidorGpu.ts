/**
 * Cronómetro de GPU para desarrollo (`?pinturaTiempos=1`): mide cada sección del pase de pintura
 * con EXT_disjoint_timer_query_webgl2 y publica las medias en `window.__tiemposPintura()`. Las
 * medidas de fotogramas por segundo no sirven cuando otras aplicaciones usan la GPU; el tiempo de
 * GPU de cada sección sí.
 */
interface Pendiente {
  nombre: string
  consulta: WebGLQuery
}

export class MedidorGpu {
  private readonly gl: WebGL2RenderingContext
  private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null
  private pendientes: Pendiente[] = []
  private actual: Pendiente | null = null
  private readonly sumas = new Map<string, { total: number; cuenta: number }>()

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
    if (typeof window !== 'undefined') {
      ;(window as unknown as { __tiemposPintura?: () => Record<string, number> }).__tiemposPintura = () => this.informe()
    }
  }

  inicio(nombre: string): void {
    if (!this.ext || this.actual) return
    const consulta = this.gl.createQuery()
    if (!consulta) return
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, consulta)
    this.actual = { nombre, consulta }
  }

  fin(): void {
    if (!this.ext || !this.actual) return
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT)
    this.pendientes.push(this.actual)
    this.actual = null
  }

  /** Recoge los resultados que ya estén listos (de fotogramas anteriores). */
  recoger(): void {
    if (!this.ext) return
    const disjunto = this.gl.getParameter(this.ext.GPU_DISJOINT_EXT)
    const quedan: Pendiente[] = []
    for (const p of this.pendientes) {
      if (!this.gl.getQueryParameter(p.consulta, this.gl.QUERY_RESULT_AVAILABLE)) {
        quedan.push(p)
        continue
      }
      if (!disjunto) {
        const ns = this.gl.getQueryParameter(p.consulta, this.gl.QUERY_RESULT) as number
        const suma = this.sumas.get(p.nombre) ?? { total: 0, cuenta: 0 }
        suma.total += ns / 1e6
        suma.cuenta += 1
        this.sumas.set(p.nombre, suma)
      }
      this.gl.deleteQuery(p.consulta)
    }
    this.pendientes = quedan
  }

  /** Medias en milisegundos por sección desde la última llamada (y reinicia). */
  informe(): Record<string, number> {
    const salida: Record<string, number> = {}
    for (const [nombre, { total, cuenta }] of this.sumas) salida[nombre] = Number((total / Math.max(cuenta, 1)).toFixed(3))
    this.sumas.clear()
    return salida
  }
}
