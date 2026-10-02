import type { MetadataRoute } from 'next'

/**
 * La página como app: agregada a la pantalla de inicio se abre sin las barras del navegador. En el
 * iPhone es la única manera de verla a pantalla completa (Safari no deja ponerla así desde la
 * página; ver `features/narrativa/store/pantallaCompleta.ts`); en Android, instalada, se abre a
 * pantalla completa de verdad. El ícono es el agujero negro del inicio.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Para mi Monita linda',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['fullscreen', 'standalone'],
    background_color: '#050404',
    theme_color: '#050404',
    icons: [
      { src: '/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
