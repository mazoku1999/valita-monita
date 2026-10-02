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
- `store/ritmoDibujo.ts`: el ritmo. Como en Cuphead, lo dibujado a mano (el hervor de la tinta, el
  titileo de las estrellas, la película y los lienzos de la canción) cambia 24 veces por segundo,
  mientras la cámara y el scroll van a 60 por segundo parejos; si el aparato no llega, baja por
  escalones (`ESCALONES`): primero la resolución del dibujo y, al final, 30 por segundo, también
  parejos. Los fotogramas que no toca dibujar no calculan nada. Y el compás (112
  pulsaciones por minuto): con él late el disco del agujero y se mecen las estrellas; el sistema
  solar va sin latidos.
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
  arrastrar con el ratón orbita alrededor de lo que se mira (el Sol o la Tierra), el cursor da un
  leve paralaje; en el valle, arrastrar gira la cabeza. En una pantalla táctil, el dedo es siempre
  el scroll del viaje (no orbita). Sin zoom (paso 47: ni pellizcando, ni con Ctrl + rueda, ni con
  doble clic). Todo vuelve al camino al seguir con el scroll. La cámara del agujero negro, ahí, se queda
  quieta (antes seguía girando sola y con el cursor, y el marco del agujero de gusano la seguía con
  retraso: el sistema solar se deslizaba por la pantalla y volvía solo) y el campo de visión ya no
  cambia con el scroll.
- **Estrellas detrás de los planetas**: cada píxel de una estrella comprueba si el cielo está
  abierto (antes bastaba con su centro y alguna se dibujaba encima de un planeta).

## Fluido en el móvil

Lo que hacía que en un celular el scroll y la cámara se sintieran mal, y cómo se arregló:

- **Fotogramas parejos** (`features/dibujo/store/ritmoDibujo.ts`): antes la pantalla entera se
  dibujaba a 24 por segundo, que en una pantalla de 60 Hz son fotogramas desparejos (unos duran
  tres refrescos y otros dos) y al deslizar todo temblaba. Ahora la pantalla va a 60 parejos (30 si
  el aparato pierde muchos fotogramas) y sólo lo dibujado a mano sigue a 24.
- **Un dedo, el scroll** (`hooks/useArrastreOrbital.ts`): cada deslizamiento también giraba la
  cámara, y con inercia. Ahora el dedo sólo desplaza la página.
- **Sin saltitos de la barra del navegador** (`largoDelCarril` en
  `features/narrativa/store/progresoScrollStore.ts`): el progreso se mide con el alto del carril,
  que no cambia cuando la barra del navegador se esconde o aparece.
- **Menos píxeles en pantallas táctiles** (`AgujeroNegroCanvas.tsx`): hasta 1,25 píxeles por píxel
  de CSS (1,5 con ratón); el grano de la película lo disimula.
- **Escalones de calidad** (paso 47, `ESCALONES` en `store/ritmoDibujo.ts` y
  `ResolucionAdaptable.tsx`; en el iPhone iba fluido, en Android no siempre): si el aparato pierde
  muchos fotogramas durante dos segundos, se dibuja con menos píxeles (82 % y luego 68 % de la
  resolución), manteniendo los 60 por segundo; sólo al final, 30 por segundo. Nunca vuelve a subir
  (no oscila). Con un móvil simulado que no llega, baja en unos 10 s; en uno que llega, no baja.
- **El lienzo se rehace una vez** (`resize` del `Canvas`): al aparecer o esconderse la barra del
  navegador, girar el teléfono o la pantalla completa, espera a que el tamaño deje de cambiar
  (250 ms, estirándose mientras tanto) en vez de rehacer sus texturas a cada paso, y ya no mide en
  cada scroll.
- **Sin zoom ni "tirar para recargar"** (`useSinZoom.ts`, `globals.css`, `viewport` en
  `app/layout.tsx`): ni pellizcando ni con doble toque o doble clic, en el móvil ni en el ordenador
  (en Safari, también sus gestos de pellizco), y en Android deslizar hacia arriba al principio ya no
  recarga la página.
