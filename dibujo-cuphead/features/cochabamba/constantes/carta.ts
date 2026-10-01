import { CAMARA_VALLE } from './valle'

/**
 * La carta del final, tal como la escribió el usuario para su novia (por su aniversario), párrafo a
 * párrafo. Al mostrarla sólo se ajusta el espacio de las comas (`ajustarComas`); las palabras van tal
 * cual. El primero es el saludo y el último la despedida.
 */
export const CARTA_PARRAFOS: readonly string[] = [
  'Amor...',
  'a veces me pongo a pensar en todo lo nuestro y te juro que se me salen las lágrimas de pura alegría de saber que estás a mi lado ,amo la conexión tan bonita que tenemos y cada pedacito de lo que eres',
  'me vuelve loco tu cabello ,ese aroma tuyo que se me queda grabado en la mente ,amo cuando te emocionas por cositas y se te ponen los ojitos brillosos a punto de llorar ,amo el corazón tan lindo que tienes y verte sonreír con esa expresión tan tuya que me encanta',
  'eres lo mejor que me ha pasado ,a veces solo me quedo mirándote y agradezco tenerte en mi vida ,lo que más adoro en este mundo es tu carita y cualquier cosa que tenga que ver contigo ,siento que me das paz y a la vez me llenas de energía para todo',
  'no importa cuántas veces nos veamos ,siempre siento esas mismas ganas de estar contigo ,me encanta cómo me haces sentir y cómo sacas lo mejor de mí ,incluso en esos días donde ando estresado por las clases o cansado de todo ,tú siempre terminas siendo mi lugar seguro y mi tranquilidad',
  'hemos pasado por tantas cosas juntos ,con días buenos y otros no tanto donde chocamos un poco ,pero míranos ,aquí seguimos apoyándonos y eligiéndonos ,valoro muchísimo tu paciencia y que sigas a mi lado ayudándome a ser mejor persona',
  'yo oré por ti ,y sé que Dios me escuchó por qué me respondió justamente con las mismas palabras que se lo pedí ,desearía que esto nunca tuviera un fin',
  'te amo ,te amo con todo el alma',
  'me muero por verte ya y abrazarte bien fuerte ,te amo en todas partes ,en los días más pesados o cuando estamos tranquilos sin hacer nada ,siempre te elijo',
  'quiero seguir compartiendo mi vida contigo ,creando más recuerdos y superando cualquier cosa que se nos cruce ,porque a tu lado todo tiene mucho más sentido',
  'te amo tanto ,te amo tanto ,te amo con el alma ,te amo con toda el alma',
  'feliz aniversario amor, que lo nuestro sea para siempre.',
]

/** " ,palabra" → ", palabra": el espacio de las comas, como en la letra impresa. */
export const ajustarComas = (texto: string): string => texto.replace(/\s*,\s*/g, ', ')

/**
 * La música de la carta (la pidió el usuario: "al abrir la carta quiero que suene esta canción, y al
 * cerrar se pare también, pero muy bajito, como modo ambiente"): el archivo del usuario en
 * `public/carta/`. Empieza al abrirse la carta (salta el sello y se abre la solapa del sobre; no al
 * abrir la cajita, lo corrigió el usuario) y sube despacio mientras sale la hoja; mientras se lee se
 * repite, y al salir baja y se para. Ver `utils/musicaCarta.ts`.
 */
export const MUSICA_CARTA = {
  audio: '/carta/musica.mp3',
  /** Ganancia: la canción viene a unos −20 LUFS y así queda en unos −33, de fondo (la del agujero suena a −14). */
  volumen: 0.22,
  /** Fundidos (s): de entrada, mientras sale y se despliega la hoja; de salida, al volver al campo. */
  entrada: 3,
  salida: 2,
} as const

const FINAL = CAMARA_VALLE[CAMARA_VALLE.length - 1]
const ADELANTE = ((): [number, number] => {
  const x = FINAL.mira[0] - FINAL.posicion[0]
  const z = FINAL.mira[2] - FINAL.posicion[2]
  const l = Math.hypot(x, z)
  return [x / l, z / l]
})()

/**
 * La cajita: sobre un tocón entre las flores, a la derecha del lirio del ramo y algo detrás (se ve
 * desde donde se posa la cámara, también en un móvil en vertical). Posición (m del valle), alto del
 * tocón y medidas de la caja (m).
 */
export const CAJITA = (() => {
  const adelante = 3.2
  const derecha = 0.35
  const [ax, az] = ADELANTE
  return {
    x: FINAL.posicion[0] + ax * adelante - az * derecha,
    z: FINAL.posicion[2] + az * adelante + ax * derecha,
    tocon: 0.55,
    lado: 0.22,
    alto: 0.15,
    tapa: 0.05,
    /** Radio (m) del claro sin flores alrededor del tocón. */
    claro: 0.3,
  }
})()

/** Centro de la cajita (m del valle), para mirarla y para tocarla. */
export const CENTRO_CAJITA: readonly [number, number, number] = [CAJITA.x, CAJITA.tocon + CAJITA.alto * 0.6, CAJITA.z]

/**
 * La vista final, mirando al cielo: hacia el noroeste (el Tunari asoma abajo, como las colinas del
 * cuadro: el usuario quería que se siguieran viendo las montañas) y alzada `alzado` rad sobre el
 * horizonte.
 */
export const VISTA_CIELO = { rumbo: [-Math.SQRT1_2, -Math.SQRT1_2] as const, alzado: 0.4 } as const

/**
 * Coreografía de la apertura, en s desde que la cámara llega junto a la cajita: la tapa salta, la
 * cámara se alza hacia el cielo, la noche cae y empieza la carta.
 */
export const COREOGRAFIA = {
  /** A esta distancia (m, en horizontal) o menos no hace falta acercarse; si no, hasta `acercarse`. */
  cerca: 2.5,
  acercarse: 1.9,
  /** Velocidad al acercarse (m/s) y altura de los ojos (m: la de pie paseando, para devolver los mandos sin salto). */
  velocidad: 2.2,
  ojos: 1.15,
  tapa: 0.6,
  inclinarDesde: 1.1,
  inclinar: 4.6,
  nocheDesde: 1.3,
  noche: 5.2,
  /** Cuándo llega el sobre (un momento después de caer la noche, para ver el cuadro). */
  carta: 7.6,
} as const
