import { DEFAULT_ROOM_SETTINGS, type RoomSettings } from '@poker/shared';
import { Link, Navigate, useNavigate } from 'react-router';
import { Brand, Card, Page } from '../components/Layout';
import { SettingsForm } from '../components/SettingsForm';
import { request } from '../socket/connection';
import { useAppState } from '../state/store';
import styles from './CreateRoom.module.css';

export function CreateRoom() {
  const session = useAppState((s) => s.session);
  if (!session) return <Navigate to="/" replace />;
  return <CreateRoomForm />;
}

function CreateRoomForm() {
  const navigate = useNavigate();
  const connected = useAppState((s) => s.connection === 'connected');

  async function create(settings: RoomSettings): Promise<string | null> {
    const res = await request('room:create', { settings });
    if (!res.ok) return res.message;
    navigate(`/room/${res.data.code}`, { replace: true });
    return null;
  }

  return (
    <Page>
      <Brand />
      <Card>
        <div>
          <h1 className={styles.heading}>New room</h1>
          <p className={styles.sub}>You can change these in the lobby until the game starts.</p>
        </div>

        <SettingsForm
          initial={DEFAULT_ROOM_SETTINGS}
          submitLabel={connected ? 'Create room' : 'Connecting…'}
          submitDisabled={!connected}
          onSubmit={create}
          footer={
            <Link to="/" className={styles.back}>
              Back
            </Link>
          }
        />
      </Card>
    </Page>
  );
}
