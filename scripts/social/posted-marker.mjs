// Idempotency for the daily pipeline: a tiny marker per (date, locale,
// channel) so a re-run — a delayed GitHub cron, a manual re-trigger, two
// overlapping runs — never posts the same card twice.
//
//   const tag = `${dateKey}-${locale}-instagram`
//   if (!process.argv.includes('--force') && await wasPosted(tag)) { …skip… }
//   …post…
//   await markPosted(tag)
//
// Moved OFF Vercel Blob 2026-09-08 — this was the actual root cause of
// Vercel Blob's whole-team free "Advanced Operations" quota (2000/month)
// getting exhausted: every single wasPosted() call did one Blob `list()`,
// and with ~9 channel-poster scripts × ~15 daily/weekly formats, that adds
// up fast. Now backed by the GitHub Contents API on the small dedicated
// public repo `balibudda/nikolablajen-assets` (see github-asset-host.mjs's
// header comment for why a separate repo) — a plain file per tag under
// `markers/`, checked/written via GET/PUT/DELETE. GitHub's API rate limit
// (5000/hr per token) has enormous headroom for this volume, and it's a
// completely separate quota from anything Vercel-side.
//
// `claimSlot`'s atomicity (used by promo-post.mjs to stop a same-second
// concurrent run from double-posting) carries over exactly: the Contents
// API's PUT rejects with 422 if the file already exists and no `sha` is
// given — the same "fails fast if someone else already claimed it"
// guarantee Blob's `allowOverwrite:false` gave us.
const REPO = 'balibudda/nikolablajen-assets'
const API = 'https://api.github.com'

function authHeaders() {
  const token = process.env.GH_ASSETS_TOKEN || process.env.GH_SECRETS_PAT
  if (!token) return null
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
}

function markerPath(tag) {
  return `markers/${encodeURIComponent(tag)}.txt`
}

export async function wasPosted(tag) {
  const headers = authHeaders()
  if (!headers) return false
  try {
    const res = await fetch(`${API}/repos/${REPO}/contents/${markerPath(tag)}`, { headers })
    return res.status === 200
  } catch {
    return false
  }
}

// Retries once on a 409 before giving up — same reasoning as claimSlot's
// own retry below. Real incident, 2026-09-08: EN Instagram's card-of-day
// published successfully, then markPosted() hit a 409 (the Contents API's
// single-branch-HEAD race, other channel markers landing at nearly the
// same second) and gave up with just a console.warn — no marker was ever
// written. The next (delayed) scheduled run saw no marker, assumed it
// hadn't posted, and published the SAME card to Instagram a second time —
// a real live duplicate Reel, ~20h apart. A retry here would have caught
// it (a false 409 from the HEAD race almost always clears on retry; if it
// were a genuine double-write the retry would just 409 again and still
// warn, no worse than before).
export async function markPosted(tag, attempt = 0) {
  const headers = authHeaders()
  if (!headers) return
  try {
    const content = Buffer.from(new Date().toISOString()).toString('base64')
    const res = await fetch(`${API}/repos/${REPO}/contents/${markerPath(tag)}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `mark posted: ${tag}`, content }),
    })
    if (res.status === 409 && attempt < 1) {
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 800))
      return markPosted(tag, attempt + 1)
    }
    if (!res.ok && res.status !== 422) console.warn(`markPosted(${tag}) failed: ${res.status} ${await res.text()}`)
  } catch (e) {
    console.warn(`markPosted(${tag}) failed:`, e.message)
  }
}

// Atomic pre-claim for expensive/one-shot pipelines (the daily promo post
// specifically — see the original 2026-09-05 TOCTOU-race note this
// mechanism was built for). Returns true if this run won the claim.
export async function claimSlot(tag, attempt = 0) {
  const headers = authHeaders()
  if (!headers) return true // nothing to coordinate through — don't block
  try {
    const content = Buffer.from(new Date().toISOString()).toString('base64')
    const res = await fetch(`${API}/repos/${REPO}/contents/${markerPath(tag)}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `claim slot: ${tag}`, content }),
    })
    if (res.status === 201) return true
    // A 409 here isn't necessarily "someone else already claimed THIS tag" —
    // the Contents API commits to the whole repo's single branch HEAD, so
    // two unrelated tags (e.g. razbor's and sovet's own claimSlot calls)
    // written in the same second can conflict with each other purely from
    // the ref moving between read and write, even though neither path
    // pre-existed. Found live 2026-09-08 when 3 promo workflows were
    // dispatched together: sovet's claim 409'd, got treated as "lost the
    // race", and skipped a genuinely free entry for nothing. One retry
    // after a short jitter is enough — a real double-claim will still
    // 409 on the retry (the file actually exists by then), a false one
    // from a HEAD race almost always clears immediately.
    if (res.status === 409 && attempt < 1) {
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 800))
      return claimSlot(tag, attempt + 1)
    }
    console.log(`claimSlot(${tag}): could not claim (status ${res.status}) — assuming another run already has it`)
    return false
  } catch (e) {
    console.log(`claimSlot(${tag}): could not claim (${e.message}) — assuming another run already has it`)
    return false
  }
}

export async function releaseSlot(tag) {
  const headers = authHeaders()
  if (!headers) return
  try {
    const getRes = await fetch(`${API}/repos/${REPO}/contents/${markerPath(tag)}`, { headers })
    if (getRes.status !== 200) return
    const { sha } = await getRes.json()
    await fetch(`${API}/repos/${REPO}/contents/${markerPath(tag)}`, {
      method: 'DELETE',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `release slot: ${tag}`, sha }),
    })
  } catch (e) {
    console.warn(`releaseSlot(${tag}) failed:`, e.message)
  }
}
