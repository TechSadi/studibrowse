import { Link } from 'react-router';
import { PlaceholderScreen } from '../components/layout/PlaceholderScreen';

export function NotFoundPage() {
  return (
    <PlaceholderScreen title="Page not found">
      <p>That link doesn&apos;t go anywhere. It may have been mistyped, or the page has moved.</p>
      <Link className="text-link" to="/">
        Go to StudiBrowse
      </Link>
    </PlaceholderScreen>
  );
}
