const SIZE = 256;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * Crops a chosen image to a centred square and shrinks it to a small JPEG.
 * Redrawing it also drops the original's metadata, such as where the photo was taken.
 */
export async function squarePhoto(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Choose a photo under 25 MB.');
  let image: ImageBitmap;
  try { image = await createImageBitmap(file); }
  catch { throw new Error('This file can’t be opened. Choose a JPEG, PNG or WebP image.'); }
  const side = Math.min(image.width, image.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser can’t prepare the photo.');
  // JPEG has no transparency; a transparent PNG would otherwise turn black.
  context.fillStyle = '#fff';
  context.fillRect(0, 0, SIZE, SIZE);
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  image.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}
