# Dust.Blue — versión dibujo animado (estilo Cuphead)

El mismo viaje que el proyecto de la carpeta de arriba (acercamiento al agujero negro, caída,
agujero de gusano, sistema solar y la Tierra), dibujado como un dibujo animado de los años 30 al
estilo del juego Cuphead: tinta a pincel, colores planos, fondos de acuarela, película antigua y
24 dibujos por segundo. Al final, la cámara entra en la Tierra y baja, a través de las nubes, hasta
un corazón de flores en un campo de girasoles de Cochabamba (Bolivia).

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

El agujero de gusano (`features/agujero-negro/shaders/agujeroGusanoCaricatura.ts`) conserva su
trazado por píxel, pero se dibuja como una espiral hipnótica de los años 30: bandas planas que
giran (cálidas las que llegan al otro lado, moradas las que vuelven) con tinta entre ellas, y la
boca de salida como una ventana al cielo que crece hasta rodearnos.

El sistema solar también sale ya dibujado de la escena (`features/sistema-solar/shaders/sistemaSolar.ts`):
el Sol como un disco dorado con rayos que giran muy despacio; planetas de colores planos con sombra
de color, brillo de barniz y tinta en el borde; los anillos de Saturno entintados; las órbitas como
caminos de puntitos; la Tierra con las costas entintadas, nubes en borreguitos, una raya dorada en
el terminador, las luces de las ciudades y la atmósfera en un aro; y la Luna en su órbita. La
cámara se mueve como una de verdad (los tamaños sólo cambian con la distancia, con un tope para el
Sol y los planetas lejanos, que a escala real apenas cambiarían): se acerca al sistema, gira hacia
la Tierra y avanza en línea recta hasta ella. Todo lo que ya está dibujado sale con alfa 0.5: el
pase lo toma tal cual, sin tono ni colores planos.

El dibujo es un pase al final del posproceso (`features/agujero-negro/components/EfectosPost.tsx` →
`features/dibujo`):

- `utils/PasoDibujo.ts`: el pase. Pinta el cielo en acuarela con los rayos de sol detrás del
  agujero y detrás del Sol, entinta los contornos (entre objetos del agujero, entre sus bandas de
  color y, por fuera, en los saltos de profundidad del resto), tonea (ACES) y lleva a colores
  planos de época lo poco que todavía es realista (el cielo lejano del sistema solar), compone lo dibujado,
  las aguadas de luz y el papel, dibuja las estrellas y destellos de caricatura y pasa todo por la
  película antigua.
- `shaders/dibujo.ts`: cielo y rayos de sol, tinta, composición, destellos y película.
- `shaders/acuarela.ts`: paleta de época, cielo nocturno en acuarela y papel.
- `constantes/dibujo.ts`: grosor de la tinta, bandas de color, aguadas, película, hervor.
- `store/ritmoDibujo.ts`: el ritmo de 24 dibujos por segundo (entre dibujos la pantalla no cambia y
  no se calcula nada) y el compás (112 pulsaciones por minuto): con él late el disco del agujero y
  se mecen las estrellas; el sistema solar va sin latidos.
- La película antigua lleva también el iris de la época: se cierra sobre la sombra al cruzar el
  horizonte y se abre sobre el remolino (tramos en `constantes/viajeScroll.ts`).
- `utils/destellos.ts`: estrellas del cielo (puntos, destellos de cuatro puntas y estrellas de
  cinco puntas que se mecen despacio), destellos de la banda de polvo que se abren a tiempo con el
  compás y una estrella fugaz que cruza el cielo de vez en cuando.

## Cámara e interfaz en el espacio

- **El scroll con inercia** (`obtenerProgresoSuave` en `features/narrativa/store/progresoScrollStore.ts`):
  el sistema solar, la Tierra y el valle siguen al scroll como un muelle con amortiguamiento
  crítico, así que cada golpe de rueda es un deslizamiento de la cámara y no un salto.
