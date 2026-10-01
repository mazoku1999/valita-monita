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
  lado, sobre Cochabamba ya de día; en el último tramo la mirada pasa del centro de la Tierra a
  Cochabamba, que queda en el centro de la pantalla hasta el valle. El brillo del mar es pequeño y
  se apaga cuando la Tierra llena la pantalla.
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
  la ciudad con sus avenidas, el valle de las flores y el corazón.
- **El valle de las flores** (`utils/campos.ts`, `shaders/campos.ts`): alrededor del corazón,
  manzanas irregulares alargadas a lo largo del eje del valle (Voronoi sobre un dominio deformado y
  estirado), partidas en franjas largas que siguen casi todas el eje, como las parcelas junto a sus
  acequias: girasoles (más cerca del corazón y detrás de él), flores de corte rosadas, lilas, fucsias
  y blancas, prados, alfalfa, maíz y tierra arada, en grupos de franjas del mismo cultivo; algunas
  manzanas son invernaderos, huertos o un patio con su casa. Entre ellas, caminos, setos de
  eucaliptos o nada; un arroyo con su fila de árboles y un prado alrededor del corazón. Los datos de
  cada manzana van en una textura que leen igual la GPU (que pinta el suelo) y la CPU (que planta
  los girasoles en sus franjas y los árboles en los setos): las mismas cuentas, el mismo campo.
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
- **Las flores** (`utils/flores.ts`, `shaders/flores.ts`): girasoles en hileras dentro de sus
  franjas, mirando al Sol, y, dentro del corazón, las flores del ramo de las fotos; cada cabeza se
  dibuja en su quad con pétalos de colores planos y su línea fina. Aparecen y ganan detalle según
  su tamaño en pantalla (desde el aire el suelo ya pinta el tapiz), y la tinta de tallos y hojas
  llega con el tamaño. Los tallos tienen su grosor de verdad (al menos un píxel): gruesos, eran un
  bosque de palos.
- **El paseo por el corazón**, con los mandos de un juego (`store/paseo.ts`, `hooks/usePaseo.ts`,
  `components/ControlesPaseo.tsx`): posada la cámara aparecen, de papel y tinta, en pantallas
  táctiles una palanca abajo a la izquierda (sale bajo el pulgar, en la mitad izquierda; a fondo, se
  corre) y, con teclado y ratón, en su sitio el dibujo de las flechas (como en los juegos de
  ordenador, sin palanca); una pista de deslizar para mirar abajo a la derecha (se va la primera vez
  que se mira) y dos botones arriba a la derecha: volver al ramo (la casa) y volver al viaje (la
  flecha). En un portátil con pantalla táctil, la palanca sale al tocarla. Mirar es arrastrar en
  el resto de la pantalla, como en los juegos (a la derecha, se gira a la derecha), sin inercia;
  con teclado, W/S o ↑/↓ andan, A/D se apartan de lado, ←/→ giran y Mayúsculas corre. El corazón es
  el área de juego: contra su borde uno se desliza sin quedarse pegado. Al echar a andar, la cámara
  se pone de pie (1,15 m) mirando algo hacia abajo; paseando, tocar la pantalla no desplaza la
  página. Lo que queda pegado a la cámara se deshace en un tramado en vez de cortarse, y los pétalos
  al viento acompañan a quien pasea.
- **El girasolar alrededor del corazón** (`distanciaGirasolar` en `utils/campos.ts`): donde había
  un prado verde, girasoles en hileras a lo largo del eje del valle, bajos junto al corazón (a la
  altura de los ojos) y más altos hacia fuera, con un sendero de tierra entre ellos y el ribete de
  gipsófila blanca y rosa pálido; alrededor, los campos cercanos son sobre todo girasoles y flores
  (los verdes, más lejos). De cerca, bajo los girasoles, tierra entre las hileras; por detrás, se
  ven su cáliz verde claro y sus pétalos.
- **El suelo del macizo**: verde en sombra con hojarasca menuda de poco contraste; cada planta lleva
  sólo sus hojas (la gerbera en roseta a ras del suelo, el lirio largas por el tallo, la rosa
  pequeñas), con el contorno verde oscuro. Las flores cubren todo el corazón (unas 18.000, más
  tupidas donde se posa la cámara) y a sus pies crecen flores bajas que no se ven desde la pose
  final. (Con mil hojas sueltas grandes a tinta negra y pétalos caídos, el suelo se veía demasiado
  cargado.)
- **La cajita y la carta** (`components/Cajita.tsx`, `store/carta.ts`, `constantes/carta.ts`,
  `utils/coreografia.ts`, `components/CartaEstrellada.tsx`): entre las flores, sobre un tocón (que
  no se atraviesa al pasear), una cajita de regalo celeste con lunares y lazo dorado que de vez en
  cuando se menea. Se abre tocándola o con el botón del regalo: la cámara se acerca si hace falta,
  la tapa salta dando vueltas, sale luz y una lluvia de estrellitas sube en espiral; la cámara la
  sigue hasta el cielo, ya sin mandos ni scroll, y cae la noche. Entonces llega un sobre de papel
  con su sello de lacre (un girasol), se abre la solapa, la carta asoma y se despliega: papel crema
  con su grano y sus dobleces, un girasol dibujado y el texto del usuario escrito a mano (Caveat)
  en tinta azul, con la despedida en tinta roja; si no cabe, se desplaza dentro de la hoja (con una
  flechita que avisa). Botones de cristal: salir (arriba a la izquierda, o Escape: la noche se
  levanta, la mirada vuelve a la cajita, la tapa cae en su sitio y vuelven los mandos; se puede
  abrir otra vez) y guardar o sacar la carta para ver el cielo (arriba a la derecha). El texto es
  el del usuario; sólo se ajusta el espacio de las comas.
