/**
 * Lo que se anima detrás de cada línea de la letra (en el orden de `public/cancion/cancion.vtt`): un
 * motivo dibujado a tinta clara, en el estilo del dibujo animado, según el tema de esa línea (lo
 * pidió el usuario: "que se vayan mostrando de fondo animaciones según lo que se muestra"). Los
 * estribillos repiten sus motivos; si la letra tuviera más líneas, las de más llevan `cielo`.
 * Nada de caras ni de corazones (ver las preferencias del usuario).
 */
export type MotivoEscena =
  | 'ondas'
  | 'estrella'
  | 'sendero'
  | 'trazo'
  | 'reloj'
  | 'constelacion'
  | 'imanes'
  | 'rayos'
  | 'sol'
  | 'elegida'
  | 'cometa'
  | 'anillos'
  | 'girasol'
  | 'tormenta'
  | 'nubes'
  | 'claro'
  | 'brote'
  | 'hojas'
  | 'recuerdos'
  | 'contorno'
  | 'firma'
  | 'cielo'

export const ESCENAS_LETRA: readonly MotivoEscena[] = [
  // Primera estrofa: decirlo (ondas de sonido), la primera de todas (una estrella que sube),
  // buscar la manera (un sendero que tantea) y encontrarla (un trazo decidido), el tiempo y el
  // espacio (un reloj que se deshace en estrellas), sin por qué (estrellas que se unen al azar),
  // la atracción (dos luces que se buscan) y la luz (un sol de rayos).
  'ondas',
  'estrella',
  'sendero',
  'trazo',
  'reloj',
  'constelacion',
  'imanes',
  'rayos',
  // Estribillo: las vueltas al sol (un planeta en su órbita), la única (una estrella entre todas),
  // la despedida (un cometa que se aleja), los dos (dos anillos entrelazados) y el amor (un girasol
  // que se abre, como los del campo del final).
  'sol',
  'elegida',
  'cometa',
  'anillos',
  'girasol',
  // Segunda estrofa: las peleas (una tormenta), la distancia (nubes que se separan), el perdón (el
  // cielo que se abre), otra oportunidad (un brote), el paso de los años (hojas que caen), los
  // recuerdos (fotos que flotan), su rostro (una línea que se dibuja sola) y su nombre (una firma).
  'tormenta',
  'nubes',
  'claro',
  'brote',
  'hojas',
  'recuerdos',
  'contorno',
  'firma',
  // Último estribillo.
  'sol',
  'elegida',
  'cometa',
  'anillos',
  'girasol',
]

/** Cómo entra cada línea al centro, por turnos (se repite cada cuatro). */
export const ENTRADAS_LINEA = ['sube', 'zoom', 'cae', 'lado'] as const
export type EntradaLinea = (typeof ENTRADAS_LINEA)[number]
