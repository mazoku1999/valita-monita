# Dust.Blue — versión pintada (estilo Van Gogh)

El mismo viaje que el proyecto de la carpeta de arriba (acercamiento al agujero negro, caída,
agujero de gusano, sistema solar y la Tierra), pero cada fotograma se repinta como un óleo al
estilo de Van Gogh: pinceladas curvas que siguen las formas, cielo nocturno azul en remolinos,
estrellas con halos como las de *La noche estrellada*, paleta de pigmentos y relieve de la pintura
bajo una luz rasante.

## Arrancar

```bash
npx -y pnpm@12.3.4 install
node_modules/.bin/next dev -p 3002
```

Es un proyecto Next independiente (sus propias dependencias; la raíz de Turbopack está fijada a
esta carpeta en `next.config.mjs`). El proyecto original lo excluye de su `tsconfig.json`.

## Dónde está la pintura

Toda la escena 3D es la del original; la pintura es un pase al final del posproceso
(`features/agujero-negro/components/EfectosPost.tsx` → `features/pintura`):

- `utils/PasoPintura.ts`: el pase. Reduce la imagen, calcula el campo de flujo (tensor de
  estructura con memoria en el tiempo, escala gruesa, remolinos del cielo, círculos alrededor del
  agujero y de las estrellas), el color de pintura y dibuja tres capas de pinceladas instanciadas
  (fondo, detalle y realces) sobre un lienzo con color y grosor; al final, la luz rasante.
- `shaders/paleta.ts`: pigmentos (OKLab), cielo nocturno anclado a la esfera celeste, la luz de
  la escena sobre el cielo y las estrellas pintadas.
- `shaders/pintura.ts`: el resto de los shaders (análisis, pinceladas, lienzo y salida).
- `constantes/pinceladas.ts`: tamaños de los trazos (en fracciones de la altura de la pantalla).
- `utils/estrellasPintadas.ts`: las estrellas del cuadro, fijas en el cielo.

## Claves de desarrollo (sólo con `next dev`)

Además de las del original (`?vista=canto|anillo|elevada|elevadaCercana|inferior|cenital|lejana`,
`?distancia=`…):

| Clave | Efecto |
| --- | --- |
| `pintura=0` | la escena sin pintar (para comparar) |
| `pinturaDepurar=1` | cada pincelada de un color al azar (forma y dirección de los trazos) |
| `pinturaAncho`, `pinturaLargo` | escala del ancho y del largo de los trazos |
| `pinturaRelieve`, `pinturaSombreado`, `pinturaBrillo` | luz rasante sobre el empaste |
| `pinturaCapas` | máscara de capas: 1 fondo, 2 detalle, 4 realces (7 = todas) |
| `pinturaTiempos=1` | cronómetro de GPU por sección en `window.__tiemposPintura()` (orientativo en GPUs de Apple) |

## Versiones

Cada paso quedó en su commit y etiqueta: `pintura-v0.1-copia`, `pintura-v0.2-pinceladas`,
`pintura-v0.3-paleta-y-cielo`, `pintura-v0.4-detalle-y-estrellas`, `pintura-v0.5-empaste`,
`pintura-v0.6-viaje-completo`.
