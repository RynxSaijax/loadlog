/**
 * Hands a generated file to the user: the iPhone share sheet (Web Share API
 * with files) when available, otherwise a regular download. Nothing leaves
 * the device unless the user picks a destination.
 */
export async function shareFile(blob, fileName, { title } = {}) {
  const file = typeof File === 'function' ? new File([blob], fileName, { type: blob.type }) : null;
  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return 'shared';
    }
  } catch (error) {
    if (error?.name === 'AbortError') return 'cancelled';
    // NotAllowedError (no user gesture any more) and others: fall back to download.
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}

/** Reads a user-picked file as text. */
export function readFileText(file) {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
