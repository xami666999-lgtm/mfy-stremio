const express = require('express')
const app = express()
const PORT = process.env.PORT || 7000
const TMDB = '15fdef3642df31491f4e1cfc08782dc6'
const IMG = 'https://image.tmdb.org/t/p/w500'

function embeds(type, tmdbId, season, episode) {
  const s = season || 1
  const e = episode || 1
  if (type === 'movie') {
    return [
      { name: 'MFY', title: 'vidsrc.sh', externalUrl: `https://vidsrc.sh/embed/movie/${tmdbId}` },
      { name: 'MFY', title: 'vidsrc2', externalUrl: `https://vidsrc2.ru/embed/movie/${tmdbId}` },
      { name: 'MFY', title: 'vidlink', externalUrl: `https://vidlink.pro/movie/${tmdbId}?autoplay=1` },
      { name: 'MFY', title: 'vidcore', externalUrl: `https://vidcore.org/embed/movie/${tmdbId}` },
    ]
  }
  return [
    { name: 'MFY', title: `S${s}E${e} vidsrc.sh`, externalUrl: `https://vidsrc.sh/embed/tv/${tmdbId}/${s}/${e}` },
    { name: 'MFY', title: `S${s}E${e} vidsrc2`, externalUrl: `https://vidsrc2.ru/embed/tv/${tmdbId}/${s}/${e}` },
    { name: 'MFY', title: `S${s}E${e} vidlink`, externalUrl: `https://vidlink.pro/tv/${tmdbId}/${s}/${e}?autoplay=1` },
    { name: 'MFY', title: `S${s}E${e} vidcore`, externalUrl: `https://vidcore.org/embed/tv/${tmdbId}/${s}/${e}` },
  ]
}

async function tmdb(path, params = {}) {
  const u = new URL('https://api.themoviedb.org/3' + path)
  u.searchParams.set('api_key', TMDB)
  u.searchParams.set('language', 'en-US')
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  const r = await fetch(u)
  if (!r.ok) return {}
  return r.json()
}

function metaPreview(item, type) {
  return {
    id: String(item.id),
    type,
    name: item.title || item.name,
    poster: item.poster_path ? IMG + item.poster_path : undefined,
    background: item.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + item.backdrop_path : undefined,
    description: item.overview,
    releaseInfo: (item.release_date || item.first_air_date || '').slice(0, 4),
    imdbRating: item.vote_average ? String(item.vote_average.toFixed(1)) : undefined,
  }
}

const manifest = {
  id: 'com.mfy.stremio',
  version: '1.0.0',
  name: 'MFY',
  description: 'MFY catalogs and players inside Stremio.',
  logo: 'https://xami666999-lgtm.github.io/mfy/icons/mfy-512.png',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    { type: 'movie', id: 'trending', name: 'MFY Trending Movies', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
    { type: 'movie', id: 'popular', name: 'MFY Popular Movies', extra: [{ name: 'skip', isRequired: false }] },
    { type: 'series', id: 'trending', name: 'MFY Trending Shows', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
    { type: 'series', id: 'popular', name: 'MFY Popular Shows', extra: [{ name: 'skip', isRequired: false }] },
    { type: 'series', id: 'anime', name: 'MFY Anime', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
  ],
  idPrefixes: [''],
  behaviorHints: { configurable: false, configurationRequired: false },
}

app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*')
  next()
})

app.get('/manifest.json', (_req, res) => res.json(manifest))

app.get('/catalog/:type/:id/:extra?.json', async (req, res) => {
  try {
    const { type, id } = req.params
    const extra = Object.fromEntries(new URLSearchParams((req.params.extra || '').replace(/\.json$/, '')))
    const skip = Number(extra.skip || 0)
    const page = Math.floor(skip / 20) + 1
    let data
    if (extra.search) {
      data = await tmdb(type === 'movie' ? '/search/movie' : '/search/tv', { query: extra.search, page })
    } else if (id === 'anime') {
      data = await tmdb('/discover/tv', { with_genres: '16', with_original_language: 'ja', sort_by: 'popularity.desc', page })
    } else if (id === 'popular') {
      data = await tmdb(type === 'movie' ? '/movie/popular' : '/tv/popular', { page })
    } else {
      data = await tmdb(`/trending/${type === 'movie' ? 'movie' : 'tv'}/week`, { page })
    }
    res.json({ metas: (data.results || []).map((item) => metaPreview(item, type)) })
  } catch {
    res.json({ metas: [] })
  }
})

app.get('/meta/:type/:id.json', async (req, res) => {
  try {
    const { type, id } = req.params
    const detail = await tmdb(type === 'movie' ? `/movie/${id}` : `/tv/${id}`, { append_to_response: 'videos,credits' })
    const videos = type === 'movie'
      ? [{ id: String(id), title: detail.title, released: detail.release_date }]
      : (detail.seasons || []).filter((s) => s.season_number > 0).flatMap((s) =>
          Array.from({ length: s.episode_count || 0 }, (_, i) => ({
            id: `${id}:${s.season_number}:${i + 1}`,
            title: `Episode ${i + 1}`,
            season: s.season_number,
            episode: i + 1,
            released: s.air_date,
          }))
        )
    res.json({
      meta: {
        id: String(id),
        type,
        name: detail.title || detail.name,
        poster: detail.poster_path ? IMG + detail.poster_path : undefined,
        background: detail.backdrop_path ? 'https://image.tmdb.org/t/p/original' + detail.backdrop_path : undefined,
        description: detail.overview,
        releaseInfo: (detail.release_date || detail.first_air_date || '').slice(0, 4),
        genres: (detail.genres || []).map((g) => g.name),
        cast: (detail.credits?.cast || []).slice(0, 8).map((c) => c.name),
        videos,
      },
    })
  } catch {
    res.json({ meta: { id: req.params.id, type: req.params.type, name: 'MFY' } })
  }
})

app.get('/stream/:type/:id.json', (req, res) => {
  const { type, id } = req.params
  const parts = String(id).split(':')
  const tmdbId = parts[0]
  const season = Number(parts[1] || 1)
  const episode = Number(parts[2] || 1)
  res.json({ streams: embeds(type === 'series' ? 'tv' : 'movie', tmdbId, season, episode) })
})

app.get('/', (_req, res) => res.redirect('/manifest.json'))
app.listen(PORT, () => console.log('MFY addon on', PORT))
