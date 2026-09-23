/**
 * Shaders del sistema solar. Nada es una textura de imagen: el aspecto de cada planeta sale de
 * ruido 3D sobre su esfera (bandas de Júpiter y Saturno, continentes, nubes y casquetes de la
 * Tierra, mares oscuros de Marte...) y la luz es la del Sol de la escena, con su terminador
 * día/noche real (el lado de noche es negro, como en las fotos de las sondas).
 */

const RUIDO_3D = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float ruido3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}

float fbm3(vec3 p) {
  float suma = 0.0;
  float amplitud = 0.5;
  for (int k = 0; k < 5; k++) {
    suma += amplitud * ruido3(p);
    p = p * 2.02 + vec3(11.3, 7.1, 3.7);
    amplitud *= 0.5;
  }
  return suma / 0.96875;
}
`

export const PLANETA_VERT = /* glsl */ `
varying vec3 vNormalMundo;
varying vec3 vPosMundo;
varying vec3 vLocal;

void main() {
  vLocal = normalize(position);
  vec4 mundo = modelMatrix * vec4(position, 1.0);
  vPosMundo = mundo.xyz;
  vNormalMundo = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * mundo;
}
`

export const PLANETA_FRAG = /* glsl */ `
uniform float uAspecto;
uniform vec3 uSol;
uniform float uAparicion;
uniform float uTiempo;

varying vec3 vNormalMundo;
varying vec3 vPosMundo;
varying vec3 vLocal;

${RUIDO_3D}

// Albedo por planeta sobre la esfera unidad (p = punto en su marco propio, y = eje de giro).
vec3 albedoPlaneta(vec3 p, int tipo, out vec3 atmosfera) {
  atmosfera = vec3(0.0);
  float lat = p.y;
  if (tipo == 0) {
    // Mercurio: roca gris con cráteres y rayos claros.
    vec3 col = vec3(0.50, 0.47, 0.44) * (0.72 + 0.5 * fbm3(p * 4.0));
    float crateres = smoothstep(0.60, 0.70, fbm3(p * 9.0 + 3.1));
    return col * (1.0 - 0.35 * crateres);
  }
  if (tipo == 1) {
    // Venus: nubes de ácido sulfúrico, crema amarillenta con bandas en V muy suaves.
    float bandas = fbm3(vec3(p.x * 2.0, p.y * 7.0, p.z * 2.0) + 2.3);
    atmosfera = vec3(1.0, 0.85, 0.55) * 0.35;
    return mix(vec3(0.93, 0.84, 0.62), vec3(0.80, 0.66, 0.44), 0.45 * bandas);
  }
  if (tipo == 2) {
    // Tierra: océanos, continentes, casquetes polares y nubes que se mueven.
    float continente = fbm3(p * 2.3 + vec3(1.7, 0.3, 4.1));
    float tierra = smoothstep(0.53, 0.57, continente);
    vec3 oceano = vec3(0.02, 0.08, 0.26) * (0.8 + 0.4 * fbm3(p * 6.0));
    vec3 suelo = mix(vec3(0.16, 0.26, 0.09), vec3(0.52, 0.43, 0.28), smoothstep(0.5, 0.72, fbm3(p * 5.0 + 7.0)));
    vec3 col = mix(oceano, suelo, tierra);
    float polo = smoothstep(0.80, 0.88, abs(lat) + 0.06 * fbm3(p * 8.0));
    col = mix(col, vec3(0.90, 0.94, 1.0), polo);
    float nubes = smoothstep(0.52, 0.74, fbm3(p * 3.4 + vec3(uTiempo * 0.012, 0.0, 0.0)));
    col = mix(col, vec3(0.96), nubes * 0.8);
    atmosfera = vec3(0.30, 0.52, 1.0);
    return col;
  }
  if (tipo == 3) {
    // Marte: óxido de hierro con los mares oscuros y los casquetes de hielo.
    vec3 col = vec3(0.66, 0.31, 0.15) * (0.78 + 0.4 * fbm3(p * 3.0));
    col = mix(col, vec3(0.33, 0.17, 0.10), 0.7 * smoothstep(0.55, 0.66, fbm3(p * 2.2 + 5.0)));
    col = mix(col, vec3(0.92, 0.88, 0.84), smoothstep(0.90, 0.95, abs(lat)));
    atmosfera = vec3(0.9, 0.55, 0.35) * 0.25;
    return col;
  }
  if (tipo == 4) {
    // Júpiter: zonas claras y cinturones pardos, turbulentos, y la Gran Mancha Roja a 22° S.
    float turbulencia = fbm3(vec3(p.x * 2.5, p.y * 14.0, p.z * 2.5) + vec3(uTiempo * 0.004, 0.0, 0.0));
    float bandas = sin(lat * 23.0 + 2.2 * turbulencia);
    vec3 col = mix(vec3(0.62, 0.45, 0.31), vec3(0.93, 0.87, 0.75), 0.5 + 0.5 * bandas);
    col = mix(col, vec3(0.55, 0.52, 0.49), smoothstep(0.72, 0.96, abs(lat)));
    float lon = atan(p.z, p.x);
    vec2 mancha = vec2((lon - 1.1) * 0.9, (lat + 0.37) * 3.4);
    col = mix(col, vec3(0.78, 0.40, 0.27), 0.85 * (1.0 - smoothstep(0.10, 0.18, length(mancha))));
    return col;
  }
  if (tipo == 5) {
    // Saturno: bandas oro pálido muy suaves y el polo algo más frío.
    float turbulencia = fbm3(vec3(p.x * 2.0, p.y * 10.0, p.z * 2.0) + 4.0);
    float bandas = sin(lat * 17.0 + 1.2 * turbulencia);
    vec3 col = mix(vec3(0.80, 0.68, 0.47), vec3(0.94, 0.85, 0.63), 0.5 + 0.5 * bandas);
    return mix(col, vec3(0.62, 0.64, 0.60), smoothstep(0.78, 0.98, abs(lat)));
  }
  if (tipo == 6) {
    // Urano: aguamarina casi lisa (metano), girando de lado.
    atmosfera = vec3(0.55, 0.85, 0.95) * 0.5;
    return vec3(0.60, 0.84, 0.88) * (0.94 + 0.06 * sin(lat * 7.0));
  }
  // Neptuno: azul profundo con bandas tenues y una mancha oscura.
  float bandasN = sin(lat * 9.0 + 1.5 * fbm3(p * vec3(2.0, 8.0, 2.0)));
  vec3 colN = vec3(0.22, 0.38, 0.86) * (0.9 + 0.1 * bandasN);
  float lonN = atan(p.z, p.x);
  colN *= 1.0 - 0.45 * (1.0 - smoothstep(0.08, 0.16, length(vec2((lonN + 0.8) * 0.8, (lat + 0.35) * 3.0))));
  atmosfera = vec3(0.35, 0.55, 1.0) * 0.5;
  return colN;
}

