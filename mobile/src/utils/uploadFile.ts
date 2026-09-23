import * as FileSystem from 'expo-file-system/legacy';

import { apiFetch, ApiError } from '../api/client';

const DEFAULT_UPLOAD_TIMEOUT_MS = 45000; // larger files (voice notes, video clips) need more than apiFetch's 12s JSON-request budget

// React Native's own FormData + fetch multipart upload throws "Unsupported
// FormDataPart implementation" on this app's New Architecture build - a
// known RN regression, not a real network failure, even though the error
// it surfaces (a plain rejected fetch) looks exactly like one. expo-file-
// system's own dedicated native upload task sidesteps that broken code
// path entirely by never going through JS FormData/fetch at all.
//
// It always sends the file's own on-disk basename as the multipart
// filename - there's no option to override it - so the picked file is
// copied to a cache path under the real attachment name first. Without
// this, a document would upload under a meaningless cache UUID instead of
// something like "report.pdf".
export async function uploadFile<T = unknown>(
  url: string,
  file: { uri: string; name: string; type: string },
  fieldName: string,
  timeoutMs: number = DEFAULT_UPLOAD_TIMEOUT_MS,
): Promise<T> {
  // uploadAsync builds its own native OkHttp/URLSession client rather than
  // going through fetch, so it never picks up this app's session cookie -
  // every upload would otherwise fail with "You must be signed in" despite
  // a real, working login. A one-off token minted through a normal
  // (cookie-authenticated) call substitutes for that missing cookie; it's
  // fine if this fails open (server.js falls back to the cookie itself),
  // so a token-mint failure here isn't treated as fatal.
  let uploadUrl = url;
  try {
    const { token } = await apiFetch<{ success: true; token: string }>('/api/uploads/token', { method: 'POST' });
    uploadUrl = `${url}${url.includes('?') ? '&' : '?'}uploadToken=${encodeURIComponent(token)}`;
  } catch {
    // Falls through with the plain url - the upload will still work if the
    // session cookie happens to reach the server some other way.
  }

  const safeName = (file.name || 'attachment').replace(/[\\/:*?"<>|]/g, '_');
  const renamedUri = `${FileSystem.cacheDirectory}upload-${Date.now()}-${safeName}`;
  let uploadUri = file.uri;
  try {
    await FileSystem.copyAsync({ from: file.uri, to: renamedUri });
    uploadUri = renamedUri;
  } catch {
    // Falls through to the original uri - still uploads, just under
    // whatever name the local cache file already happened to have.
  }

  let result: Awaited<ReturnType<typeof FileSystem.uploadAsync>>;
  try {
    // uploadAsync has no cancellation/signal option, so a genuinely stuck
    // upload would otherwise hang the caller forever - racing it against a
    // plain timer can't cancel the native task, but at least lets the UI
    // recover with an error instead of hanging indefinitely.
    result = await Promise.race([
      FileSystem.uploadAsync(uploadUrl, uploadUri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName,
        mimeType: file.type,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('upload-timeout')), timeoutMs)),
    ]);
  } catch (error) {
    const timedOut = error instanceof Error && error.message === 'upload-timeout';
    throw new ApiError(
      timedOut ? 'Upload timed out - check your connection and try again.' : 'Could not reach the server. Check your connection.',
      0,
    );
  } finally {
    if (uploadUri !== file.uri) FileSystem.deleteAsync(uploadUri, { idempotent: true }).catch(() => {});
  }

  let data: unknown = null;
  try {
    data = JSON.parse(result.body);
  } catch {
    // Handled by the !data check below.
  }
  const parsed = data as { success?: boolean; error?: string } | null;
  if (result.status < 200 || result.status >= 300 || !parsed || parsed.success === false) {
    throw new ApiError((parsed && parsed.error) || `Upload failed (${result.status}).`, result.status);
  }
  return data as T;
}
