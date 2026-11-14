# Herramientas para Instagram

Dos apps que se abren directamente en el navegador, sin instalación:

- [PaspartuGo](paspartu_go/): fotos para el feed con paspartú. Carruseles,
  panorámicas continuas, variantes para Story y simulación de la cuadrícula del
  perfil.
- [PhotoReelsGo](photoreels_go/): Reels verticales a partir de una serie de fotos,
  con ritmo por foto o por BPM, en MP4 o como secuencia de imágenes para DaVinci
  Resolve.

[`shared/`](shared/) contiene lo que usan las dos: geometría del encaje, lectura de
EXIF, zonas seguras, ZIP, aleatorio con semilla, utilidades de interfaz y los
estilos base. Las apps cargan esos archivos con rutas `../shared/`, así que las
tres carpetas tienen que estar juntas.

## Tests

```sh
node --test shared/test paspartu_go/test photoreels_go/test
```