- **Los cálculos largos en un hilo aparte** (`features/segundo-plano`): los mapas de la Tierra, la
  región de Cochabamba (textura y relieve), las sombras de las nubes, el relieve del valle, las
  flores y la vida del valle se calculan en un Web Worker (`trabajador.ts`) y llegan como arreglos
  con los que se arman las mallas y las texturas. Antes congelaban la página al empezar: con la CPU
  de un celular (la de esta Mac frenada 4 veces), unos 13 s de cálculo en los primeros segundos,
  con congelones de 1,2 a 2,4 s; ahora unos 3 s, y nada de más de 0,22 s tras la carga. Si el
  navegador no puede crear el hilo, se calculan en la página como antes.
- **Programas y mallas listos antes de verse** (`PrecalentarSombreadores.tsx`): se compilan en
  segundo plano y se suben a la GPU de antemano (también lo que llega del hilo aparte, avisado por
  `store/recursosNuevos.ts`); antes, el sistema solar y el valle trababan el viaje al aparecer.
- **El primer toque, sin tirón** (`prepararAudio` en `features/cancion/utils/audio.ts`): el Web
  Audio se creaba en el primer gesto, justo al empezar a deslizar. Ahora se crea con la página ya
  cargada y el diálogo del sonido sólo lo reanuda.
- **El video de la canción, centrado** (paso 44, con una captura del iPhone del usuario: "el video
  en celular no se ve bien centrado"): el recuadro seguía al eje del agujero de gusano (hasta un 12 %
  de la pantalla) y, en un teléfono en vertical, el campo de visión es tan angosto que un pequeño
  retraso del túnel lo llevaba a un costado. Ahora va siempre en el centro de la pantalla.
- **La canción lleva la cámara** (`guiarProgreso` en `progresoScrollStore.ts`): mientras suena, el
  progreso lo pone la canción y no el scroll de la página, porque en el iPhone, con la página
  quieta, Safari no siempre la deja desplazarse por código. Al soltarse, la página se pone donde va
  la cámara.
- **Sin saltos al cambiar el tamaño** (`useSincronizarScroll.ts`): al entrar en pantalla completa
  o girar el teléfono el carril cambia de largo; la página se lleva al mismo punto del viaje.

## Pantalla completa

Un botón de cristal arriba a la derecha (el del sonido va a su izquierda) y, en el paseo del
final, uno de papel entre sus botones (`features/narrativa/components/BotonPantallaCompleta.tsx` y
`store/pantallaCompleta.ts`). En ordenadores, Android y iPad pone la página entera a pantalla
completa y la devuelve. En el iPhone, Safari sólo deja poner a pantalla completa los videos, no
una página: el botón explica, en un cartel de papel, cómo agregarla a la pantalla de inicio
(Compartir → «Agregar a inicio»), que la abre como una app, sin las barras de Safari y con el
dibujo también bajo la barra de estado (`app/manifest.ts`, `appleWebApp` y `viewportFit: 'cover'`
en `app/layout.tsx`). Abierta así, el botón no aparece. Su ícono (también el de la pestaña) es el
agujero negro dibujado del inicio (`public/apple-icon.png`, `icono-192.png`, `icono-512.png`).

Los metadatos de la página son sólo el título, «Para mi Monita linda» (paso 46: sin descripción ni
nada más; también es el nombre de la app en la pantalla de inicio).

## Música de fondo

Donde no suena otra música (el acercamiento al agujero negro y, después de la canción, el sistema
solar, la Tierra, las nubes, el valle y el paseo, hasta que se abre la carta), una música de fondo
bajita (paso 49; el usuario la prefirió al sonido ambiente sintetizado del paso 48): una versión
instrumental que dio el usuario, en bucle (`public/fondo/musica.mp3`, recortada sin los silencios
del principio y del final y a 96 kbps). Va a un 20 % de su volumen (`NIVEL_FONDO`, unos −32 dB, muy
por debajo de la canción) y pasa por el mismo Web Audio que la canción
(`features/ambiente/utils/musicaDeFondo.ts`). Empieza al presionar el diálogo del sonido; se calla
con un fundido (y se pausa) mientras suena la canción o la música de la carta, o si se silencia, y
vuelve por donde iba (`components/MusicaDeFondo.tsx`). En el iPhone suena aunque el teléfono esté en
silencio, y si el sistema pausa el audio (una llamada), el siguiente toque lo reanuda. En
desarrollo, `window.__fondo()` dice si suena y por qué segundo va.

## La canción del agujero negro

El usuario pidió la letra de una canción mientras se cruza el agujero negro, como en un video de
letras (`features/cancion`). El audio y la letra son archivos suyos en `public/cancion/`
(`cancion.mp3` y `cancion.vtt`): la letra se lee al vuelo, no está escrita en el código.

