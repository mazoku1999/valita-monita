/**
 * Corrimiento de frecuencia de la cámara en caída (ver `utils/observadorCaida.ts`), compartido
 * por la lente (gas, niebla, anillo y cielo) y el polvo, para que todo lo que se ve cambie igual.
 *
 * g es la razón entre la frecuencia que mide la cámara y la que tenía la luz en el infinito. La
 * física pide brillo ∝ g⁴ (fuentes extensas; g² las puntuales) y temperatura ∝ g; aquí la
 * temperatura de color se suaviza a g^0.6 y ambos van referidos a `gReferencia`, la g del borde
 * de la sombra, como en una cámara: la exposición sigue del todo al anillo de luz que la rodea
 * (no se quema al acelerar; lo de los lados se apaga) y el balance de blancos se adapta al 60 %
 * (el anillo pasa de oro a blanco cálido al acercarse al horizonte, en vez de a azul, y lo que
 * llega más corrido que él sigue viéndose más azul y lo de los lados más rojo).
 */
export const CORRIMIENTO_OBSERVADOR_GLSL = /* glsl */ `
const float EXPONENTE_COLOR_G = 0.6;
const float ADAPTACION_BLANCO = 0.6;
// hc/(λ·k·T) para (610, 550, 465) nm y una temperatura de referencia de 4500 K (crema).
const vec3 PLANCK_REFERENCIA = vec3(23587.0, 26160.0, 30942.0) / 4500.0;
const vec3 LUMINANCIA_CORRIMIENTO = vec3(0.2126, 0.7152, 0.0722);

// Tinte relativo de un cuerpo negro de 4500 K visto con su temperatura multiplicada por t (razón
// de Planck en tres longitudes de onda, normalizada a luminancia 1): t > 1 azula, t < 1 enrojece.
vec3 tinteCuerpoNegro(float t) {
  vec3 razon = (exp(PLANCK_REFERENCIA) - 1.0) / (exp(PLANCK_REFERENCIA / t) - 1.0);
  return razon / max(dot(razon, LUMINANCIA_CORRIMIENTO), 1e-6);
}

// Tinte de la cámara para una luz que llega con corrimiento g (balance de blancos adaptado en
// parte a gReferencia).
vec3 tinteCamara(float g, float gReferencia) {
  float t = pow(clamp(g, 0.05, 20.0), EXPONENTE_COLOR_G) * pow(gReferencia, -EXPONENTE_COLOR_G * ADAPTACION_BLANCO);
  return tinteCuerpoNegro(t);
}

// Brillo relativo a la exposición de la cámara (g del borde de la sombra).
float brilloCamara(float g, float gReferencia, float exponente) {
  return pow(clamp(g, 0.05, 20.0) / gReferencia, exponente);
}
`
