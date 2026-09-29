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
tinta) y el shader escribe, además del color, qué objeto hay en cada píxel.

El sistema solar también sale ya dibujado de la escena (`features/sistema-solar/shaders/sistemaSolar.ts`):
el Sol con cara (ojos de "pastel" que parpadean, mejillas, una boca que canta al compás) y rayos
que giran; planetas de colores planos con sombra de color, brillo de barniz y tinta en el borde;
los anillos de Saturno entintados; las órbitas como caminos de puntitos; la Tierra con las costas
entintadas, nubes en borreguitos, una raya dorada en el terminador, las luces de las ciudades y
la atmósfera en un aro; y la Luna, dormilona, que al final posa junto a la Tierra. Todo lo que ya
está dibujado sale con alfa 0.5: el pase lo toma tal cual, sin tono ni colores planos.

El dibujo es un pase al final del posproceso (`features/agujero-negro/components/EfectosPost.tsx` →
`features/dibujo`):

- `utils/PasoDibujo.ts`: el pase. Pinta el cielo en acuarela con los rayos de sol detrás del
  agujero y detrás del Sol, entinta los contornos (entre objetos del agujero, entre sus bandas de
  color y, por fuera, en los saltos de profundidad del resto), tonea (ACES) y lleva a colores
  planos de época lo que todavía es realista (el túnel del agujero de gusano), compone lo dibujado,
  las aguadas de luz y el papel, dibuja las estrellas y destellos de caricatura y pasa todo por la
  película antigua.
- `shaders/dibujo.ts`: cielo y rayos de sol, tinta, composición, destellos y película.
- `shaders/acuarela.ts`: paleta de época, cielo nocturno en acuarela y papel.
- `constantes/dibujo.ts`: grosor de la tinta, bandas de color, aguadas, película, hervor.
- `store/ritmoDibujo.ts`: el ritmo de 24 dibujos por segundo (entre dibujos la pantalla no cambia y
  no se calcula nada) y el compás (112 pulsaciones por minuto) con el que late el disco.
- `utils/destellos.ts`: estrellas del cielo (puntos, destellos de cuatro puntas y estrellas de
  cinco puntas que bailan al compás), destellos de la banda de polvo que se abren a tiempo con el
  compás y una estrella fugaz que cruza el cielo de vez en cuando.

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
`dibujo-v0.6-viaje-completo`, `dibujo-v0.7-agujero-caricatura`, `dibujo-v0.8-estrellas`,
`dibujo-v0.9-sistema-solar` (y lo que siga).

La versión anterior de esta carpeta, pintada al óleo al estilo de Van Gogh, sigue en el
historial de git (etiquetas `pintura-v0.1-copia` … `pintura-v0.6-viaje-completo`).