- **Un solo movimiento alrededor del sistema** (`ENCUADRE.recorrido` en
  `EscenaSistemaSolar.tsx`): del acercamiento a una panorámica con el sistema entero (960–1040 vh),
  sin pararse en medio, con las órbitas en calma para leer los nombres, y el viaje a la Tierra.
- **Llegada a la Tierra siempre bonita** (`LLEGADA`): las órbitas corren con el reloj y la Tierra
  puede estar en cualquier punto; la cámara la rodea mientras se acerca para llegar con el Sol de
  lado (fase entre 45° y 75°), nunca por el lado de noche ni rozando el Sol.
- **La mirada del usuario** (`features/agujero-negro/store/miradaEspacio.ts`): dentro del agujero,
  arrastrar orbita alrededor de lo que se mira (el Sol o la Tierra), Ctrl + rueda o pellizcar
  acercan, el cursor da un leve paralaje; en el valle, arrastrar gira la cabeza. Todo vuelve al
  camino al seguir con el scroll o con un doble clic. La cámara del agujero negro, ahí, se queda
  quieta (antes seguía girando sola y con el cursor, y el marco del agujero de gusano la seguía con
  retraso: el sistema solar se deslizaba por la pantalla y volvía solo) y el campo de visión ya no
  cambia con el scroll.
- **Estrellas detrás de los planetas**: cada píxel de una estrella comprueba si el cielo está
  abierto (antes bastaba con su centro y alguna se dibujaba encima de un planeta).

## La llegada a Cochabamba

El final del viaje es un regalo: la entrada en la Tierra lleva a un sitio lleno de girasoles y de
flores como las de un ramo (gerberas, rosas, lirios, clavelinas, bocas de dragón y gipsófila).

- **La región de verdad** (`features/cochabamba/utils/region.ts`): una sola geografía, en km
  alrededor del corazón de flores, para el mapa, el relieve y el valle: el frente de los Andes con
  las yungas del Chapare, la Cordillera Oriental (sierras multifractales sobre un dominio deformado),
  el Altiplano con el Titicaca, el Poopó y los salares, la Cordillera Occidental con sus volcanes,
  el desierto hasta el Pacífico y, en el centro, el valle de Cochabamba con el Tunari. Humedad
  (selva, yungas, valles, puna) y agua y sal por punto.
- **El mapa** (`features/cochabamba/utils/texturaRegion.ts`, `DESTINO_GLSL` en
  `features/sistema-solar/shaders/sistemaSolar.ts`): 2.400 km de región en una textura (altura,
  humedad, lagos, salares) pintada con zonas de color de dibujo y el relieve sombreado por el Sol
  bajo del amanecer (`shaders/region.ts`); aparece al acercarse, cuando un píxel mide menos de unos
  km: desde lejos, la Tierra de dibujo entera.
- **El relieve 3D** (`utils/parcheRegion.ts`): 300 km de malla hija de la Tierra, con la curvatura,
  que se ve al bajar; pintada con el mismo suelo que el valle (`shaders/suelo.ts`): colores de la
  región de lejos y, de cerca, las parcelas en franjas con caminos, eucaliptos y casas, el río Rocha,
  la ciudad con sus avenidas, el campo de girasoles y el corazón de flores.
- **Las nubes** (`utils/nubesDestino.ts`, `shaders/nubesBolas.ts`): el mismo campo en el globo y en
  el valle: un mar de nubes sobre el Chapare, cúmulos sobre las sierras y los valles, algunos altos
  junto al camino de la cámara, y la nube por la que se entra al valle. Bolas trazadas por píxel
  (escriben su profundidad y se iluminan con el Sol); sus sombras, alargadas por el Sol bajo, en una
  textura que usan el mapa, el relieve y el valle. Dentro de una nube, niebla (`NIEBLA`).
- **La bajada** (`EscenaSistemaSolar.tsx`, `BAJADA_KM` e `INCLINACION_BAJADA`): tras planear hasta
  la vertical del destino, la cámara baja en escala logarítmica mirando al corazón desde el sureste,
  cada vez más tendida, entre los cúmulos, hasta la nube de entrada; sale por su base sobre el valle.