- **El cruce al compás** (`constantes/cancion.ts`, `components/CancionDelAgujero.tsx`): la
  canción empieza sola recién al entrar en el agujero bajando (446 vh: el iris ya se cerró sobre la
  sombra), sin botón de play; el scroll se queda quieto y la cámara avanza sola moviendo la página
  por el carril. El recorrido sale de los tiempos de la letra (`recorridoDeLaCancion`): la canción
  empieza en lo negro, el iris se abre sobre el remolino durante la introducción y, durante toda la
  letra, la cámara sigue dentro del agujero de gusano, avanzando muy despacio (de 524 a 539 vh: la
  boca del otro lado queda escondida tras el portal de las escenas). 12 s después de la última
  línea se suelta el scroll todavía en el túnel (540 vh), con el mensaje del final en pantalla: la
  salida y nuestro sistema solar se recorren deslizando, mientras suena lo que queda. Botón de
  cristal para saltarla (arriba a la izquierda, o Escape), que lleva directo al mensaje; volver
  fuera del agujero (400 vh) la deja lista para otra vez.
- **El sonido** (`utils/audio.ts`, `components/DialogoSonido.tsx`, `components/BotonSonido.tsx`):
  los navegadores sólo dejan sonar tras un gesto (clic, tecla o toque; la rueda no cuenta), así
  que al abrir la página hay un diálogo que hay que presionar para activar el sonido (paso 45: el
  usuario prefirió eso al botón de cristal que, con su animación, iba del centro a la esquina): un
  cartel de papel crema con tinta sobre el viaje en penumbra, quieto; mientras está, la página no
  se desplaza, y tocar fuera no lo cierra. Después, un botón pequeño arriba a la derecha (en el
  paseo del final, entre sus botones de papel) lo apaga o lo enciende en todo el viaje, también la
  música de fondo. Si aun así el navegador no la deja sonar, la canción va en silencio con la letra
  y el cruce, o con un reloj propio. Se empieza a cargar a 150 vh y pasa por Web Audio para los
  fundidos.
- **La letra, en español y sincronizada palabra por palabra** (`public/cancion/cancion.vtt`,
  `utils/vtt.ts`, `utils/letra.ts`): el texto es la traducción
  al español que dio el usuario, tal cual (habla de hombre a mujer: "tuyo" para él; "mía" e
  "indicada" para ella). La hora de cada palabra inglesa se sacó del propio audio: la voz se aísla
  del canal central (las guitarras y el piano van a los lados), se miden sus comienzos de nota
  (subida de 2–4 kHz, flujo espectral, sibilancia) sobre la rejilla del pulso (122 BPM) y cada
  palabra se colocó en su nota y se comprobó sobre el espectrograma, línea por línea (los dos
  estribillos, a 176 pulsos, se confirman entre sí). Cada palabra en español se enciende cuando se
  canta la palabra inglesa que dice lo mismo (si dos caen en una, se la reparten; si la voz
  respira, la palabra se cierra). Se guarda como WebVTT de karaoke, el formato estándar: una marca
  de tiempo antes de cada palabra y, en las respiraciones, una que la cierra. `cancion.srt` tiene
  el mismo texto en español con los tiempos de cada línea; `cancion.en.vtt`, la letra original en
  inglés sincronizada igual (para usarla, basta con apuntar `CANCION.letra` a ella).
