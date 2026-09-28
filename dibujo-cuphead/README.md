# Dust.Blue — versión dibujo animado (estilo Cuphead)

El mismo viaje que el proyecto de la carpeta de arriba (acercamiento al agujero negro, caída,
agujero de gusano, sistema solar y la Tierra), dibujado como un dibujo animado de los años 30 al
estilo del juego Cuphead: tinta a pincel, colores planos, fondos de acuarela, película antigua y
24 dibujos por segundo.

## Arrancar

```bash
npx -y pnpm@12.3.4 install
node_modules/.bin/next dev -p 3002
```

Es un proyecto Next independiente (sus propias dependencias; la raíz de Turbopack está fijada a
esta carpeta en `next.config.mjs`). El proyecto original lo excluye de su `tsconfig.json`.

## Dónde está el dibujo

La escena 3D es la del original; el dibujo es un pase al final del posproceso
(`features/agujero-negro/components/EfectosPost.tsx` → `features/dibujo`):

- `utils/PasoDibujo.ts`: el pase. Reduce la imagen, orienta los bordes (tensor de estructura con
  memoria en el tiempo), entinta con una diferencia de gaussianas que sigue el flujo de los bordes
  (más las siluetas de los cuerpos frente al cielo, sacadas de la profundidad), compone colores
  planos por bandas con la paleta de época, el cielo en acuarela y las aguadas de luz, dibuja las
  estrellas y destellos de caricatura y pasa todo por la película antigua.
- `shaders/dibujo.ts`: análisis, tinta, composición, destellos y película.
- `shaders/acuarela.ts`: paleta de época, cielo nocturno en acuarela y papel.
- `constantes/dibujo.ts`: grosor y umbral de la tinta, bandas de color, aguadas, película, hervor.
- `store/ritmoDibujo.ts`: el ritmo de 24 dibujos por segundo (entre dibujos la pantalla no cambia y
  no se calcula nada).
- `utils/destellos.ts`: estrellas del cielo y destellos de la banda de polvo.

## Claves de desarrollo (sólo con `next dev`)

Además de las del original (`?vista=canto|anillo|elevada|elevadaCercana|inferior|cenital|lejana`,
`?distancia=`…):

| Clave | Efecto |
| --- | --- |
| `dibujo=0` | la escena sin dibujar (para comparar) |
| `dibujoSoloTinta=1` | sólo la tinta sobre papel |
| `dibujoUmbral` | umbral de la tinta (más negativo, menos líneas) |
| `dibujoGrosor` | grosor de la tinta (σ en texels de 1/2) |

## Versiones

Cada paso quedó en su commit y etiqueta: `dibujo-v0.1-base`, `dibujo-v0.2-tinta`,
`dibujo-v0.3-acuarela`, `dibujo-v0.4-pelicula`, `dibujo-v0.5-animacion` (y lo que siga).

La versión anterior de esta carpeta, pintada al óleo al estilo de Van Gogh, sigue en el
historial de git (etiquetas `pintura-v0.1-copia` … `pintura-v0.6-viaje-completo`).
