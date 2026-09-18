/** Resize and re-encode local files before they become part of the versioned site. */
export async function prepareBrandImage(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('Escolha uma imagem JPG, PNG ou WebP de até 8 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 30000000) throw new Error('A imagem é muito grande. Use uma versão de até 30 megapixels.');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar a imagem neste navegador.');
    for (const limit of [1400, 1100, 850, 600]) {
      const ratio = Math.min(1, limit / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [.86, .72, .56]) {
        const result = canvas.toDataURL('image/webp', quality);
        if (result.startsWith('data:image/webp;base64,') && result.length <= 80000) return result;
      }
    }
    throw new Error('Não foi possível compactar esta imagem. Tente uma foto menor.');
  } finally { bitmap.close(); }
}
