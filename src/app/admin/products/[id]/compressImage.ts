/**
 * 上傳前在瀏覽器裡把照片壓成 webp
 *
 * 為什麼在瀏覽器壓，不在伺服器壓：
 * 上傳是 Server Action，正式環境跑在 Cloudflare Workers。
 * Workers 不支援 sharp（原生二進位），wasm 版的影像套件又會吃掉
 * 免費方案每請求 10ms 的 CPU 上限，壓大圖容易超時失敗。
 * 用 Canvas 在店主自己的電腦壓完才送出——不必裝套件、不吃 Workers 額度，
 * 上傳也比較快（見 docs/03-ARCHITECTURE.md 的額度守則）。
 */

/** 長邊上限，超過就等比例縮小（docs/03-ARCHITECTURE.md 指定 1600） */
const MAX_EDGE = 1600
/** webp 品質，0.82 對照片來說肉眼幾乎看不出差別，檔案卻小很多 */
const QUALITY = 0.82

/**
 * 讀成可繪製的點陣圖，拿得到原始尺寸才能算縮放比例。
 *
 * 優先用 createImageBitmap 並指定 imageOrientation: 'from-image'——
 * 手機直拍的照片 EXIF 帶方向資訊（Orientation 6/8），
 * 用 `new Image()` + drawImage 不會套用，壓完照片會躺著。
 * 舊瀏覽器沒有這個 API 或不支援該選項時，退回 Image 的老路子。
 */
async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // 落到下面的退路
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('圖片讀取失敗'))
    }
    img.src = url
  })
}

/**
 * 壓縮單張。
 *
 * 壓不動就回傳原檔——寧可上傳大一點的圖，也不要讓店主傳不上去。
 * 壓完反而變大時也回原檔（本來就小的圖轉 webp 有機會變大）。
 */
export async function compressImage(file: File): Promise<File> {
  try {
    const img = await loadImage(file)

    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
    const w = Math.round(img.width * scale)
    const h = Math.round(img.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, w, h)
    // ImageBitmap 佔的記憶體不等 GC，用完就放掉——一次選十幾張才不會疊爆
    if ('close' in img) img.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', QUALITY),
    )
    if (!blob || blob.size >= file.size) return file

    const name = file.name.replace(/\.[^.]+$/, '') + '.webp'
    return new File([blob], name, { type: 'image/webp' })
  } catch {
    return file
  }
}
