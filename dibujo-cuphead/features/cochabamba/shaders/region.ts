/**
 * La región de Cochabamba pintada desde el aire (ver `utils/region.ts` y `utils/texturaRegion.ts`),
 * para el mapa de la Tierra y el relieve 3D de la bajada: colores de acuarela naturales según la
 * altura, la humedad y lo llano del terreno, y el relieve sombreado con el Sol bajo del amanecer
 * en tres tonos suaves (la ladera que mira al Sol, dorada; la que le da la espalda, lila).
 *
 * Coordenadas en km en el plano tangente centrado en el corazón de flores (x al este, y al norte).
 */
export const REGION_GLSL = /* glsl */ `
uniform sampler2D uRegion;
uniform float uLadoRegion;
// Sombras de las nubes de la llegada (R), en un cuadrado de uLadoSombras km centrado en el corazón.
uniform sampler2D uSombrasNubes;
uniform float uLadoSombras;

// Sombra de las nubes (0..1) en un punto (km del centro).
float sombraNubes(vec2 km) {
  vec2 uv = km / uLadoSombras + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 0.0;
  return texture(uSombrasNubes, uv).r;
}

float hashRegion(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float ruidoRegion(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hashRegion(i), hashRegion(i + vec2(1.0, 0.0)), u.x), mix(hashRegion(i + vec2(0.0, 1.0)), hashRegion(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbmRegion(vec2 p) {
  return (0.5 * ruidoRegion(p) + 0.25 * ruidoRegion(p * 2.03 + 17.1) + 0.125 * ruidoRegion(p * 4.1 + 3.7)) / 0.875;
}

// Montañas de detalle: crestas multifractales sobre un dominio deformado (como las de la región),
// con las octavas más finas que dos píxeles apagadas. 0..1.
float montanasDetalle(vec2 p, float onda, float kmPorPixel) {
  vec2 w = vec2(fbmRegion(p / (onda * 1.6)), fbmRegion(p / (onda * 1.6) + vec2(5.2, 9.4))) - 0.5;
  vec2 q = p + onda * 0.9 * w;
  float frecuencia = 1.0 / onda;
  float amplitud = 1.0;
  float suma = 0.0;
  float total = 0.0;
  float peso = 1.0;
  for (int k = 0; k < 3; k++) {
    float visible = 1.0 - smoothstep(0.2, 0.4, kmPorPixel * frecuencia);
    float n = 1.0 - abs(2.0 * ruidoRegion(q * frecuencia + vec2(float(k) * 7.31, float(k) * 3.17)) - 1.0);
    n *= n;
    n *= peso;
    peso = clamp(n * 1.7, 0.0, 1.0);
    suma += n * amplitud * visible;
    total += amplitud;
    frecuencia *= 2.15;
    amplitud *= 0.52;
  }
  return suma / total;
}

// Pendiente (km por km) del relieve de detalle de las sierras: filos y quebradas nítidos a
// cualquier altura de vuelo, que la textura (de casi 5 km) y la malla lejana no pueden dibujar.
vec2 pendienteDetalle(vec2 km, float kmPorPixel) {
  const float ONDA = 16.0;
  const float ALTO = 1.2;
  float e = max(0.25, 0.9 * kmPorPixel);
  float c = montanasDetalle(km, ONDA, kmPorPixel);
  float dx = montanasDetalle(km + vec2(e, 0.0), ONDA, kmPorPixel) - c;
  float dy = montanasDetalle(km + vec2(0.0, e), ONDA, kmPorPixel) - c;
  return ALTO * vec2(dx, dy) / e;
}

// Cuánto relieve de detalle lleva el terreno: en las sierras, no en lo llano ni en el valle del
// centro (allí la malla ya dibuja el suyo).
float sierraDetalle(float h, float llano, vec2 km) {
  return smoothstep(1.2, 2.3, h) * (1.0 - 0.8 * llano) * smoothstep(22.0, 36.0, length(km));
}

// Altura (km), humedad, agua y sal en un punto (km del centro).
vec4 muestraRegion(vec2 km) {
  return texture(uRegion, km / uLadoRegion + 0.5);
}

// Pendiente del terreno (km por km) por diferencias centradas, a la escala de un texel o de la
// huella del píxel si es mayor (así el sombreado no parpadea de lejos).
vec2 pendienteRegion(vec2 km, float paso) {
  float hx = muestraRegion(km + vec2(paso, 0.0)).r - muestraRegion(km - vec2(paso, 0.0)).r;
  float hy = muestraRegion(km + vec2(0.0, paso)).r - muestraRegion(km - vec2(0.0, paso)).r;
  return vec2(hx, hy) / (2.0 * paso);
}

// Colores de la región, de dibujo: zonas de color plano con el borde nítido (a un píxel) y
// contornos orgánicos (el borde de cada zona lleva ruido), según la altura, la humedad y lo llano.
// region: altura (km), humedad, agua, sal; llano: 1 en lo llano; detalle: 1 cuando el píxel mide
// menos de un km (se ven las manchas pequeñas).
vec3 colorRegion(vec4 region, float llano, vec2 km, float detalle) {
  float h = region.r;
  float humedad = region.g;
  float grandes = fbmRegion(km / 40.0);
  float medianas = fbmRegion(km / 9.0 + 5.3);
  float finas = mix(0.5, fbmRegion(km / 1.8 + 9.1), detalle);
  float borde = 0.72 * (grandes - 0.5) + 0.22 * (medianas - 0.5) + 0.06 * (finas - 0.5);

  // Tierras bajas: selva (con el dosel a manchas), sabana del Beni, bosque seco del Chaco, desierto.
  vec3 selva = mix(vec3(0.26, 0.5, 0.23), vec3(0.33, 0.58, 0.26), zona(finas + 0.4 * medianas, 0.72));
  vec3 bajo = vec3(0.94, 0.8, 0.5);
  bajo = mix(bajo, vec3(0.66, 0.7, 0.4), zona(humedad + 0.2 * borde, 0.2));
  bajo = mix(bajo, vec3(0.47, 0.72, 0.31), zona(humedad + 0.2 * borde, 0.42));
  bajo = mix(bajo, selva, zona(humedad + 0.25 * borde, 0.6));

  // Sierras: bosque de las yungas donde llueve; matorral oliva; tierra ocre donde es seco; los
  // valles cultivados en lo llano.
  vec3 ladera = vec3(0.86, 0.7, 0.49);
  ladera = mix(ladera, vec3(0.68, 0.68, 0.42), zona(humedad + 0.24 * borde, 0.33));
  ladera = mix(ladera, vec3(0.34, 0.58, 0.3), zona(humedad + 0.24 * borde, 0.62));
  vec3 cultivo = mix(vec3(0.56, 0.72, 0.36), vec3(0.74, 0.76, 0.46), zona(medianas + 0.3 * finas, 0.62));
  // Puna y Altiplano: pajizo claro con bofedales verdes; roca malva en las cumbres.
  vec3 puna = mix(vec3(0.92, 0.82, 0.63), vec3(0.86, 0.77, 0.63), zona(grandes, 0.55));
  puna = mix(puna, vec3(0.6, 0.66, 0.42), zona(medianas + 0.3 * finas, 0.9));
  vec3 roca = mix(vec3(0.72, 0.63, 0.6), vec3(0.64, 0.56, 0.56), zona(medianas, 0.55));

  vec3 color = bajo;
  color = mix(color, ladera, zona(h + 0.35 * borde, 0.9));
  color = mix(color, cultivo, zona(llano + 0.4 * borde, 0.6) * zona(h, 1.4) * (1.0 - zona(h, 3.4)) * zona(humedad, 0.3));
  color = mix(color, puna, zona(h + 0.3 * borde, 3.55) * (1.0 - zona(humedad + 0.2 * borde, 0.66)));
  color = mix(color, roca, zona(h + 0.35 * borde, 4.55));
  // La nieve, más alta donde es seco (en la Occidental sólo la llevan los volcanes).
  float lineaNieve = 5.05 + 0.75 * (1.0 - smoothstep(0.2, 0.6, humedad));
  color = mix(color, vec3(0.98, 0.98, 1.0), zona(h + 0.3 * borde + 0.1 * llano, lineaNieve));

  // Salares: blancos con la orilla crema; lagos: turquesa con la orilla clara.
  color = mix(color, vec3(0.9, 0.86, 0.78), zona(region.a, 0.38));
  color = mix(color, vec3(0.98, 0.97, 0.95), zona(region.a, 0.52));
  color = mix(color, vec3(0.45, 0.72, 0.86), zona(region.b, 0.5));
  color = mix(color, vec3(0.22, 0.5, 0.76), zona(region.b, 0.78));
  return color;
}

// Luz del Sol bajo sobre el relieve, de dibujo: tres tonos con el paso nítido (a un píxel), la
// ladera que mira al Sol dorada y clara, la otra en sombra violeta azulada. n y sol en el plano
// tangente (x este, y norte, z arriba).
vec3 luzRegion(vec3 color, vec3 n, vec3 sol) {
  float plano = max(sol.z, 0.05);
  // Relativa a la de lo llano: el sombreado dibuja el relieve sin oscurecer el mapa entero.
  float relativa = dot(n, sol) / plano;
  float sombra = 1.0 - zona(relativa, 0.5);
  float brillo = zona(relativa, 1.3);
  vec3 luz = mix(vec3(1.0), vec3(0.76, 0.74, 0.93), sombra);
  luz = mix(luz, vec3(1.09, 1.03, 0.91), brillo);
  return color * luz;
}
`
