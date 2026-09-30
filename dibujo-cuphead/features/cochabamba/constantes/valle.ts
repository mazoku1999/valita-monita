/**
 * El valle de Cochabamba (Bolivia) de dibujo animado, al final del viaje: el usuario pidió que la
 * entrada en la Tierra llevara, a través de las nubes, a Cochabamba, a un sitio lleno de girasoles
 * y de flores como las de un ramo (gerberas, rosas, lirios, clavelinas, bocas de dragón y
 * gipsófila rosas y moradas); es un regalo para su novia.
 *
 * Coordenadas del valle en metros: x hacia el este, y hacia arriba, z hacia el sur. El origen es el
 * centro de un corazón de flores rosadas en medio de un campo de girasoles de Tiquipaya ("la ciudad
 * de las flores"), al pie del Tunari. Geografía de dibujo pero a escala: la cordillera del Tunari al
 * norte (el pie a ~2 km, la cresta a ~9 km y unos 2.300 m sobre el valle), serranías bajas al sur,
 * la ciudad al sureste con la laguna Alalay y el cerro de San Pedro (el del Cristo de la Concordia,
 * que queda a la espalda de la cámara y no se dibuja).
 */

const radianes = (grados: number): number => (grados * Math.PI) / 180

/** Dirección horizontal (x, z) de un rumbo en grados desde el norte, hacia el este. */
export const direccionRumbo = (rumbo: number): [number, number] => [Math.sin(radianes(rumbo)), -Math.cos(radianes(rumbo))]

/** Hacia el Sol (vector unitario del valle) desde su rumbo y elevación en grados. */
export const direccionSol = (rumbo: number, elevacion: number): [number, number, number] => {
  const [x, z] = direccionRumbo(rumbo)
  const c = Math.cos(radianes(elevacion))
  return [x * c, Math.sin(radianes(elevacion)), z * c]
}

/**
 * El Sol de la mañana (a las 7:15, la hora a la que la cámara llega desde el espacio): por el
 * este-noreste y bajo, luz dorada de amanecer. Los girasoles miran hacia él.
 */
export const SOL_MANANA = { rumbo: 72, elevacion: 17 } as const

/**
 * El corazón de flores: metros por unidad de la curva del corazón (mide ~70 m de ancho y 40 de
 * largo), rumbo de su eje (de la punta hacia los lóbulos: al noroeste, hacia el Tunari) y ancho
 * del ribete de gipsófila blanca que lo dibuja desde el aire.
 */
export const CORAZON = { escala: 32, rumbo: 315, ribete: 1.8 } as const

/** El campo de girasoles alrededor del corazón: semilado (m) y marco de plantación (hileras norte-sur). */
export const CAMPO = { semiLado: 150, entreHileras: 0.9, entrePlantas: 0.6 } as const

/** La ciudad (centro x, z y radio en m), la laguna Alalay (centro y semiejes) y el cerro de San Pedro. */
export const CIUDAD = { centro: [8200, 1600], radio: 3600 } as const
export const LAGUNA = { centro: [8600, 4300], semiejes: [720, 430] } as const
export const CERRO_SAN_PEDRO = { centro: [9800, 3600], altura: 290, radio: 520 } as const

/**
 * Recorrido de la cámara por el valle, en vh del carril (ver `constantes/viajeScroll.ts`): empieza
 * dentro de la nube del corazón (a 4 km, ver `utils/nubesDestino.ts`), sale por su base alto al
 * sureste del corazón de flores (que se ve derecho, con los lóbulos arriba, como la nube desde el
 * espacio), baja hacia él y se posa a la altura de las flores, 8 m dentro desde su punta (donde ya
 * mide unos 16 m de ancho), mirando a lo largo del corazón, que se abre hacia el Tunari.
 */
export const CAMARA_VALLE: readonly { readonly vh: number; readonly posicion: readonly [number, number, number]; readonly mira: readonly [number, number, number] }[] = [
  { vh: 1500, posicion: [2150, 4000, 2150], mira: [0, 0, 0] },
  { vh: 1550, posicion: [1300, 2400, 1300], mira: [0, 0, 0] },
  { vh: 1615, posicion: [380, 800, 380], mira: [0, 0, 0] },
  { vh: 1705, posicion: [62, 115, 62], mira: [0, 0, 0] },
  { vh: 1777, posicion: [20, 8, 20], mira: [-24, 0, -24] },
  { vh: 1835, posicion: [7.9, 1.1, 7.9], mira: [-60, -5, -60] },
]

/** Planos de recorte de la cámara en el valle (m): cerca para las flores, lejos para las montañas. */
export const RECORTE_VALLE = { cerca: 0.3, lejos: 60000 } as const
