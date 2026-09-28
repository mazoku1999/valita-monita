/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Este proyecto vive dentro de la carpeta del original, que tiene su propio pnpm-lock.yaml: sin
  // fijar la raíz, Turbopack tomaría la carpeta de arriba y resolvería con sus node_modules.
  turbopack: {
    root: import.meta.dirname,
  },
}

export default nextConfig