- **El escenario: un dibujo animado de los años 30** (`escenario/`,
  `components/EscenarioCancion.tsx`; lo pidió el usuario: "estilo Cuphead, que no parezca IA, las
  letras derechas"; después: "debe verse que aún estamos viajando por el agujero negro"; y luego:
  "más enfocado el video, por encima de los costados del agujero de gusano… más prioridad al
  lyrics"). Son dos lienzos 2D pintados a 24 dibujos por segundo (las escenas, "en dos", a 12): la
  escena, en su recuadro, y encima la letra y el final, con transparencia. El pase de dibujo los
  compone entre el dibujo y la película (`VIAJE_FRAG`), así que les caen el grano, el vaivén y la
  viñeta como a todo lo demás. Mientras suena, la escena va casi a pantalla completa, ancha y nítida
  en el fondo del túnel (en el centro de la pantalla), con un borde de acuarela fino y apenas
  ondulado, como el de una ilustración de libro. Alrededor, el agujero de gusano, tranquilo y con los colores apagados del dibujo, que
  cambia a lo largo de la canción: el remolino dibujado de antes hasta media primera estrofa, un
  cielo de noche con aguadas y estrellas finas el resto de la estrofa, nubes pintadas lilas en el
  estribillo y el interludio, anillos pintados en la segunda estrofa y nubes de atardecer en el
  último estribillo, cada uno fundiéndose en el siguiente en 2 s; todos convergen en un punto, sin
  el círculo de la boca en medio. Tras la canción, al seguir deslizando por el resto del túnel, las
  nubes de noche, que se funden con el cielo del otro lado cuando el túnel 3D ya lo enseña entero.
  (Una versión anterior, con vórtices de neón, estelas, auroras y un halo grueso de papel crema, le
  pareció "horrible, muy exagerado".)
  Mientras el final tapa la pantalla, la escena 3D y el resto del dibujo no se calculan.
  - **El pincel** (`pincel.ts`): contornos de tinta sepia que hierven 12 veces por segundo,
    rellenos planos con textura de acuarela sobre papel y el borde oscuro de la aguada; las formas
    son puntos unidos por curvas suaves, sin degradados digitales ni resplandores.
  - **Una escena por sección** (`escenas.ts`, con las piezas de `piezas.ts`), pintadas en su
    recuadro (lo importante, hacia dentro; el suelo, por encima de la cinta): paisajes en capas que
    la cámara recorre despacio,
    cada una a su velocidad (la cámara multiplano de la época), y utilería que entra con su rebote
    según de qué habla cada línea; nada de caras, corazones ni rótulos. La noche (primera estrofa):
    lomas con árboles redondos y una casita con la ventana encendida y humo; aparecen estrellas,
    sube la más grande, una estrella fugaz busca el camino y lo encuentra, pasa un planeta con
    anillos, las estrellas se unen en constelación, dos estrellas bailan hasta juntarse y la luna
    se ilumina. Los girasoles (estribillo): el sol de rayos sobre el campo, con su granero y su
    valla; la Tierra le da la vuelta (por detrás y por delante), la elegida crece por encima de
    todas, un avión de papel se aleja, dos girasoles se inclinan hasta juntarse y vuelan pétalos;
    en el interludio se pone el sol. La lluvia (segunda estrofa): una tormenta sobre un pueblito que
    escampa, los rayos de sol y el arcoíris, un brote, el árbol que se vuelve otoño, fotos colgadas
    de una cuerda y una pluma que dibuja un girasol, lo colorea y lo firma con una floritura. El
    atardecer (último estribillo): los girasoles en naranja; al final se hace de noche y sale la
    primera estrella.
  - **Los cortes** (`Escenario.ts`): la primera escena llega desde el fondo del túnel antes de la
    primera línea; para cambiar de escena, la que se va pasa de largo (se acerca, se desenfoca hacia
    fuera y se desvanece), se ve el vórtice un momento y la siguiente llega desde el fondo, por
    debajo de la cinta, así que la letra no se tapa nunca. Tras la última línea se hace de noche y
    la última escena pasa de largo.
  - **El final** (`final.ts`, `MENSAJE_FINAL` en `constantes/cancion.ts`; lo pidió el usuario: "al
    final que diga Valeria te amo… con una escena y animación bonita, y que diga que siga
    deslizando"): ya fuera del túnel, una noche sobre el campo de girasoles con su luna y alguna
    estrella fugaz; las estrellas aparecen una a una y se unen, como la constelación de la primera
    estrofa, hasta escribir VALERIA; una cinta se despliega con el resto del mensaje y los
    girasoles levantan la cabeza para mirarlo. Se descubre desde el fondo del túnel en un círculo de
    borde suave. Al soltarse el scroll aparece "Sigue deslizando" en un cartelito (en claro sobre la
    noche, la S de la Corben parecía un 8); el final se queda hasta que se desliza y entonces se
    cierra hacia el fondo del túnel (según lo deslizado: si se vuelve, se abre otra vez). Lleva su
    propio reloj, así que también sale al saltar la canción.
  - **La letra en una cinta de época** (`letrero.ts`): derecha y quieta, con una sola letra de
    rótulo (Corben), en tinta sepia y roja en cuanto se canta cada palabra; un girasolito salta de
    palabra en palabra como la pelotita de las canciones de Fleischer (cae en cada una justo al
    cantarse, se aplasta al caer y se estira en el aire). La cinta se despliega cuando una línea
    llega tras una pausa y se voltea como un cartel cuando llega enseguida.

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
  el cielo de "La noche estrellada" de Van Gogh como en la reproducción al pastel que mandó el
  usuario, sólo el cielo, sobre las montañas de verdad (el Tunari, a la luz de la luna, con su
  tinta). Todo son pinceladas largas y peinadas que siguen el viento: una corriente cuyas líneas van
  casi horizontales con ondas, siguen abajo la franja verde amarilla que sube hacia la derecha y
  rodean cada estrella como el agua una piedra. Las pinceladas van en franjas a lo largo de esas
  líneas (tres capas desfasadas), partidas en tramos con su hueco: cada una entra apoyada, sale
  afinándose, se desliza despacio y toma un color de su región (azules ultramar, cobalto y añil con
  trazos cerúleos; la franja clara que llega desde la izquierda; la franja verde). Las ocho
  estrellas y la luna son discos de pinceladas en redondo (núcleo amarillo, anillos blancos, verde
  agua y celestes; la luna, verde amarilla y dorada alrededor del creciente naranja, sin cara); la
  ola y su compañero son espirales de paso fijo que se enroscan como las agujas del reloj, con un
  brazo claro que sale por arriba hacia el viento. En las orillas, unas pinceladas son del viento y
  otras del disco, cada una entera (se decide por su eje). Se compone sobre la vista final (cabe
  igual en el ordenador y en un móvil en vertical), cae como una aguada que baja desde lo alto y,
  antes, cada nube hace "puf" (se hincha un poco y se encoge entera hasta desaparecer; al salir de
  la carta, vuelven). De noche no salen las estrellitas del dibujo animado (no están en el cuadro)
  y la película pierde casi todo su sepia, para que los azules y amarillos sigan vivos; las
  estrellitas de la cajita siguen brillando delante.
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

Con el ratón: arrastrar orbita (o, en el valle, gira la cabeza); sin zoom (con el dedo, deslizar es
el scroll). Al final, en el corazón: W/S o ↑/↓ (andar), A/D (de lado), ←/→
(girar) y Mayúsculas (correr); arrastrar mira alrededor. En pantallas táctiles, la palanca. En la
carta, Escape sale. En desarrollo, `window.__carta.abrir()` / `salir()` abren y cierran la cajita y
`window.__carta.saltar(s)` adelanta su reloj; `window.__cancion.saltarA(s)` lleva la canción del
agujero a otro segundo (y `fase()`, `sonido()`, `audible()`, `tiempo()`, `saltar()`), y
`window.__escenario` muestra el estado del escenario de la canción; `window.__ritmoPantalla()` y
`window.__resolucionPantalla()`, el escalón de calidad.

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
`dibujo-v0.26-sobre-y-cuadro`, `dibujo-v0.27-noche-cuphead`,
`dibujo-v0.28-cielo-como-el-cuadro`, `dibujo-v0.29-cancion-del-agujero`,
`dibujo-v0.30-sonido-al-inicio`, `dibujo-v0.31-letra-a-tiempo`,
`dibujo-v0.32-letra-tal-cual`, `dibujo-v0.33-musica-de-la-carta`,
`dibujo-v0.34-musica-al-abrirse-la-carta`, `dibujo-v0.35-letra-sincronizada`,
`dibujo-v0.36-letra-en-espanol`, `dibujo-v0.37-escenas-de-la-letra`,
`dibujo-v0.38-escenario-cuphead`, `dibujo-v0.39-portal-y-mensaje`, `dibujo-v0.40-video-y-vortice`,
`dibujo-v0.41-viajes-y-papel`, `dibujo-v0.42-viaje-sereno`, `dibujo-v0.43-fluido-en-movil`, `dibujo-v0.44-centrado-y-pantalla-completa`, `dibujo-v0.45-dialogo-de-sonido`, `dibujo-v0.46-titulo`, `dibujo-v0.47-sin-zoom-y-android`, `dibujo-v0.48-sonido-ambiente`, `dibujo-v0.49-musica-de-fondo`.

La versión anterior de esta carpeta, pintada al óleo al estilo de Van Gogh, sigue en el
historial de git (etiquetas `pintura-v0.1-copia` … `pintura-v0.6-viaje-completo`).