void main() {
  int tipo = int(uAspecto + 0.5);
  vec3 atmosfera;
  vec3 albedo = albedoPlaneta(normalize(vLocal), tipo, atmosfera);
  vec3 n = normalize(vNormalMundo);
  vec3 l = normalize(uSol - vPosMundo);
  vec3 v = normalize(cameraPosition - vPosMundo);
  float lambert = dot(n, l);
  // Terminador suave (la atmósfera y el tamaño angular del Sol lo difuminan un poco) y noche
  // negra: sin luz ambiente, como en las fotos reales.
  float luz = max(lambert, 0.0) * smoothstep(-0.06, 0.18, lambert);
  // Oscurecimiento hacia el limbo en los gigantes gaseosos (y un poco en los demás).
  float mu = max(dot(n, v), 0.0);
  float limbo = mix(1.0, 0.55 + 0.45 * mu, tipo >= 4 ? 0.8 : 0.3);
  vec3 color = albedo * luz * limbo * 1.3;
  // Halo de atmósfera iluminada en el borde.
  float borde = pow(1.0 - mu, 3.0) * smoothstep(-0.25, 0.35, lambert);
  color += atmosfera * borde * 0.9;
  gl_FragColor = vec4(color * uAparicion, 1.0);
}
`

export const SOL_FRAG = /* glsl */ `
uniform float uAparicion;
uniform float uTiempo;

varying vec3 vNormalMundo;
varying vec3 vPosMundo;
varying vec3 vLocal;

${RUIDO_3D}

void main() {
  vec3 n = normalize(vNormalMundo);
  vec3 v = normalize(cameraPosition - vPosMundo);
  float mu = clamp(dot(n, v), 0.0, 1.0);
  // Oscurecimiento del limbo (ley de potencias de la fotosfera): el borde más tenue y más rojo.
  float oscurecimiento = 0.30 + 0.70 * pow(mu, 0.55);
  vec3 color = mix(vec3(1.0, 0.66, 0.38), vec3(1.0, 0.90, 0.72), pow(mu, 0.4));
  // Granulación: celdas de convección muy finas que hierven despacio.
  float granulos = 0.9 + 0.1 * ruido3(vLocal * 55.0 + vec3(0.0, uTiempo * 0.08, 0.0));
  gl_FragColor = vec4(color * 5.0 * oscurecimiento * granulos * uAparicion, 1.0);
}
`

export const ANILLOS_VERT = /* glsl */ `
varying vec3 vPosMundo;
varying float vRadio;
varying vec3 vNormalMundo;

