# PhotoReelsGo

Convierte una serie de fotos en un vídeo vertical 9:16 para Reels: ritmo por foto,
encuadre con paspartú o a pantalla completa y movimiento suave opcional. Sin
audio: la música se añade en el editor. Todo se procesa en el navegador; las fotos
no salen de tu equipo.

## Uso

Abre `index.html` en un navegador. No necesita instalación ni servidor, pero la
carpeta `../shared/` tiene que estar junto a esta.

1. Arrastra las fotos. Cada tanda se ordena por fecha de captura (EXIF); las que
   no tienen fecha van al final, por nombre. Después puedes reordenarlas a mano o
   con **Fecha**, **Nombre** y **Aleatorio**.
2. Elige el ritmo, el encuadre y, si quieres, movimiento.
3. Mira el resultado en la vista previa (barra espaciadora: reproducir o pausar) y
   exporta.

### Ritmo

- **Fijo**: todas las fotos duran lo mismo, de 0,1 a 4 s.
- **BPM**: el tempo de la canción y cuántos tiempos dura cada foto. Si en el editor
  colocas la canción al principio del vídeo, los cortes caen en el tiempo.
- **Rampa**: la duración pasa de forma lineal de la primera foto a la última. De
  1 s a 0,2 s acelera; al revés, frena.
- **Patrón**: una lista de segundos que se repite, como `0.8 0.3 0.3 0.8`.

El vídeo solo tiene fotogramas enteros: 0,3 s a 24 fps son 7,2. Cada corte se
redondea desde el tiempo acumulado, así que el montaje nunca se desplaza más de
medio fotograma respecto al ritmo. Cada miniatura muestra su duración real.

### Encuadre

- **Paspartú**: la foto entera, sin recortar, sobre un color o sobre ella misma
  desenfocada. Margen y borde como en PaspartuGo.
- **Pantalla completa**: llena el 9:16 recortando. Haz clic en la miniatura para
  elegir qué parte se conserva; la zona oscurecida es la que se pierde.

### Movimiento

Acercar, alejar, alternar ambos o paneo, con intensidad del 1 al 15 %. Solo se
aplica a fotos de 0,8 s o más: en las cortas se vería como un temblor. El avance
es lineal, para que no dé tirones en los cortes.

## Exportación

| Formato | Para qué | Archivo |
| --- | --- | --- |
| PNG | DaVinci Resolve y otros editores, sin pérdida | `frame_00000.png`, `frame_00001.png`… |
| JPEG | Lo mismo ocupando mucho menos (calidad 95 %) | `frame_00000.jpg`… |
| MP4 | Subir directamente a Instagram o editores que abren H.264 | `photoreelsgo_1080x1920_30fps.mp4` |

- **Resolución**: 1080×1920, o 2160×3840 para reencuadrar en el editor sin perder
  nitidez. Si una foto tiene menos píxeles de los que necesita, su miniatura lo
  avisa.
- **Fotogramas por segundo**: 24, 30 o 60, siempre constantes.
- **MP4**: H.264 con el perfil y nivel que exigen la resolución y la cadencia, un
  fotograma clave en cada corte y color etiquetado BT.709.

En Chrome y Edge, las secuencias se guardan directamente en una carpeta nueva
dentro de la que elijas, sin pasar por la memoria. Firefox no lo permite y las
descarga en un ZIP. Una foto quieta se codifica una sola vez aunque ocupe muchos
fotogramas.

### DaVinci Resolve

La versión gratuita de DaVinci Resolve en Linux no abre H.264: usa PNG o JPEG.

1. Crea el proyecto con la misma cadencia que el vídeo exportado.
2. Arrastra la carpeta al Media Pool: la secuencia aparece como un solo clip.
3. Si la cadencia no coincide, cámbiala en **Clip Attributes**.

Si prefieres no usar DaVinci, Kdenlive y Shotcut son gratuitos y abren MP4 en Linux.

## Desarrollo

HTML, CSS y JavaScript sin dependencias ni compilación, con scripts clásicos para
que funcione desde `file://`. Los módulos comunes con PaspartuGo están en
[`../shared/`](../shared/).

| Archivo | Responsabilidad |
| --- | --- |
| `js/timeline.js` | Duración de cada foto y fotogramas de cada corte |
| `js/framing.js` | Encuadre en el 9:16, movimiento y resolución necesaria |
| `js/kenburns.js` | Trayectoria del movimiento |
| `js/order.js` | Orden por fecha, nombre o aleatorio |
| `js/codec.js` | Perfil y nivel H.264 |
| `js/mp4.js` | Escritura del MP4 |
| `js/settings.js` | Ajustes por defecto; recuerda los últimos usados |
| `js/render.js` | Dibujo de fotogramas y exportación |
| `js/app.js` | Interfaz |

Los módulos sin DOM tienen tests. Desde la carpeta raíz del repositorio:

```sh
node --test shared/test photoreels_go/test
```

Para añadir un ajuste: declara su valor en `DEFAULTS` (`js/settings.js`), añade un
control con `data-bind="s.ruta.del.ajuste"` en `index.html` (con
`data-type="number"` si es un botón de opción con valor numérico) y úsalo en
`js/framing.js` o `js/render.js`. `data-show="s.ruta=valor"` muestra un control
solo cuando el ajuste tiene ese valor.
