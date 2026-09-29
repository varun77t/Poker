import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import styles from './App.module.css';
import { ConnectionOverlay } from './components/ConnectionOverlay';
import { devPlayerSlot } from './lib/storage';
import { CreateRoom } from './pages/CreateRoom';
import { Landing } from './pages/Landing';
import { NotFound } from './pages/NotFound';
import { RoomPage } from './pages/Room';

// Development-only sample table (design review, screenshots). Compiled out of production builds.
const DevTable = import.meta.env.DEV ? lazy(() => import('./pages/DevTable')) : null;

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/create" element={<CreateRoom />} />
        <Route path="/room/:code" element={<RoomPage />} />
        {DevTable && (
          <Route
            path="/dev/table"
            element={
              <Suspense>
                <DevTable />
              </Suspense>
            }
          />
        )}
        <Route path="*" element={<NotFound />} />
      </Routes>
      <ConnectionOverlay />
      {devPlayerSlot && <div className={styles.devSlot}>dev player {devPlayerSlot}</div>}
    </BrowserRouter>
  );
}
