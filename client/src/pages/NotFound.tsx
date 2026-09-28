import { Link } from 'react-router';
import { Brand, Card, Page } from '../components/Layout';

export function NotFound() {
  return (
    <Page>
      <Brand />
      <Card>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Page not found</h1>
        <Link to="/">Back to start</Link>
      </Card>
    </Page>
  );
}
