/**
 * El valle de las flores alrededor del corazón (ver `utils/campos.ts`), pintado en el suelo: la misma
 * geometría que en la CPU (celdas de Voronoi sobre un dominio deformado y estirado a lo largo del eje
 * del valle, con los datos de cada celda en `uCeldas`), con los bordes nítidos a cualquier altura. Cada campo con su cultivo y sus hileras
 * (los detalles se apagan cuando miden menos de unos píxeles: de lejos, su color medio, sin muaré),
 * caminos, setos de árboles y lindes entre campos, el arroyo con sus árboles, las casas de los
 * patios y el prado alrededor del corazón. Necesita RUIDO_2D y CORAZON_GLSL (y `uCorazon`).
 *
 * También las parcelas del resto del valle, más grandes: polígonos irregulares alargados en el mismo
 * eje, con sus franjas casi todas a lo largo de él, y caminos y setos entre ellos.
 */
export const CAMPOS_GLSL = /* glsl */ `
uniform sampler2D uCeldas;

const float LARGO_CAMPOS = 230.0;
const float ANCHO_CAMPOS = 125.0;
const vec2 EJE_CAMPOS = vec2(0.70710678, 0.70710678);
const int N_CAMPOS = 24;

// Del valle (m, ya deformado) a la rejilla de manzanas, y de vuelta.
vec2 aRejilla(vec2 w) {
  return vec2(dot(w, EJE_CAMPOS) / LARGO_CAMPOS, dot(w, vec2(-EJE_CAMPOS.y, EJE_CAMPOS.x)) / ANCHO_CAMPOS);
}
vec2 deRejilla(vec2 q) {
  return EJE_CAMPOS * q.x * LARGO_CAMPOS + vec2(-EJE_CAMPOS.y, EJE_CAMPOS.x) * q.y * ANCHO_CAMPOS;
}

vec2 ondaCampos(vec2 p) {
  return vec2(
    34.0 * sin(p.y / 237.0 + 1.3) + 12.0 * sin(p.y / 83.0 + p.x / 111.0 + 4.1),
    34.0 * sin(p.x / 251.0 + 0.7) + 12.0 * sin(p.x / 77.0 - p.y / 123.0 + 2.2)
  );
}

vec4 datosCelda(ivec2 c) {
  ivec2 k = clamp(c + ivec2(N_CAMPOS / 2), ivec2(0), ivec2(N_CAMPOS - 1));
  return texelFetch(uCeldas, k, 0);
}

// El cultivo de una franja (la misma cuenta que en la CPU).
float cultivoFranja(float semilla, float franja, float cerca, float vista) {
  float grupo = floor(franja / (1.0 + floor(fract(semilla * 5.3) * 3.0)));
  float h = fract(semilla * 97.13 + grupo * 0.618034);
  float p0 = 0.2 + 0.25 * cerca + 0.45 * vista;
  float p1 = 0.07 + 0.05 * cerca;
  float p2 = 0.06 + 0.04 * cerca;
  float p3 = 0.05 + 0.03 * cerca;
  float p4 = 0.04 + 0.02 * cerca;
  float p5 = 0.08;
  float p6 = 0.17 - 0.07 * cerca;
  float p7 = 0.14 - 0.06 * cerca;
  float p8 = 0.09 - 0.04 * cerca;
  float u = h * (p0 + p1 + p2 + p3 + p4 + p5 + p6 + p7 + p8);
  if (u < p0) return 1.0;
  u -= p0;
  if (u < p1) return 2.0;
  u -= p1;
  if (u < p2) return 3.0;
  u -= p2;
  if (u < p3) return 4.0;
  u -= p3;
  if (u < p4) return 5.0;
  u -= p4;
  if (u < p5) return 0.0;
  u -= p5;
  if (u < p6) return 6.0;
  u -= p6;
  if (u < p7) return 7.0;
  return 8.0;
}

struct Campo {
  float cultivo;
  float angulo;
  vec2 sitio;
  float borde;
  float tipoBorde;
  float bordeFranja;
  float tipoManzana;
  float semilla;
  float franja;
};

// El campo en xz: la misma cuenta que 'campoEn' de 'utils/campos.ts'.
Campo campoEn(vec2 xz) {
  vec2 q = aRejilla(xz + ondaCampos(xz));
  ivec2 g = ivec2(floor(q));
  float mejor = 1e9;
  ivec2 mejorC = g;
  vec2 mejorS = vec2(0.0);
  vec4 mejorD = vec4(0.0);
  for (int dz = -1; dz <= 1; dz++) {
    for (int dx = -1; dx <= 1; dx++) {
      ivec2 c = g + ivec2(dx, dz);
      vec4 d = datosCelda(c);
      vec2 s = vec2(c) + d.xy;
      float dist = dot(s - q, s - q);
      if (dist < mejor) {
        mejor = dist;
        mejorC = c;
        mejorS = s;
        mejorD = d;
      }
    }
  }
  float borde = 1e9;
  vec4 vecinoD = mejorD;
  for (int dz = -2; dz <= 2; dz++) {
    for (int dx = -2; dx <= 2; dx++) {
      if (dx == 0 && dz == 0) continue;
      ivec2 c = mejorC + ivec2(dx, dz);
      vec4 d = datosCelda(c);
      vec2 s = vec2(c) + d.xy;
      vec2 nrm = s - mejorS;
      float l = length(nrm / vec2(LARGO_CAMPOS, ANCHO_CAMPOS));
      if (l < 1e-9) continue;
      float e = -dot(q - 0.5 * (mejorS + s), nrm) / l;
      if (e < borde) {
        borde = e;
        vecinoD = d;
      }
    }
  }
  Campo campo;
  vec2 sitioRejilla = deRejilla(mejorS);
  campo.sitio = sitioRejilla - ondaCampos(sitioRejilla);
  campo.angulo = mejorD.z;
  campo.tipoManzana = floor(mejorD.w);
  campo.semilla = fract(mejorD.w);
  float azarBorde = fract((mejorD.w + vecinoD.w) * 4.7 + (mejorD.x + vecinoD.x) * 1.3);
  campo.borde = borde;
  campo.tipoBorde = azarBorde < 0.28 ? 1.0 : azarBorde < 0.58 ? 2.0 : 0.0;
  vec2 nor = vec2(-sin(campo.angulo), cos(campo.angulo));
  float ancho = 18.0 + 27.0 * fract(campo.semilla * 7.31);
  float u = dot(xz - campo.sitio, nor);
  campo.franja = floor(u / ancho);
  float enFranja = u - campo.franja * ancho;
  float r = length(campo.sitio);
  float cerca = 1.0 - smoothstep(140.0, 620.0, r);
  float vista = smoothstep(-60.0, 20.0, (-campo.sitio.x - campo.sitio.y) * 0.70710678) * (1.0 - smoothstep(260.0, 380.0, r));
  if (campo.tipoManzana > 0.5 && campo.tipoManzana < 1.5) campo.cultivo = 1.0;
  else if (campo.tipoManzana > 1.5 && campo.tipoManzana < 2.5) campo.cultivo = 9.0;
  else if (campo.tipoManzana > 2.5 && campo.tipoManzana < 3.5) campo.cultivo = 10.0;
  else if (campo.tipoManzana > 3.5) campo.cultivo = 11.0;
  else campo.cultivo = cultivoFranja(campo.semilla, campo.franja, cerca, vista);
  campo.bordeFranja = campo.tipoManzana < 0.5 ? min(enFranja, ancho - enFranja) : 1e9;
  return campo;
}

// El arroyo (la misma polilínea que en la CPU).
const vec2 ARROYO[7] = vec2[](
  vec2(-760.0, -1150.0), vec2(-560.0, -760.0), vec2(-330.0, -420.0), vec2(-290.0, -120.0),
  vec2(-360.0, 220.0), vec2(-250.0, 560.0), vec2(-60.0, 980.0)
);

float distanciaArroyo(vec2 xz) {
  vec2 q = vec2(xz.x + 26.0 * sin(xz.y / 61.0 + 0.4) + 11.0 * sin(xz.y / 23.0 + 1.7), xz.y + 14.0 * sin(xz.x / 57.0 + 2.1));
  float d = 1e9;
  for (int i = 0; i < 6; i++) {
    vec2 a = ARROYO[i];
    vec2 ab = ARROYO[i + 1] - a;
    float h = clamp(dot(q - a, ab) / dot(ab, ab), 0.0, 1.0);
    d = min(d, length(q - a - ab * h));
  }
  return d;
}

float distanciaPrado(vec2 xz) {
  float angulo = atan(xz.y, xz.x);
  return corazonEn(xz, uCorazon) - (13.0 + 4.0 * sin(angulo * 5.0 + 1.3) + 2.0 * sin(angulo * 11.0 + 0.4));
}

// Copas de árboles vistas desde arriba (en una franja): círculos de 2 a 3 m con el lado del Sol más
// claro y la sombra entre ellos; de lejos, su color medio. Devuelve la cobertura en 'a'.
vec3 copas(vec2 xz, float mPorPixel, out float a) {
  vec2 celda = floor(xz / 4.6);
  float mejor = 1e9;
  vec2 rel = vec2(0.0);
  float radio = 2.4;
  for (int dz = -1; dz <= 1; dz++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 c = celda + vec2(float(dx), float(dz));
      vec2 centro = (c + 0.2 + 0.6 * hash22(c + 3.3)) * 4.6;
      float r = 2.0 + 1.1 * hash21(c + 8.1);
      float d = length(xz - centro) - r;
      if (d < mejor) {
        mejor = d;
        rel = (xz - centro) / r;
        radio = r;
      }
    }
  }
  float w = max(mPorPixel, 0.02);
  a = 1.0 - smoothstep(-w, w, mejor);
  // El Sol, por el este-noreste: el lado de la copa que lo mira, más claro.
  float luz = dot(rel, normalize(vec2(0.95, -0.31)));
  vec3 copa = mix(vec3(0.24, 0.42, 0.27), vec3(0.4, 0.6, 0.35), smoothstep(-0.3, 0.6, luz));
  vec3 color = mix(vec3(0.2, 0.33, 0.24), copa, a);
  return mix(color, vec3(0.3, 0.48, 0.3), smoothstep(0.8, 2.5, mPorPixel));
}

// Colores de los cultivos del valle de las flores.
vec3 colorCultivoFlores(float cultivo, float semilla) {
  if (cultivo < 0.5) return vec3(0.55, 0.74, 0.36);
  if (cultivo < 1.5) return vec3(0.97, 0.8, 0.22);
  if (cultivo < 2.5) return mix(vec3(0.96, 0.58, 0.76), vec3(0.98, 0.7, 0.82), semilla);
  if (cultivo < 3.5) return mix(vec3(0.76, 0.6, 0.88), vec3(0.84, 0.7, 0.92), semilla);
  if (cultivo < 4.5) return mix(vec3(0.87, 0.3, 0.58), vec3(0.8, 0.2, 0.42), semilla);
  if (cultivo < 5.5) return vec3(0.98, 0.96, 0.93);
  if (cultivo < 6.5) return vec3(0.43, 0.65, 0.3);
  if (cultivo < 7.5) return vec3(0.37, 0.56, 0.25);
  if (cultivo < 8.5) return vec3(0.74, 0.58, 0.42);
  if (cultivo < 9.5) return vec3(0.9, 0.92, 0.93);
  if (cultivo < 10.5) return vec3(0.5, 0.68, 0.34);
  return vec3(0.84, 0.76, 0.62);
}

// El valle de las flores en xz (m): el color y, en 'peso', cuánto cubre (se funde con las parcelas
// del resto del valle en su borde).
vec3 pintarCampos(vec2 xz, float mPorPixel, float dCamara, out float peso) {
  peso = 1.0 - smoothstep(1050.0, 1300.0, max(abs(xz.x), abs(xz.y)));
  if (peso <= 0.001) return vec3(0.0);
  Campo campo = campoEn(xz);
  float cultivo = campo.cultivo;
  float semilla = fract(campo.semilla * 3.1 + campo.franja * 0.37);
  float borde = campo.borde;
  float tipoBorde = campo.tipoBorde;
  vec2 dir = vec2(cos(campo.angulo), sin(campo.angulo));
  vec2 nor = vec2(-dir.y, dir.x);
  vec2 sitio = campo.sitio;
  float u = dot(xz - sitio, nor);
  float fw = max(mPorPixel, 1e-3);
  vec3 base = colorCultivoFlores(cultivo, semilla);
  vec3 color = base;
  // Manchas suaves dentro de cada campo (la tierra, el riego, las plantas más o menos crecidas).
  color *= 0.95 + 0.1 * fbm2(xz / 23.0 + semilla * 17.0);

  if (cultivo > 0.5 && cultivo < 1.5) {
    // Girasoles desde arriba: amarillo con manchas doradas (las cabezas se juntan) y, al
    // acercarse, las hileras con la tierra entre ellas.
    float manchas = fbm2(xz / 7.0 + semilla * 9.0);
    color = mix(color, vec3(0.9, 0.66, 0.15), smoothstep(0.45, 0.75, manchas) * 0.6);
    color = mix(color, vec3(0.99, 0.88, 0.36), smoothstep(0.64, 0.8, fbm2(xz / 2.6 + 4.0)) * 0.45);
    float hilera = abs(fract(u / 0.9) - 0.5) * 0.9;
    float verHileras = 1.0 - smoothstep(0.12, 0.3, fw);
    color = mix(color, vec3(0.46, 0.56, 0.24), (1.0 - smoothstep(0.1, 0.1 + fw, hilera)) * verHileras * 0.7);
    // El borde del campo: se ven los tallos y las hojas.
    color = mix(color, vec3(0.45, 0.6, 0.26), (1.0 - smoothstep(1.5, 3.0, min(borde, campo.bordeFranja))) * 0.55);
  } else if (cultivo > 1.5 && cultivo < 5.5) {
    // Flores de corte en hileras de 1,4 m: la flor y el follaje; de lejos, el color medio.
    float hilera = abs(fract(u / 1.4) - 0.5) * 1.4;
    float flor = 1.0 - smoothstep(0.34, 0.34 + fw, hilera);
    vec3 follaje = vec3(0.4, 0.6, 0.3);
    vec3 hileras = mix(follaje, color, flor);
    color = mix(hileras, mix(follaje, color, 0.62), smoothstep(0.35, 0.8, fw));
  } else if (cultivo > 6.5 && cultivo < 8.5) {
    // Maíz (hileras verdes) y tierra arada (surcos).
    float hilera = abs(fract(u / 0.85) - 0.5) * 0.85;
    vec3 oscuro = cultivo < 7.5 ? vec3(0.3, 0.47, 0.22) : vec3(0.62, 0.47, 0.34);
    color = mix(color, oscuro, (1.0 - smoothstep(0.15, 0.15 + fw, hilera)) * (1.0 - smoothstep(0.2, 0.5, fw)) * 0.8);
  } else if (cultivo > 8.5 && cultivo < 9.5) {
    // Invernaderos: naves largas de 7 m, de plástico claro, con la canaleta entre ellas.
    float nave = abs(fract(u / 7.0) - 0.5) * 7.0;
    float luz = 0.5 + 0.5 * sin(u / 7.0 * 6.2831853 + 1.2);
    color = mix(vec3(0.84, 0.88, 0.9), vec3(0.97, 0.98, 0.98), luz);
    color = mix(color, vec3(0.64, 0.68, 0.7), (1.0 - smoothstep(3.2, 3.2 + fw, nave)) * (1.0 - smoothstep(0.8, 2.0, fw)));
    // Pasillos entre bloques de naves, cada 60 m.
    float pasillo = abs(fract(dot(xz - sitio, dir) / 60.0) - 0.5) * 60.0;
    color = mix(color, vec3(0.8, 0.74, 0.6), 1.0 - smoothstep(1.5, 1.5 + fw, pasillo));
  } else if (cultivo > 9.5 && cultivo < 10.5) {
    // Huerto: árboles en marco de 5 m sobre pasto.
    vec2 lc = vec2(dot(xz - sitio, dir), u);
    vec2 enMarco = fract(lc / 5.0) - 0.5;
    float copa = 1.0 - smoothstep(0.26, 0.26 + fw / 5.0, length(enMarco));
    vec3 arbol = mix(vec3(0.26, 0.44, 0.27), vec3(0.4, 0.6, 0.35), smoothstep(-0.3, 0.3, dot(enMarco, normalize(vec2(0.95, -0.31)))));
    color = mix(color, arbol, copa * (1.0 - smoothstep(0.6, 1.6, fw)));
    color = mix(color, vec3(0.36, 0.54, 0.3), smoothstep(0.6, 1.6, fw) * 0.6);
  } else if (cultivo > 10.5) {
    // Patio: tierra apisonada con su casa (en el punto de la manzana), un corral de pasto y unos
    // árboles.
    vec2 enCasa = vec2(dot(xz - sitio, dir), u);
    vec2 medida = vec2(8.0 + 4.0 * campo.semilla, 5.5 + 2.0 * fract(campo.semilla * 7.0));
    vec2 dCasa = abs(enCasa) - medida;
    float casa = 1.0 - smoothstep(-fw, fw, max(dCasa.x, dCasa.y));
    vec3 tejado = campo.semilla < 0.7 ? vec3(0.82, 0.44, 0.32) : vec3(0.96, 0.94, 0.9);
    // La cumbrera: el faldón que mira al Sol, más claro.
    tejado *= enCasa.y * dot(nor, normalize(vec2(0.95, -0.31))) > 0.0 ? 1.06 : 0.84;
    float sombra = 1.0 - smoothstep(-fw, fw, max(abs(enCasa.x + 2.5) - medida.x, abs(enCasa.y - 2.0) - medida.y));
    float corral = step(length(enCasa - vec2(22.0, -6.0)), 18.0);
    color = mix(color, vec3(0.52, 0.7, 0.35), corral * 0.8);
    color = mix(color, color * 0.72, sombra * (1.0 - casa));
    color = mix(color, tejado, casa);
    float aArbol;
    vec3 arboles = copas(xz, mPorPixel, aArbol);
    float zonaArboles = step(length(enCasa), 40.0) * step(14.0, length(enCasa)) * step(0.5, fbm2(xz / 9.0));
    color = mix(color, arboles, aArbol * zonaArboles);
  }

  // Entre franjas, una linde de pasto (más visible cuando la franja vecina es de otro cultivo).
  float linde = 1.0 - smoothstep(0.45, 0.45 + fw, campo.bordeFranja);
  color = mix(color, vec3(0.5, 0.68, 0.33), linde * (1.0 - smoothstep(1.5, 4.0, fw)));

  // Bordes entre manzanas: caminos de tierra, setos de árboles o una linde (las franjas se juntan).
  if (tipoBorde < 0.5) {
    color = mix(color, vec3(0.5, 0.68, 0.33), (1.0 - smoothstep(0.5, 0.5 + fw, borde)) * (1.0 - smoothstep(1.5, 4.0, fw)));
  } else if (tipoBorde < 1.5) {
    float ancho = max(1.7, 0.7 * fw);
    color = mix(color, vec3(0.88, 0.8, 0.64), 1.0 - smoothstep(ancho, ancho + fw, borde));
  } else {
    float aArbol;
    vec3 arboles = copas(xz, mPorPixel, aArbol);
    float franja = 1.0 - smoothstep(3.6, 3.6 + fw, borde);
    color = mix(color, arboles, max(aArbol, smoothstep(0.8, 2.5, fw)) * franja);
  }

  // El arroyo, con árboles a los lados.
  float dArroyo = distanciaArroyo(xz);
  if (dArroyo < 14.0) {
    float aArbol;
    vec3 arboles = copas(xz + 31.7, mPorPixel, aArbol);
    color = mix(color, arboles, max(aArbol, smoothstep(0.8, 2.5, fw)) * (1.0 - smoothstep(10.0, 10.0 + fw, dArroyo)));
    float agua = 1.0 - smoothstep(max(2.0, 0.8 * fw), max(2.0, 0.8 * fw) + fw, dArroyo);
    color = mix(color, mix(vec3(0.44, 0.68, 0.84), vec3(0.62, 0.82, 0.92), 0.5 + 0.5 * sin(xz.y * 0.9 + xz.x * 0.4)), agua);
  }

  // El prado alrededor del corazón, con florecillas sueltas de cerca.
  float dPrado = distanciaPrado(xz);
  if (dPrado < fw) {
    vec3 prado = vec3(0.56, 0.75, 0.37) * (0.95 + 0.1 * fbm2(xz / 3.0));
    vec3 punto = celdas2(xz / 0.5);
    float florecilla = (1.0 - smoothstep(0.12, 0.18, punto.x)) * step(0.7, punto.z) * (1.0 - smoothstep(0.03, 0.08, fw));
    prado = mix(prado, punto.z < 0.85 ? vec3(1.0, 0.97, 0.9) : vec3(0.98, 0.72, 0.84), florecilla);
    color = mix(color, prado, 1.0 - smoothstep(-fw, fw, dPrado));
  }
  return color;
}

// Colores de los cultivos del resto del valle en la época de lluvias: alfalfa, maíz, pasto, trigo y
// cebada, tierra arada, huertos; alguna parcela de flores.
vec3 colorCultivo(float id) {
  if (id < 0.03) return vec3(0.93, 0.66, 0.78);
  if (id < 0.05) return vec3(0.8, 0.68, 0.9);
  float t = (id - 0.05) / 0.95;
  if (t < 0.22) return vec3(0.5, 0.69, 0.31);
  if (t < 0.4) return vec3(0.62, 0.75, 0.36);
  if (t < 0.55) return vec3(0.74, 0.81, 0.46);
  if (t < 0.7) return vec3(0.9, 0.8, 0.46);
  if (t < 0.84) return vec3(0.74, 0.58, 0.4);
  return vec3(0.4, 0.58, 0.3);
}

// Las parcelas del resto del valle: polígonos irregulares alargados en el eje del valle (Voronoi de
// ~400 × 220 m sobre un dominio deformado), partidos en franjas casi todas a lo largo del eje;
// entre ellos, caminos de tierra, setos de árboles o lindes. De lejos, cada nivel de detalle se
// funde en su color medio.
vec3 parcelas(vec2 xz, float mPorPixel, float muyCerca) {
  const vec2 CELDA = vec2(400.0, 220.0);
  vec2 w = xz + vec2(40.0 * sin(xz.y / 530.0 + 0.3) + 18.0 * sin(xz.y / 170.0 + xz.x / 230.0), 40.0 * sin(xz.x / 610.0 + 2.1) + 18.0 * sin(xz.x / 190.0 - xz.y / 260.0));
  vec2 q = vec2(dot(w, EJE_CAMPOS), dot(w, vec2(-EJE_CAMPOS.y, EJE_CAMPOS.x))) / CELDA;
  vec2 g = floor(q);
  float mejor = 1e9;
  vec2 mejorC = g;
  vec2 mejorS = vec2(0.0);
  for (int dz = -1; dz <= 1; dz++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 c = g + vec2(float(dx), float(dz));
      vec2 s = c + 0.12 + 0.76 * hash22(c + 17.3);
      float d = dot(s - q, s - q);
      if (d < mejor) {
        mejor = d;
        mejorC = c;
        mejorS = s;
      }
    }
  }
  float borde = 1e9;
  vec2 vecinoC = mejorC;
  for (int dz = -2; dz <= 2; dz++) {
    for (int dx = -2; dx <= 2; dx++) {
      if (dx == 0 && dz == 0) continue;
      vec2 c = mejorC + vec2(float(dx), float(dz));
      vec2 s = c + 0.12 + 0.76 * hash22(c + 17.3);
      vec2 nrm = s - mejorS;
      float e = -dot(q - 0.5 * (mejorS + s), nrm) / max(length(nrm / CELDA), 1e-9);
      if (e < borde) {
        borde = e;
        vecinoC = c;
      }
    }
  }
  float id = hash21(mejorC + 5.1);
  float angulo = atan(EJE_CAMPOS.y, EJE_CAMPOS.x) + (hash21(mejorC + 9.7) < 0.28 ? 1.5707963 : 0.0) + (hash21(mejorC + 4.4) - 0.5) * 0.14;
  vec2 nor = vec2(-sin(angulo), cos(angulo));
  float coord = dot(xz, nor);
  float ancho = mix(35.0, 110.0, hash21(mejorC + 2.3));
  float franja = floor(coord / ancho);
  vec3 colorFranja = colorCultivo(hash21(vec2(id * 91.7, franja)));
  vec3 colorMedio = 0.5 * (colorCultivo(hash21(vec2(id * 91.7, 1.0))) + colorCultivo(hash21(vec2(id * 91.7, 2.0))));
  float fw = max(mPorPixel, 1e-3);
  vec3 color = mix(colorMedio, colorFranja, smoothstep(3.0, 6.0, ancho / fw));
  // De lejos, un verde común con matices (no un tablero).
  vec3 verdeValle = vec3(0.6, 0.72, 0.38) * (0.96 + 0.06 * id + 0.08 * (fbm2(xz / 3000.0) - 0.5));
  color = mix(mix(color, verdeValle, 0.65), color, smoothstep(10.0, 30.0, CELDA.y / fw));
  color *= mix(1.0, 0.92 + 0.1 * (0.5 + 0.5 * sin(coord * 2.1)), muyCerca);
  // Lindes entre franjas.
  float aLinde = min(fract(coord / ancho), 1.0 - fract(coord / ancho)) * ancho;
  color = mix(color, color * 0.84, (1.0 - smoothstep(0.8, 0.8 + 1.5 * fw, aLinde)) * smoothstep(8.0, 14.0, ancho / fw));
  // Bordes entre parcelas: camino, seto o linde según la pareja de celdas.
  float azarBorde = fract(hash21(mejorC + 1.7) + hash21(vecinoC + 1.7));
  if (azarBorde < 0.3) {
    float anchoCamino = max(2.5, 1.1 * fw);
    color = mix(color, vec3(0.88, 0.8, 0.64), (1.0 - smoothstep(anchoCamino, anchoCamino + fw, borde)) * (1.0 - smoothstep(20.0, 45.0, fw)));
  } else if (azarBorde < 0.56) {
    float aArbol;
    vec3 arboles = copas(xz, fw, aArbol);
    float franjaArboles = 1.0 - smoothstep(4.0, 4.0 + fw, borde);
    color = mix(color, arboles, max(aArbol, smoothstep(0.8, 2.5, fw)) * franjaArboles * (1.0 - smoothstep(20.0, 45.0, fw)));
  }
  // Casas sueltas junto a los caminos.
  vec2 celdaCasa = floor(xz / 70.0);
  vec2 enCasa = xz - (celdaCasa + 0.5) * 70.0;
  float hayCasa = step(0.86, hash21(celdaCasa + 2.7)) * step(borde, 40.0) * step(8.0, borde);
  vec2 medida = vec2(7.0 + 5.0 * hash21(celdaCasa), 5.0 + 4.0 * hash21(celdaCasa + 1.1));
  vec2 dCasa = abs(enCasa) - medida;
  float casa = hayCasa * (1.0 - smoothstep(-0.5, 0.5, max(dCasa.x, dCasa.y))) * (1.0 - smoothstep(4.0, 8.0, fw));
  vec3 tejado = hash21(celdaCasa + 5.3) < 0.7 ? vec3(0.82, 0.44, 0.32) : vec3(0.96, 0.94, 0.9);
  tejado *= mix(0.85, 1.05, step(0.0, enCasa.x));
  return mix(color, tejado, casa);
}
`
