export interface Capitulo {
  readonly etiqueta: string
  readonly lineasTitulo: readonly string[]
  readonly enfasis: string
  readonly cuerpo: string
  readonly nota: string
}

export interface Epilogo {
  readonly etiqueta: string
  readonly titulo: string
  readonly enfasis: string
  readonly cierre: string
}

export const MARCA = {
  nombre: 'Dust.Blue',
  lema: 'One star / one scroll',
  reloj: 'Stellar clock',
  estadoReloj: 'Clocks disagree here',
  numeroCapitulo: '08',
  nombreCapitulo: 'The other ending',
} as const

export const CAPITULO_ACTUAL: Capitulo = {
  etiqueta: 'Ch. 08 / Elsewhere, the other ending',
  lineasTitulo: ['A star ten times heavier', 'does not exhale.'],
  enfasis: 'It falls forever.',
  cuerpo:
    'Its core collapses through every floor physics can build: past iron, past neutron, past light itself. What remains is a hole in the story, dressed in the blazing breath of everything it is still swallowing.',
  nota: "The arcs above and below are the disk's far side. Gravity bends it into view",
}

export const EPILOGO: Epilogo = {
  etiqueta: 'Epilogue / T plus forever',
  titulo: 'Nothing here ever finishes',
  enfasis: 'falling.',
  cierre: 'From outside, the last light of the star slows, reddens and stays. Drag to orbit what is left.',
}
