/**
 * Shown while a page's code downloads on first load. Pages render their own skeletons once they mount,
 * so this stays a quiet blank screen with a status for screen readers.
 */
export function RouteFallback() {
  return (
    <div role="status" className="sr-only">
      Loading…
    </div>
  );
}
