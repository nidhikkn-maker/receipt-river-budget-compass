// Shrinks phone photos (often 3–8 MB, sometimes HEIC) to a JPEG small enough for AI reading.
// The original file is still what gets stored; this copy is only sent for extraction.
export async function prepareForReading(dataUrl: string, mimeType: string, maxSide = 1800): Promise<{ dataUrl: string; mimeType: string }> {
  if (!mimeType.startsWith("image/") && mimeType !== "") return { dataUrl, mimeType };
  if (dataUrl.length < 1_500_000 && /^image\/(jpeg|png|webp)$/.test(mimeType)) return { dataUrl, mimeType };
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("decode")); img.src = dataUrl; });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), mimeType: "image/jpeg" };
  } catch {
    return { dataUrl, mimeType };
  }
}
