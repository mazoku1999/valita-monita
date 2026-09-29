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

El agujero negro se dibuja en caricatura desde el propio trazado de rayos
(`features/agujero-negro/shaders/lenteCaricatura.frag.ts`): cada píxel sigue su geodésica de
Schwarzschild como en el original, pero el disco es un sólido de dibujo animado (caras con bandas
de color planas y arcos de movimiento, cantos con brillo, anillo de fotones grueso, sombra de
tinta) y el shader escribe, además del color, qué objeto hay en cada píxel. El resto de la escena
es la del original; el dibujo es un pase al final del posproceso
(`features/agujero-negro/components/EfectosPost.tsx` → `features/dibujo`):

- `utils/PasoDibujo.ts`: el pase. Pinta el cielo en acuarela con los rayos de sol detrás del
  agujero, entinta los contornos (entre objetos del agujero, entre sus bandas de color y en los
  saltos de profundidad del resto), compone colores planos por bandas con la paleta de época, las
  aguadas de luz y el papel, dibuja las estrellas y destellos de caricatura y pasa todo por la
  película antigua.
- `shaders/dibujo.ts`: cielo y rayos de sol, tinta, composición, destellos y película.
- `shaders/acuarela.ts`: paleta de época, cielo nocturno en acuarela y papel.
- `constantes/dibujo.ts`: grosor de la tinta, bandas de color, aguadas, película, hervor.
- `store/ritmoDibujo.ts`: el ritmo de 24 dibujos por segundo (entre dibujos la pantalla no cambia y
  no se calcula nada) y el compás (112 pulsaciones por minuto) con el que late el disco.
- `utils/destellos.ts`: estrellas del cielo y destellos de la banda de polvo.

## Claves de desarrollo (sólo con `next dev`)

Además de las del original (`?vista=canto|anillo|elevada|elevadaCercana|inferior|cenital|lejana`,
`?distancia=`…):

| Clave | Efecto |
| --- | --- |
| `dibujo=0` | la escena sin dibujar (para comparar) |
| `dibujoSoloTinta=1` | sólo la tinta sobre papel |
| `dibujoGrosor` | grosor de la tinta (radio en px a 720 de alto; la línea mide el doble) |

## Versiones

Cada paso quedó en su commit y etiqueta: `dibujo-v0.1-base`, `dibujo-v0.2-tinta`,
`dibujo-v0.3-acuarela`, `dibujo-v0.4-pelicula`, `dibujo-v0.5-animacion`,
`dibujo-v0.6-viaje-completo`, `dibujo-v0.7-agujero-caricatura` (y lo que siga).

La versión anterior de esta carpeta, pintada al óleo al estilo de Van Gogh, sigue en el
historial de git (etiquetas `pintura-v0.1-copia` … `pintura-v0.6-viaje-completo`).
