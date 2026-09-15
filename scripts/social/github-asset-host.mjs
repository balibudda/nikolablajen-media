// Ephemeral public file hosting via GitHub Releases — a drop-in
// replacement for Vercel Blob's `put()` when all a caller needs is "give
// me a plain public URL a third-party API (Meta Graph API for
// Instagram/Facebook/Threads, etc.) can fetch this file from."
//
// Added 2026-09-08 after Vercel Blob's whole-team free "Advanced
// Operations" quota (2000/month, shared across every Blob store in the
// team) got exhausted and the store was suspended until the next billing
// cycle — see CLAUDE.md's "Vercel Blob quota exhausted" incident writeup.
// Nick's call: move file-hosting load off Vercel onto GitHub wherever it
// can go, rather than pay for Pro right now.
//
// Hosted in a small dedicated PUBLIC repo, balibudda/nikolablajen-assets
// — kept separate from this (private) app repo on purpose, so nothing
// code/secret-related is ever exposed; that repo holds no source, just
// binaries attached to one rolling GitHub Release ("social-temp").
import { readFile } from 'node:fs/promises'

const REPO = 'balibudda/nikolablajen-assets'
const TAG = 'social-temp'
const API = 'https://api.github.com'

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
}

function getToken() {
  const token = process.env.GH_ASSETS_TOKEN || process.env.GH_SECRETS_PAT
  if (!token) throw new Error('no GitHub token available for asset upload (GH_ASSETS_TOKEN)')
  return token
}

async function getOrCreateRelease(token) {
  let res = await fetch(`${API}/repos/${REPO}/releases/tags/${TAG}`, { headers: authHeaders(token) })
  if (res.ok) return res.json()
  res = await fetch(`${API}/repos/${REPO}/releases`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag_name: TAG,
      name: 'Temporary social media assets',
      body: 'Ephemeral files used to hand a public URL to a platform API (Meta, etc.) during posting. Each upload is deleted right after use — anything lingering here is a leftover from a failed cleanup, safe to delete by hand.',
      prerelease: true,
    }),
  })
  if (!res.ok) throw new Error(`could not create release: ${res.status} ${await res.text()}`)
  return res.json()
}

// buf: a Buffer (already in memory — most callers here build the media
// buffer in-process anyway, no need to round-trip through a temp file).
// name: a unique filename (caller picks — e.g. `${Date.now()}-${slug}.mp4`;
// must be unique so concurrent/re-runs never collide with a not-yet-deleted
// previous asset).
export async function uploadTempAsset(buf, name, contentType = 'application/octet-stream') {
  const token = getToken()
  const release = await getOrCreateRelease(token)
  const res = await fetch(
    `https://uploads.github.com/repos/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
    { method: 'POST', headers: { ...authHeaders(token), 'Content-Type': contentType }, body: buf }
  )
  if (!res.ok) throw new Error(`asset upload failed: ${res.status} ${await res.text()}`)
  const asset = await res.json()
  return { url: `https://github.com/${REPO}/releases/download/${TAG}/${name}`, assetId: asset.id }
}

// Convenience wrapper for callers that only have a file on disk.
export async function uploadTempAssetFile(filePath, name, contentType) {
  return uploadTempAsset(await readFile(filePath), name, contentType)
}

export async function deleteTempAsset(assetId) {
  if (!assetId) return
  try {
    const token = getToken()
    await fetch(`${API}/repos/${REPO}/releases/assets/${assetId}`, { method: 'DELETE', headers: authHeaders(token) })
  } catch (e) {
    console.warn(`deleteTempAsset(${assetId}) failed:`, e.message)
  }
}