void main() {
  // La geometría del anillo se genera en radios del planeta (1 = su ecuador).
  vRadio = length(position.xy);
  vec4 mundo = modelMatrix * vec4(position, 1.0);
  vPosMundo = mundo.xyz;
  vNormalMundo = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
  gl_Position = projectionMatrix * viewMatrix * mundo;
}
`

export const ANILLOS_FRAG = /* glsl */ `
uniform vec3 uSol;
uniform vec3 uCentroPlaneta;
uniform float uRadioPlaneta;
uniform float uAparicion;

varying vec3 vPosMundo;
varying float vRadio;
varying vec3 vNormalMundo;

float bordeFijo;

float banda(float r, float desde, float hasta, float borde) {
  // El borde nunca es más fino que un píxel: sin él los bordes del anillo salían dentados.
  float b = max(borde, bordeFijo);
  return smoothstep(desde - b, desde + b, r) * (1.0 - smoothstep(hasta - b, hasta + b, r));
}

void main() {
  float r = vRadio;
  bordeFijo = fwidth(r) * 0.75;
  // Perfil real de los anillos principales (radios de Saturno): C tenue, B denso, división de
  // Cassini casi vacía, A con la división de Encke, y estructura fina de ondas de densidad.
  float c = banda(r, 1.24, 1.525, 0.01) * 0.16;
  float b = banda(r, 1.525, 1.95, 0.008) * (0.78 + 0.18 * sin(r * 83.0) * sin(r * 31.0));
  float a = banda(r, 2.03, 2.27, 0.008) * 0.55 * (1.0 - 0.85 * banda(r, 2.205, 2.215, 0.002));
  float fina = 0.85 + 0.15 * sin(r * 410.0) * sin(r * 157.0);
  float densidad = (c + b * 0.85 + a * 0.9) * fina;
  vec3 color = mix(vec3(0.70, 0.62, 0.50), vec3(0.93, 0.86, 0.72), smoothstep(1.4, 2.0, r));
  vec3 aSol = normalize(uSol - vPosMundo);
  // Los anillos se ven iluminados aunque el Sol los roce (dispersan hacia delante).
  float iluminacion = 0.35 + 0.65 * sqrt(abs(dot(normalize(vNormalMundo), aSol)));
  // Sombra del planeta sobre los anillos: el rayo hacia el Sol choca con la esfera.
  vec3 oc = vPosMundo - uCentroPlaneta;
  float bq = dot(oc, aSol);
  float cq = dot(oc, oc) - uRadioPlaneta * uRadioPlaneta;
  float sombra = (bq < 0.0 && bq * bq - cq > 0.0) ? 0.06 : 1.0;
  float alfa = clamp(densidad, 0.0, 1.0) * uAparicion;
  gl_FragColor = vec4(color * iluminacion * sombra * 0.95, alfa);
}
`

export const CINTURON_VERT = /* glsl */ `
attribute float aRadio;
attribute float aFase;
attribute float aAltura;
attribute float aBrillo;

uniform float uAnios;
uniform float uTamano;
uniform float uAparicion;
uniform float uEscalaOrbita;
uniform float uExponenteOrbita;

varying float vAlfa;

void main() {
  // Tercera ley de Kepler: periodo en años = a^1.5 (a en UA); la distancia visible se comprime
  // igual que las órbitas de los planetas.
  float angulo = aFase + 6.2831853 * uAnios / pow(aRadio, 1.5);
  float r = uEscalaOrbita * pow(aRadio, uExponenteOrbita);
  vec3 posicion = vec3(cos(angulo) * r, aAltura, -sin(angulo) * r);
  vec4 mv = modelViewMatrix * vec4(posicion, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uTamano;
  vAlfa = aBrillo * uAparicion;
}
`

export const CINTURON_FRAG = /* glsl */ `
uniform vec3 uColor;

varying float vAlfa;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d2 = dot(c, c) * 4.0;
  if (d2 > 1.0) discard;
  gl_FragColor = vec4(uColor * exp(-d2 * 3.5) * vAlfa, 1.0);
}
`

export const ORBITA_VERT = /* glsl */ `
attribute float aAnomalia;
varying float vAnomalia;

void main() {
  vAnomalia = aAnomalia;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const ORBITA_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAnomaliaPlaneta;
uniform float uAparicion;
// Medio hueco (en anomalía) alrededor del planeta: la línea no le pasa por encima.
uniform float uHueco;

varying float vAnomalia;

void main() {
  // Estela: la órbita es un hilo tenue que se aviva justo detrás del planeta (por donde acaba de
  // pasar) y se desvanece en algo más de un cuarto de vuelta.
  float detras = mod(uAnomaliaPlaneta - vAnomalia, 6.2831853);
  float estela = exp(-detras / 1.3);
  float delante = mod(vAnomalia - uAnomaliaPlaneta, 6.2831853);
  float hueco = smoothstep(uHueco, 2.0 * uHueco, min(detras, delante));
  float alfa = (0.07 + 0.75 * estela) * hueco * uAparicion;
  gl_FragColor = vec4(uColor * alfa, 1.0);
}
`
