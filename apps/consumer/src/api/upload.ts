import * as SecureStore from 'expo-secure-store'
import * as ImageManipulator from 'expo-image-manipulator'
import * as FileSystem from 'expo-file-system/legacy'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000/api'

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf', heic: 'image/jpeg',
}

/**
 * POST multipart para um endpoint de upload e devolve o body já parseado.
 *
 * Usa o uploader NATIVO do expo-file-system (`uploadAsync` / MULTIPART) em vez de
 * `fetch`+FormData. Motivo: no Android REAL (especialmente com a nova arquitetura)
 * o upload por fetch+FormData falha/“não faz nada” (funciona só no emulador). O
 * uploadAsync monta o multipart no lado nativo a partir do arquivo local e é
 * confiável no device.
 */
async function postMultipart(
  endpoint: string,
  uri: string,
  opts?: { name?: string; type?: string },
): Promise<any> {
  const guessedName = uri.split('/').pop() ?? 'upload.jpg'
  const name = opts?.name ?? guessedName
  const ext = (name.split('.').pop() ?? 'jpg').toLowerCase()
  const type = opts?.type ?? MIME_BY_EXT[ext] ?? 'image/jpeg'

  const token = await SecureStore.getItemAsync('access_token')

  const res = await FileSystem.uploadAsync(`${API_URL}${endpoint}`, uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType: type,
    parameters: { filename: name },
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (res.status < 200 || res.status >= 300) {
    let msg = `Falha no upload (HTTP ${res.status}).`
    try {
      const j = JSON.parse(res.body)
      if (j?.message) msg = Array.isArray(j.message) ? j.message.join(', ') : j.message
    } catch {}
    throw new Error(msg)
  }

  return JSON.parse(res.body)
}

/** Upload de arquivo (imagem/PDF) para o bucket PÚBLICO. Retorna a URL pública. */
export async function uploadFile(
  uri: string,
  opts?: { name?: string; type?: string },
): Promise<string> {
  const data = await postMultipart('/uploads/image', uri, opts)
  return data.url as string
}

/**
 * Upload de DOCUMENTO do entregador (CNH/RG/CRLV) para o bucket PRIVADO.
 * Retorna o PATH do arquivo (não uma URL pública) — o admin vê via signed URL.
 * É PII sensível: nunca deve ir pro bucket público de imagens.
 */
export async function uploadDocumentFile(
  uri: string,
  opts?: { name?: string; type?: string },
): Promise<string> {
  const data = await postMultipart('/uploads/document', uri, opts)
  return data.path as string
}

/**
 * Upload de IMAGEM (foto da galeria/câmera): converte pra JPEG ANTES de enviar.
 *
 * Motivo: Android (em especial Samsung) entrega muitas fotos em HEIC/HEIF, que o
 * backend rejeita ("Arquivo inválido: o conteúdo não é uma imagem/PDF reconhecido")
 * — era por isso que "nenhuma foto salvava". Re-encodar pra JPEG resolve qualquer
 * formato de origem e ainda recomprime (upload mais leve).
 *
 * Use SEMPRE que a origem for uma foto. Para PDF/documentos, use uploadFile direto
 * (converter um PDF pra JPEG o corromperia).
 */
export async function uploadImageAsset(
  uri: string,
  opts?: { name?: string },
): Promise<string> {
  const prepared = await prepareJpeg(uri)
  return uploadFile(prepared, { name: opts?.name ?? 'image.jpg', type: 'image/jpeg' })
}

/**
 * Igual a uploadImageAsset, mas para DOCUMENTO (foto de CNH/RG): converte pra JPEG
 * e envia ao bucket PRIVADO. Retorna o PATH. Use quando a origem for uma foto de
 * documento; para PDF use uploadDocumentFile direto.
 */
export async function uploadDocumentImage(
  uri: string,
  opts?: { name?: string },
): Promise<string> {
  const prepared = await prepareJpeg(uri)
  return uploadDocumentFile(prepared, { name: opts?.name ?? 'doc.jpg', type: 'image/jpeg' })
}

/**
 * Redimensiona (máx. 1400px) e re-encoda pra JPEG no aparelho. Resolve DOIS
 * problemas do celular real (que não aparecem no emulador): (1) HEIC do Samsung,
 * que o servidor recusa; (2) fotos de câmera de vários MB que estouram o limite.
 */
async function prepareJpeg(uri: string): Promise<string> {
  try {
    const out = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1400 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
    )
    return out.uri
  } catch (e: any) {
    throw new Error(`Falha ao preparar a foto no aparelho: ${e?.message ?? e ?? 'erro'}`)
  }
}
