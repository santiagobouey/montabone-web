// Prepara un archivo (foto o PDF) para mandarlo a la IA.
// Las fotos del celular pesan varios MB y en base64 superan el límite del servidor,
// por eso las imágenes se reducen y comprimen antes de enviarlas.

const MAX_LADO = 1600;
const CALIDAD = 0.82;
const LIMITE_BASE64 = 3_500_000; // ~3,5 MB

function leerBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

function cargarImagen(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo abrir la imagen')); };
    img.src = url;
  });
}

export async function prepararArchivoIA(file: File): Promise<{ base64: string; mediaType: string }> {
  // PDF u otro formato: se envía tal cual
  if (!file.type.startsWith('image/')) {
    const base64 = await leerBase64(file);
    if (base64.length > LIMITE_BASE64) {
      throw new Error('El archivo es muy pesado. Sube un PDF más liviano o sácale una foto.');
    }
    return { base64, mediaType: file.type };
  }

  // Imagen: redimensionar y comprimir
  let ancho = 0, alto = 0;
  let fuente: CanvasImageSource;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    ancho = bitmap.width; alto = bitmap.height; fuente = bitmap;
  } catch {
    const img = await cargarImagen(file);
    ancho = img.naturalWidth; alto = img.naturalHeight; fuente = img;
  }

  const escala = Math.min(1, MAX_LADO / Math.max(ancho, alto));
  const w = Math.max(1, Math.round(ancho * escala));
  const h = Math.max(1, Math.round(alto * escala));

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Sin canvas disponible: mandar el original
    return { base64: await leerBase64(file), mediaType: file.type };
  }
  ctx.drawImage(fuente, 0, 0, w, h);

  let calidad = CALIDAD;
  let base64 = canvas.toDataURL('image/jpeg', calidad).split(',')[1];
  // Si aún queda pesada, bajar calidad
  while (base64.length > LIMITE_BASE64 && calidad > 0.4) {
    calidad -= 0.15;
    base64 = canvas.toDataURL('image/jpeg', calidad).split(',')[1];
  }
  if (base64.length > LIMITE_BASE64) {
    throw new Error('La imagen es muy pesada. Intenta con una foto más pequeña.');
  }
  return { base64, mediaType: 'image/jpeg' };
}
