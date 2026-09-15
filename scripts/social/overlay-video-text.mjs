// Burn a title + subtitle + watermark onto an existing video, keeping its
// own audio untouched — for one-off custom posts built from a video Nick
// supplies himself (as opposed to generate-clip.mjs, which renders from an
// app screenshot/deck cover with TTS narration).
//
//   node scripts/social/overlay-video-text.mjs --in=<file> --title=<text> --sub=<text> --out=<file>
import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FONT_DIR = path.join(__dirname, 'fonts')
const BOLD = path.join(FONT_DIR, 'PTSerif-Bold.ttf')
const REGULAR = path.join(FONT_DIR, 'PTSerif-Regular.ttf')
const WATERMARK = 'nikolablajen.ru'

async function probeSize(f) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=s=x:p=0', f])
  const [w, h] = stdout.trim().split('x').map(Number)
  return { w, h }
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split(/=(.*)/s)
    return [k, v ?? true]
  }))
  const { in: inFile, title, sub, out } = args
  if (!inFile || !title || !out) {
    console.error('usage: node scripts/social/overlay-video-text.mjs --in=<file> --title=<text> --sub=<text> --out=<file>')
    process.exit(1)
  }

  const { w } = await probeSize(inFile)
  const titleSize = Math.round(w * 0.058)
  const subSize = Math.round(w * 0.033)
  const wmSize = Math.round(w * 0.028)
  const bandH = Math.round(w * 0.26)

  const titleFile = `${out}.title.txt`
  await writeFile(titleFile, String(title), 'utf8')
  const filters = [
    `drawbox=x=0:y=0:w=${w}:h=${bandH}:color=black@0.45:t=fill`,
    `drawtext=fontfile=${BOLD}:textfile=${titleFile}:fontcolor=0xE8D5A8:fontsize=${titleSize}:x=(w-text_w)/2:y=${Math.round(bandH * 0.26)}:box=0`,
  ]
  if (sub) {
    const subFile = `${out}.sub.txt`
    await writeFile(subFile, String(sub), 'utf8')
    filters.push(`drawtext=fontfile=${REGULAR}:textfile=${subFile}:fontcolor=0xEDE5D4:fontsize=${subSize}:x=(w-text_w)/2:y=${Math.round(bandH * 0.6)}:box=0`)
  }
  filters.push(`drawtext=fontfile=${REGULAR}:text='${WATERMARK}':fontcolor=0x8A806E:fontsize=${wmSize}:x=(w-text_w)/2:y=h-${Math.round(wmSize * 2.2)}:box=0`)

  await run('ffmpeg', ['-y', '-i', inFile, '-vf', filters.join(','), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'copy', out])
  console.log(`✓ ${out}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
