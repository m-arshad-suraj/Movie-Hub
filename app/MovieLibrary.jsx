'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export default function MovieLibrary({ defaultCount, workerCount: workerCountValue }) {
  const [movies, setMovies] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [alertVisible, setAlertVisible] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState(null);
  const [resolvingDownloads, setResolvingDownloads] = useState({});
  const [resolvedDownloads, setResolvedDownloads] = useState({});
  const scanStarted = useRef(false);
  const visibleMovies = useMemo(() => movies.filter(movie => (movie.title || '').toLowerCase().includes(query.trim().toLowerCase())), [movies, query]);
  const favoriteMovies = useMemo(() => visibleMovies.filter(movie => favoriteIds.includes(movie.topicId)), [visibleMovies, favoriteIds]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('movie-hub-favorites') || '[]');
      if (Array.isArray(saved)) setFavoriteIds(saved.filter(id => Number.isSafeInteger(id)));
    } catch { /* Ignore malformed stored favorites. */ }
  }, []);

  function toggleFavorite(event, movie) {
    event.stopPropagation();
    setFavoriteIds(current => {
      const next = current.includes(movie.topicId)
        ? current.filter(id => id !== movie.topicId)
        : [...current, movie.topicId];
      try { window.localStorage.setItem('movie-hub-favorites', JSON.stringify(next)); } catch { /* Favorites still work for this session. */ }
      return next;
    });
  }

  function renderMovie(movie) {
    const isFavorite = favoriteIds.includes(movie.topicId);
    return <article className="movie-card" key={movie.topicId} onClick={() => setSelected(movie)} tabIndex={0} role="button" aria-label={`View ${movie.title || 'movie'}`} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) setSelected(movie); }}>
      {movie.imageUrl ? <img src={movie.imageUrl} alt={movie.title || 'Movie poster'} loading="lazy" onError={event => event.currentTarget.remove()} /> : <div className="movie-placeholder">No Image</div>}
      <button className={`favorite-btn${isFavorite ? ' active' : ''}`} onClick={event => toggleFavorite(event, movie)} aria-label={isFavorite ? `Remove ${movie.title || 'movie'} from favorites` : `Add ${movie.title || 'movie'} to favorites`} aria-pressed={isFavorite} type="button">{isFavorite ? '♥' : '♡'}</button>
      <div className="movie-info"><div className="movie-title">{movie.title || `Movie ${movie.topicId}`}</div></div>
    </article>;
  }

  function notify(message, isError = false) {
    setStatus(message);
    setError(isError);
    setAlertVisible(true);
    window.clearTimeout(notify.timeout);
    notify.timeout = window.setTimeout(() => setAlertVisible(false), 5000);
  }

  async function openDirectDownload(event, directLink) {
    const anchor = event.currentTarget;
    if (anchor.dataset.resolved === 'true') return;
    event.preventDefault();
    if (resolvingDownloads[directLink]) return;
    setResolvingDownloads(current => ({ ...current, [directLink]: true }));
    notify('Preparing direct download...');
    try {
      const response = await fetch('/api/direct-download', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: directLink }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Could not resolve download (${response.status}).`);
      setResolvedDownloads(current => ({ ...current, [directLink]: payload.url }));
      anchor.href = payload.url;
      anchor.dataset.resolved = 'true';
      anchor.click();
    } catch (cause) {
      notify(cause.message || 'Could not prepare the direct download.', true);
    } finally {
      setResolvingDownloads(current => {
        const next = { ...current };
        delete next[directLink];
        return next;
      });
    }
  }

  async function scan() {
    if (busy) return;
    setBusy(true);
    setMovies([]);
    setError(false);
    notify('Loading movies...');
    try {
      if (!workerCountValue || !/^\d+$/.test(workerCountValue) || !Number.isSafeInteger(Number(workerCountValue)) || Number(workerCountValue) <= 0) {
        throw new Error('Set MOVIE_WORKER_COUNT to a positive integer in the environment.');
      }
      const configuredWorkerCount = Number(workerCountValue);

      const topicsResponse = await fetch('/api/topics', { cache: 'no-store' });
      const topicsPayload = await topicsResponse.json();
      if (!topicsResponse.ok) throw new Error(topicsPayload.error || `Topic scrape failed (${topicsResponse.status}).`);
      if (!Array.isArray(topicsPayload)) throw new Error('The topics route returned an unexpected response.');

      const params = new URLSearchParams(window.location.search);
      const hasQueryCount = params.has('count');
      const countValue = hasQueryCount ? params.get('count') : defaultCount;
      if (!countValue || !/^\d+$/.test(countValue) || !Number.isSafeInteger(Number(countValue)) || Number(countValue) <= 0) {
        throw new Error(hasQueryCount
          ? 'The count query parameter must be a positive integer.'
          : 'Set DEFAULT_TOPIC_COUNT or provide a positive ?count= value in the URL.');
      }

      const selectedTopics = topicsPayload.slice(0, Number(countValue));
      if (selectedTopics.length === 0) {
        notify('No movie topics were found on the source website.');
        return;
      }

      let nextIndex = 0;
      let loadedCount = 0;
      const workerCount = Math.min(configuredWorkerCount, selectedTopics.length);
      async function loadNextTopic() {
        while (nextIndex < selectedTopics.length) {
          const topic = selectedTopics[nextIndex++];
          try {
            const movieResponse = await fetch('/api/movie', {
              method: 'POST',
              cache: 'no-store',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ topic }),
            });
            const moviePayload = await movieResponse.json();
            if (!movieResponse.ok) {
              if (movieResponse.status !== 404) console.warn(`Topic ${topic} scrape failed:`, moviePayload.error);
              continue;
            }
            if (!moviePayload || typeof moviePayload !== 'object' || !Number.isSafeInteger(moviePayload.topicId)) {
              console.warn(`Topic ${topic} returned an invalid movie object.`);
              continue;
            }
            loadedCount += 1;
            setMovies(current => [...current, moviePayload]);
          } catch (topicError) {
            console.warn(`Topic ${topic} could not be loaded:`, topicError);
          }
        }
      }
      await Promise.all(Array.from({ length: workerCount }, () => loadNextTopic()));
      notify(`Loaded ${loadedCount} movies`);
    } catch (cause) {
      notify(cause.message || 'Could not scrape the source website.', true);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!scanStarted.current) {
      scanStarted.current = true;
      scan();
    }
  }, []);

  return <>
    <header>
      <div className="logo">Movie Hub</div>
      <div className="search-container">
        <div className="search-box">
          <input id="searchInput" value={query} onChange={event => setQuery(event.target.value)} type="search" placeholder="Search movies..." aria-label="Search movies" />
        </div>
      </div>
    </header>

    <div className={`alert-box${alertVisible ? ' show' : ''}${error ? ' error' : ''}`} role="status" aria-live="polite">
      <span>{status}</span>
    </div>

    {favoriteMovies.length > 0 && <section className="library-section" aria-labelledby="favorites-heading">
      <h2 id="favorites-heading" className="section-title">Favorites</h2>
      <main className="movie-grid" aria-label="Favorite movies">{favoriteMovies.map(renderMovie)}</main>
    </section>}
    <section className="library-section" aria-label="All movies">
      {favoriteMovies.length > 0 && <h2 className="section-title">All movies</h2>}
      <main id="movieContainer" className="movie-grid">
        {visibleMovies.map(renderMovie)}
        {visibleMovies.length === 0 && <div className="empty-library">{busy ? 'Loading movies...' : movies.length ? 'No movies match your search.' : 'No movies loaded.'}</div>}
      </main>
    </section>

    {selected && <div className="modal show" role="presentation" onClick={() => setSelected(null)}>
      <div className="modal-content" role="dialog" aria-modal="true" aria-label={selected.title || 'Movie details'} onClick={event => event.stopPropagation()}>
        <button className="close-btn" onClick={() => setSelected(null)} aria-label="Close">&times;</button>
        <div className="modal-body">
          <div className="modal-image">{selected.imageUrl && <img src={selected.imageUrl} alt={selected.title || 'Movie poster'} />}</div>
          <div className="modal-details">
            <h2 id="modalTitle">{selected.title || 'Movie Title'}</h2>
            <div id="modalDownloads">
              {(selected.downloads || []).map((download, index) => <div className="download-group" key={`${download.label}-${index}`}>
                <span className="download-label">{download.label || 'Download'}</span>
                {download.magnet && <a className="btn-download btn-magnet" href={download.magnet}>Magnet</a>}
                {download.torrent && <a className="btn-download btn-torrent" href={download.torrent} target="_blank" rel="noreferrer">Torrent</a>}
                {download.directLink && <a className="btn-download btn-direct" href={resolvedDownloads[download.directLink] || download.directLink} onClick={event => openDirectDownload(event, download.directLink)} aria-disabled={Boolean(resolvingDownloads[download.directLink])}>{resolvingDownloads[download.directLink] ? 'Preparing…' : 'Direct Download'}</a>}
              </div>)}
            </div>
          </div>
        </div>
      </div>
    </div>}
  </>;
}
