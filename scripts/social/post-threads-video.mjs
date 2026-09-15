// Generic one-off Threads video poster — used to repost something after
// deleting a broken post (Threads has no edit API, only delete). Not part
// of any daily pipeline; those go through broadcast.mjs's postThreads().
//
//   node scripts/social/post-threads-video.mjs <video-file> <caption-file>
import { readFile } from 'node:fs/promises'
import { uploadTempAsset, deleteTempAsset } from './github-asset-host.mjs'

const API = 'https://graph.threads.net/v1.0'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const [videoPath, captionPath] = process.argv.slice(2)
  if (!videoPath || !captionPath) {
    console.error('usage: node scripts/social/post-threads-video.mjs <video-file> <caption-file>')
    process.exit(1)
  }
  const token = process.env.THREADS_ACCESS_TOKEN
  const userId = process.env.THREADS_USER_ID
  if (!token || !userId) throw new Error('THREADS_ACCESS_TOKEN / THREADS_USER_ID not set')
  if (!process.env.GH_ASSETS_TOKEN) throw new Error('GH_ASSETS_TOKEN not set')

  const [videoBuf, text] = await Promise.all([readFile(videoPath), readFile(captionPath, 'utf8')])

  console.log('Uploading video to GitHub (temp asset)…')
  const { url: videoUrl, assetId } = await uploadTempAsset(videoBuf, `threads-repost-${Date.now()}.mp4`, 'video/mp4')

  try {
    console.log('Creating Threads container…')
    const cRes = await fetch(`${API}/${userId}/threads`, {
      method: 'POST',
      body: new URLSearchParams({ media_type: 'VIDEO', video_url: videoUrl, text: text.trim(), access_token: token }),
    })
    const container = await cRes.json()
    if (!container.id) throw new Error(`Threads container failed: ${JSON.stringify(container)}`)

    let status = 'IN_PROGRESS'
    for (let i = 0; i < 25 && status === 'IN_PROGRESS'; i++) {
      await sleep(12000)
      const chk = await (await fetch(`${API}/${container.id}?fields=status,error_message&access_token=${token}`)).json()
      status = chk.status
      console.log(`  status: ${status} (attempt ${i + 1})`)
      if (status === 'ERROR') throw new Error(`Threads processing error: ${JSON.stringify(chk)}`)
    }
    if (status !== 'FINISHED') throw new Error(`Threads container never finished (last: ${status})`)

    console.log('Publishing…')
    const pRes = await fetch(`${API}/${userId}/threads_publish`, {
      method: 'POST',
      body: new URLSearchParams({ creation_id: container.id, access_token: token }),
    })
    const pub = await pRes.json()
    if (!pub.id) throw new Error(`Threads publish failed: ${JSON.stringify(pub)}`)
    console.log(`✓ posted threads media ${pub.id}`)
  } finally {
    await deleteTempAsset(assetId)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
