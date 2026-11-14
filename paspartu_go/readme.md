# Paspartugo

Prepara fotos para el feed de Instagram con paspartú: carruseles, panorámicas
continuas y variantes para Story. Todo se procesa en el navegador; las fotos no
salen de tu equipo.

Los Reels se hacen con [PhotoReelsGo](../photoreels_go/).

## Uso

Abre `index.html` en un navegador. No necesita instalación ni servidor.

### Carrusel

1. Arrastra las fotos (JPG, PNG o WebP) y ordénalas. La primera es la portada.
2. Ajusta el paspartú en el panel izquierdo.
3. Exporta:
   - **Exportar**: ZIP con `paspartugo_NN.jpg`.
   - **Feed + Story + Square**: ZIP con cada foto en `feed/` (4:5), `story/` (9:16)
     y `square/` (1:1).

### Panorámica

Carga una imagen y elige paneles (2 a 10), formato (4:5 o 1:1) y ajuste. Exporta
un ZIP con `slide_NN.jpg`.

- **Antes de dividir**: el paspartú rodea la panorámica entera y la imagen es
  continua entre slides.
- **Después**: cada panel lleva su propio marco.
- **Rellenar** recorta lo justo para ocupar los paneles; **Encajar** no recorta.

El pie EXIF va dentro de un solo panel para que ninguna costura lo corte: izquierda
en el primero, derecha en el último y centro en el panel central. El texto se edita
bajo los paneles.

### Grilla

Muestra tu portada en la cuadrícula de 3 columnas del perfil. Carga publicaciones
anteriores y arrastra para probar el orden. No se guardan al cerrar la página.

## Ajustes

- **Formato Auto**: elige entre 4:5, 3:4 y 1:1 el formato en el que las fotos ocupan
  más lienzo. Instagram aplica la proporción de la primera slide a todo el carrusel.
- **Margen mínimo**: % del ancho del lienzo. La foto nunca se recorta.
- **Paleta**: colores dominantes de tus fotos; un clic los aplica al fondo o al borde.
- **Sombra y textura**: la textura solo afecta al fondo, nunca a la foto.
- **Datos EXIF**: lee cámara, lente, focal, apertura, velocidad e ISO. El texto se
  edita bajo cada imagen, con un máximo de dos líneas.
- **Presets**: incluye tres y guarda los tuyos en este navegador.
- **Zonas seguras**: guías que solo se ven en pantalla. Las de Historias siguen
  los porcentajes de las guías de anuncios de Meta; las del feed son aproximadas.

## Desarrollo

HTML, CSS y JavaScript sin dependencias ni compilación. Los scripts son clásicos,
no módulos ES, para que la app funcione abriendo el archivo desde `file://`.

Los módulos que comparte con PhotoReelsGo están en [`../shared/`](../shared/): no
los copies dentro de esta carpeta.

| Archivo | Responsabilidad |
| --- | --- |
| `../shared/js/layout.js` | Formatos y encaje de la foto |
| `../shared/js/exif.js` | Lectura de EXIF y pie de foto |
| `../shared/js/safezones.js` | Zonas seguras de Instagram |
| `../shared/js/zip.js`, `../shared/js/random.js`, `../shared/js/dom.js` | ZIP, aleatorio con semilla, utilidades de interfaz |
| `js/panorama.js` | Plan de división de panorámicas |
| `js/palette.js` | Colores dominantes (k-means en Lab) |
| `js/texture.js` | Texturas procedurales |
| `js/presets.js` | Ajustes por defecto y presets |
| `js/compositor.js` | Composición de cada imagen |
| `js/exporters.js` | Exportaciones |
| `js/grid.js`, `js/app.js` | Interfaz |

Los módulos sin DOM tienen tests. Desde la carpeta raíz del repositorio:

```sh
node --test shared/test paspartu_go/test
```

Para añadir un ajuste: declara su valor en `DEFAULTS` (`js/presets.js`), añade un
control con `data-bind="s.ruta.del.ajuste"` en `index.html` y úsalo en
`js/compositor.js`. Los presets lo guardan automáticamente.
