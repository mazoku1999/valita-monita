import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Caveat, IBM_Plex_Mono, Instrument_Serif, Montserrat, Oswald, Playfair_Display } from 'next/font/google'
import './globals.css'

const serifDisplay = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-serif-display',
  display: 'swap',
})

const monoNarrativa = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono-narrativa',
  display: 'swap',
})

// La carta del final, escrita a mano: una letra manuscrita clara y moderna (de peso variable).
const letraCarta = Caveat({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-carta',
  display: 'swap',
})

// La letra de la canción del agujero negro, como en los videos de letras (ver `features/cancion`):
// una palo seco gruesa en cursiva (y en mayúsculas espaciadas), una de pie de alto contraste y una
// condensada en mayúsculas, con la Instrument Serif en cursiva. Sin precarga: se piden al
// acercarse al agujero.
const letraSans = Montserrat({
  subsets: ['latin', 'latin-ext'],
  weight: ['600', '800'],
  style: ['normal', 'italic'],
  variable: '--font-letra-sans',
  display: 'swap',
  preload: false,
})

const letraSerif = Playfair_Display({
  subsets: ['latin', 'latin-ext'],
  weight: '500',
  variable: '--font-letra-serif',
  display: 'swap',
  preload: false,
})

const letraCondensada = Oswald({
  subsets: ['latin', 'latin-ext'],
  weight: '600',
  variable: '--font-letra-condensada',
  display: 'swap',
  preload: false,
})

export const metadata: Metadata = {
  title: 'Dust.Blue — A cartoon night',
  description:
    'El mismo viaje por un agujero negro, el agujero de gusano y nuestro sistema solar, dibujado como un dibujo animado de los años 30: tinta a pincel, acuarela y película antigua.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#050404',
  userScalable: true,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${serifDisplay.variable} ${monoNarrativa.variable} ${letraCarta.variable} ${letraSans.variable} ${letraSerif.variable} ${letraCondensada.variable} dark`}
    >
      <body className="min-h-screen bg-cosmos text-crema antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
