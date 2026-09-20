import { BlendFunction, BloomEffect, type BloomEffectOptions } from 'postprocessing'
import * as THREE from 'three'
import { refBufferGas } from '../store/mallaGas'

const FRAGMENTO = /* glsl */ `
uniform highp sampler2D gas;
#ifdef FRAMEBUFFER_PRECISION_HIGH
  uniform mediump sampler2D map;
#else
  uniform lowp sampler2D map;
#endif
uniform float intensity;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = vec4(texture2D(gas, uv).rgb + texture2D(map, uv).rgb * intensity, 1.0);
}
`

/**
 * Compone el buffer del gas sobre la escena (las chispas, que ya han pasado por su propio bloom)
 * y le suma un bloom calculado SOLO a partir de ese buffer. Reutiliza la maquinaria de
 * BloomEffect (paso de luminancia y desenfoque piramidal) apuntándola al buffer del gas en vez
 * de a la imagen de entrada: el gas florece con su propio umbral y radio, y las chispas no
 * engordan con él. Como efecto de pantalla se comporta igual desde cualquier ángulo.
 */
export class EfectoGas extends BloomEffect {
  private bufferActual: THREE.WebGLRenderTarget | null = null

  constructor(opciones: BloomEffectOptions) {
    super({ ...opciones, blendFunction: BlendFunction.ADD })
    this.uniforms.set('gas', new THREE.Uniform<THREE.Texture | null>(null))
    this.setFragmentShader(FRAGMENTO)
  }

  override update(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget, deltaTime?: number): void {
    const buffer = refBufferGas.current
    if (!buffer) return
    if (buffer !== this.bufferActual) {
      this.bufferActual = buffer
      const uniforme = this.uniforms.get('gas')
      if (uniforme) uniforme.value = buffer.texture
    }
    super.update(renderer, buffer, deltaTime)
  }
}