- **El valle** (`features/cochabamba`): la misma altura que la región (`utils/terreno.ts`, con
  el Tunari al norte) y el mismo suelo (`shaders/suelo.ts`), con bruma a ras. La cámara sale de la
  nube de entrada y baja por las poses de `constantes/valle.ts` hasta posarse entre las flores, en
  la punta del corazón.
- **Las flores** (`utils/flores.ts`, `shaders/flores.ts`): girasoles en hileras mirando al Sol y,
  dentro del corazón, las flores del ramo; cada cabeza se dibuja en su quad con pétalos de colores
  planos y su línea fina. Aparecen y ganan detalle según su tamaño en pantalla (desde el aire el
  suelo ya pinta el tapiz), y la tinta de tallos y hojas llega con el tamaño.
- **La vida** (`utils/vida.ts`, `shaders/vida.ts`, `components/VidaDelValle.tsx`): hileras de
  eucaliptos con claros, nubes de la mañana (unas agarradas a las faldas del Tunari, otras en el
  cielo del oeste), mariposas que aletean y a ratos planean, y pétalos que lleva la brisa.
- **Las flores de cerca**: rosas con pétalos en tres vueltas (de fuera adentro y de atrás adelante),
  cada uno oscuro en su base y claro en el borde enrollado, sépalos verdes y el capullo en espiral;
  lirios "stargazer" con tres pétalos de fuera y tres de dentro, borde ondulado, banda fucsia con
  motitas, garganta verde, estambres con sus anteras y el pistilo; gerberas con dos coronas de
  pétalos de punta dentada y un aro de florecillas; bocas de dragón de labios lobulados con su
  mancha amarilla. Los tallos se mecen con su flor y quedan siempre detrás de ella.
- **El pase en el valle** (`VALLE_EN_ESCENA`): cielo de mañana en vez del nocturno (con el
  cinturón de Venus rosado frente al Sol), sin estrellas, y la tinta de profundidad sólo en las
  siluetas contra el cielo, algo más fina. Las nubes lejanas escriben la profundidad del cielo para
  que el pase entinte la cresta que tienen delante; mariposas y pétalos no escriben profundidad
  (el pase les ponía un aro negro).

## Claves de desarrollo (sólo con `next dev`)

Además de las del original (`?vista=canto|anillo|elevada|elevadaCercana|inferior|cenital|lejana`,
`?distancia=`…):

| Clave | Efecto |
| --- | --- |
| `dibujo=0` | la escena sin dibujar (para comparar) |
| `dibujoSoloTinta=1` | sólo la tinta sobre papel |
| `dibujoGrosor` | grosor de la tinta (radio en px a 720 de alto; la línea mide el doble) |

Con el ratón: arrastrar orbita (o, en el valle, gira la cabeza), Ctrl + rueda o pellizcar acerca,
doble clic vuelve al camino.

## Versiones

Cada paso quedó en su commit y etiqueta: `dibujo-v0.1-base`, `dibujo-v0.2-tinta`,
`dibujo-v0.3-acuarela`, `dibujo-v0.4-pelicula`, `dibujo-v0.5-animacion`,
`dibujo-v0.6-viaje-completo`, `dibujo-v0.7-agujero-caricatura`, `dibujo-v0.8-estrellas`,
`dibujo-v0.9-sistema-solar`, `dibujo-v0.10-remolino`, `dibujo-v0.11-pulido`,
`dibujo-v0.12-sistema-solar-fisico`, `dibujo-v0.13-entrada-tierra`, `dibujo-v0.14-valle`,
`dibujo-v0.15-flores`, `dibujo-v0.16-vida-y-destino`, `dibujo-v0.17-nubes-de-verdad`,
`dibujo-v0.18-flores-de-cerca`, `dibujo-v0.19-camara-espacio`, `dibujo-v0.20-region-de-verdad`.

La versión anterior de esta carpeta, pintada al óleo al estilo de Van Gogh, sigue en el
historial de git (etiquetas `pintura-v0.1-copia` … `pintura-v0.6-viaje-completo`).
