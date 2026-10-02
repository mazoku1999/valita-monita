import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Caveat, Corben, IBM_Plex_Mono, Instrument_Serif } from 'next/font/google'
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

// La letra de la canción del agujero negro, en la cinta de su escenario (ver `features/cancion`):
// una de rótulo de los años 30, redonda y gruesa. Precargada: también la lleva el diálogo del
// sonido, a la vista desde el principio.
const letraCancion = Corben({
  subsets: ['latin', 'latin-ext'],
  weight: '700',
  variable: '--font-letra-cancion',
  display: 'swap',
})

// Sólo el título (lo pidió el usuario: sin descripción ni nada más). El ícono es el agujero negro
// dibujado del inicio; agregada a la pantalla de inicio del iPhone, se abre como una app a pantalla
// completa (sin las barras de Safari y con el dibujo bajo la barra de estado). Ver `manifest.ts`.
export const metadata: Metadata = {
  title: 'Para mi Monita linda',
  icons: {
    icon: '/icono-192.png',
    apple: '/apple-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#050404',
  userScalable: true,
  // El dibujo ocupa toda la pantalla, también bajo la isla y la barra de estado (los botones se
  // apartan con `env(safe-area-inset-*)`).
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="es"
      className={`${serifDisplay.variable} ${monoNarrativa.variable} ${letraCarta.variable} ${letraCancion.variable} dark`}
    >
      <body className="min-h-screen bg-cosmos text-crema antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
