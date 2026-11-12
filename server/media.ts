/** Mídia da mesa (imagens agora, áudio depois): arquivos guardados por hash do conteúdo. */

export type MediaKind = "image" | "audio";

export interface MediaInfo {
  id: string;
  kind: MediaKind;
  mime: string;
  size: number;
  /** Nome do arquivo como enviado, para o anfitrião reconhecer. */
  name: string;
}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
export const MAX_ROOM_MEDIA_BYTES = 200 * 1024 * 1024;

export class MediaError extends Error {}

/** Descobre o tipo pelos primeiros bytes; a extensão e o cabeçalho do pedido não valem nada. */
export function sniffMedia(bytes: Uint8Array): { kind: MediaKind; mime: string } | null {
  const at = (i: number, ...values: number[]) => values.every((v, k) => bytes[i + k] === v);
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return { kind: "image", mime: "image/png" };
  if (at(0, 0xff, 0xd8, 0xff)) return { kind: "image", mime: "image/jpeg" };
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { kind: "image", mime: "image/webp" };
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x41, 0x56, 0x45)) return { kind: "audio", mime: "audio/wav" };
  if (at(0, 0x4f, 0x67, 0x67, 0x53)) return { kind: "audio", mime: "audio/ogg" };
  if (at(0, 0x49, 0x44, 0x33) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) {
    return { kind: "audio", mime: "audio/mpeg" };
  }
  return null;
}

export async function hashBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Onde os bytes ficam. Em disco no servidor de verdade, em memória nos testes. */
export interface MediaStore {
  put(roomId: string, id: string, bytes: Uint8Array): Promise<void>;
  get(roomId: string, id: string): Promise<Uint8Array | null>;
}

export function memoryMediaStore(): MediaStore {
  const files = new Map<string, Uint8Array>();
  return {
    put: (roomId, id, bytes) => {
      files.set(`${roomId}/${id}`, bytes);
      return Promise.resolve();
    },
    get: (roomId, id) => Promise.resolve(files.get(`${roomId}/${id}`) ?? null),
  };
}

export function diskMediaStore(dir: string): MediaStore {
  return {
    async put(roomId, id, bytes) {
      await Deno.mkdir(`${dir}/${roomId}`, { recursive: true });
      await Deno.writeFile(`${dir}/${roomId}/${id}`, bytes);
    },
    async get(roomId, id) {
      try {
        return await Deno.readFile(`${dir}/${roomId}/${id}`);
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) return null;
        throw error;
      }
    },
  };
}

/** Confere tipo e tamanhos; devolve a descrição do arquivo ou lança MediaError. */
export async function describeUpload(
  existing: readonly MediaInfo[],
  bytes: Uint8Array,
  filename: string,
): Promise<MediaInfo> {
  const found = sniffMedia(bytes);
  if (!found) throw new MediaError("Formato não aceito. Use PNG, JPEG ou WebP para imagens; OGG, MP3 ou WAV para áudio.");
  const limit = found.kind === "image" ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
  if (bytes.length > limit) {
    throw new MediaError(`Arquivo grande demais: o limite para ${found.kind === "image" ? "imagens" : "áudio"} é ${limit / 1024 / 1024} megabytes.`);
  }
  const id = await hashBytes(bytes);
  if (existing.some((m) => m.id === id)) return existing.find((m) => m.id === id)!;
  const total = existing.reduce((sum, m) => sum + m.size, 0);
  if (total + bytes.length > MAX_ROOM_MEDIA_BYTES) {
    throw new MediaError(`A mesa chegou ao limite de ${MAX_ROOM_MEDIA_BYTES / 1024 / 1024} megabytes de mídia.`);
  }
  const name = filename.replace(/[\\/]/g, "").trim().slice(0, 120) || "arquivo";
  return { id, kind: found.kind, mime: found.mime, size: bytes.length, name };
}
