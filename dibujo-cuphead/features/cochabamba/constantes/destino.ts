/**
 * El destino del viaje, compartido por el mapa de la Tierra (`features/sistema-solar`) y el valle
 * (`constantes/valle.ts`): Cochabamba, Bolivia (17,39° S, 66,16° O) y la hora solar a la que llega
 * la cámara, el amanecer dorado (a las 7:15 el Sol está a unos 17° sobre el horizonte, por el este).
 */
export const DESTINO = { latitud: -17.39, longitud: -66.16, hora: 7.25 } as const

/** Radio medio de la Tierra (km): la unidad del marco propio de su malla. */
export const RADIO_TIERRA_KM = 6371