- **La noche estrellada** (`features/dibujo/shaders/nocheEstrellada.ts`, en el pase de dibujo):
  compuesta como el cuadro de Van Gogh y dibujada a la manera del dibujo animado. El cielo es un
  campo de pinceladas cortas, cada una orientada con el viento: ondas horizontales, el gran remolino
  doble del centro (su compañero gira al revés: la ola) y uno pequeño a la derecha, y anillos
  alrededor de las once estrellas y de la luna; su color sale de dónde están (los halos amarillos y
  verdosos, los brazos claros de los remolinos, las franjas claras del viento, los azules de la
  noche). Abajo, las colinas azules con pinceladas que siguen su lomo, el pueblo con sus ventanas
  encendidas apiñado alrededor de la iglesia de aguja alta y, a la izquierda, el ciprés como una
  llama oscura que sube hasta arriba; la luna en cuarto creciente (sin cara). Todo fluye despacio.
  Se compone sobre la vista final (cada elemento colocado respecto a los bordes: cabe igual en el
  ordenador y en un móvil en vertical) y cae sobre la escena como una aguada que baja desde lo
  alto.
- **El ramo** (`RAMO`, `RELLENO`): delante de la cámara final, compuesto como el de las fotos (una
  gerbera, el lirio abierto con sus capullos, rosas, claveles de poeta, bocas de dragón, gipsófila,
  dianthus verdes, eucalipto y hojas de aspidistra) y rellenado, tupido y en cúpula, sin que ninguna
  flor tape a otra de delante más de un poco; con su propio azar, para que no lo baraje lo que cambie
  en los campos.
- **La vida** (`utils/vida.ts`, `shaders/vida.ts`, `components/VidaDelValle.tsx`): hileras de
  eucaliptos con claros, nubes de la mañana (unas agarradas a las faldas del Tunari, otras en el
  cielo del oeste), mariposas que aletean y a ratos planean, y pétalos que lleva la brisa.
- **Las flores de cerca**, como en las fotos: rosas rosa claro, fucsia, lila y rubor, con pétalos
  en tres vueltas, cada uno oscuro en su base y claro en el borde enrollado, y el capullo en espiral;
  lirios "stargazer" blancos con el rubor rosa, la garganta verde, motitas, estambres con sus anteras
  y el pistilo, y sus capullos largos verde crema; gerberas rosa pálido de pétalos en tira con el
  centro casi negro granate y un aro malva con polen; claveles de poeta en cabezas sueltas de
  florecillas de cinco pétalos dentados (cereza, granate con el borde y el ojo blancos, fucsia o
  morado) sobre su barba de brácteas verdes; bocas de dragón con florecillas mullidas de dos labios y
  botones verde salvia peludos; gipsófila teñida de rosa en racimitos de pompones sobre ramitas en
  horquilla; dianthus verdes como pompones de musgo; eucalipto y aspidistra. Los tallos se mecen con
  su flor y quedan siempre detrás de ella.
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
doble clic vuelve al camino. Al final, en el corazón: W/S o ↑/↓ (andar), A/D (de lado), ←/→
(girar) y Mayúsculas (correr); arrastrar mira alrededor. En pantallas táctiles, la palanca. En la
carta, Escape sale. En desarrollo, `window.__carta.abrir()` / `salir()` abren y cierran la cajita y
`window.__carta.saltar(s)` adelanta su reloj.

## Versiones

Cada paso quedó en su commit y etiqueta: `dibujo-v0.1-base`, `dibujo-v0.2-tinta`,
`dibujo-v0.3-acuarela`, `dibujo-v0.4-pelicula`, `dibujo-v0.5-animacion`,
`dibujo-v0.6-viaje-completo`, `dibujo-v0.7-agujero-caricatura`, `dibujo-v0.8-estrellas`,
`dibujo-v0.9-sistema-solar`, `dibujo-v0.10-remolino`, `dibujo-v0.11-pulido`,
`dibujo-v0.12-sistema-solar-fisico`, `dibujo-v0.13-entrada-tierra`, `dibujo-v0.14-valle`,
`dibujo-v0.15-flores`, `dibujo-v0.16-vida-y-destino`, `dibujo-v0.17-nubes-de-verdad`,
`dibujo-v0.18-flores-de-cerca`, `dibujo-v0.19-camara-espacio`, `dibujo-v0.20-region-de-verdad`,
`dibujo-v0.21-flores-del-ramo`, `dibujo-v0.22-paseo-corazon`, `dibujo-v0.23-girasolar-y-mandos`,
`dibujo-v0.24-palanca-tactil`, `dibujo-v0.25-carta-noche-estrellada`,
`dibujo-v0.26-sobre-y-cuadro`.

La versión anterior de esta carpeta, pintada al óleo al estilo de Van Gogh, sigue en el
historial de git (etiquetas `pintura-v0.1-copia` … `pintura-v0.6-viaje-completo`).
