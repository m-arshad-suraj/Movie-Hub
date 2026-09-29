import MovieLibrary from './MovieLibrary.jsx';

export const dynamic = 'force-dynamic';

export default function Home() {
  return <MovieLibrary
    defaultCount={process.env.DEFAULT_TOPIC_COUNT || ''}
    workerCount={process.env.MOVIE_WORKER_COUNT || ''}
  />;
}
