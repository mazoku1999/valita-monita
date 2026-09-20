/**
 * Fragmento GLSL de las partículas (granos y estrellas lejanas): órbita kepleriana
 * inclinada y lente gravitacional delgada del agujero sobre una fuente puntual.
 */
export const LENTE_DELGADA_GLSL = /* glsl */ `
// Radio de Schwarzschild en unidades de la escena (el mismo que usa el ray-marcher del gas).
const float RS = 1.0;
// 15π/16: coeficiente del término de segundo orden de la deflexión de Schwarzschild.
const float COEF_SEGUNDO_ORDEN = 2.9452;

// Órbita circular inclinada en un potencial de masa puntual (Ω ∝ a^-1.5, la misma ley que el
// gas). El grano gira en SU plano orbital, así que su altura oscila con el período de la órbita
// y cruza el plano del disco dos veces por vuelta: la banda de escombros se lee como un enjambre
// tridimensional y no como una lámina rígida que rota. La fase inicial es aleatoria por grano
// para que los anillos no "respiren" al unísono; la posición generada es el punto más alto de
// la órbita, de ahí el √2 con que se generan las alturas.
vec3 orbitar(vec3 p0, float t, float fase) {
  float a = length(p0);
  float rc = max(length(p0.xz), 1e-3);
  vec3 tangente = vec3(-p0.z, 0.0, p0.x) / rc;
  float ang = t * 0.55 * pow(max(a, 3.0), -1.5) + fase * 6.2831853;
  return p0 * cos(ang) + tangente * a * sin(ang);
}

float deflexion(float b) {
  return 2.0 * RS / b + COEF_SEGUNDO_ORDEN * RS * RS / (b * b);
}

float derivadaDeflexion(float b) {
  return -2.0 * RS / (b * b) - 2.0 * COEF_SEGUNDO_ORDEN * RS * RS / (b * b * b);
}

// Lente gravitacional del agujero (en el origen) sobre una fuente puntual, en aproximación de
// lente delgada. Resuelve la ecuación de la lente b − L·α(b) = b₀ con dos iteraciones de Newton
// a partir de la solución de campo débil; devuelve la posición aparente, la magnificación del
// flujo y el parámetro de impacto aparente del rayo (si es menor que el crítico, el rayo cae al
// agujero y el grano desaparece tras la sombra en vez de dibujarse encima de ella).
vec3 lensar(vec3 pFuente, vec3 camara, out float magnificacion, out float bAparente, out float detras) {
  vec3 d = pFuente - camara;
  float Ds = length(d);
  vec3 dn = d / Ds;
  float Dl = dot(-camara, dn);
  float Dls = Ds - Dl;
  vec3 bVec = camara + dn * Dl;
  float bReal = length(bVec);
  // Sólo se curva la luz que pasa junto al agujero de camino a la cámara: L → 0 de forma
  // continua cuando la fuente queda por delante de la lente o la lente detrás de la cámara.
  float L = max(Dl, 0.0) * max(Dls, 0.0) / Ds;
  float K = 2.0 * RS * L;
  float b = 0.5 * (bReal + sqrt(bReal * bReal + 4.0 * K));
  for (int i = 0; i < 2; i++) {
    b -= (b - L * deflexion(b) - bReal) / (1.0 - L * derivadaDeflexion(b));
  }
  bAparente = b;
  detras = smoothstep(0.0, 4.0, Dls);
  // Fuente puntual: μ = (b/b₀)·(db/db₀). La lente conserva el brillo superficial, así que la
  // imagen estirada de un grano brilla más; se acota para no reventar el bloom.
  float dbdb0 = 1.0 / (1.0 - L * derivadaDeflexion(b));
  magnificacion = clamp((b / max(bReal, 1e-3)) * dbdb0, 1.0, 2.0);
  vec3 bHat = bVec / max(bReal, 1e-3);
  return pFuente + bHat * (b - bReal) * (Ds / max(Dl, 1e-3));
}
`
