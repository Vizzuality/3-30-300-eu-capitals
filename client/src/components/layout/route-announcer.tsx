/**
 * Tells screen readers which page has opened after the visitor moves to
 * another one, since moving between pages does not reload the document. It
 * is empty when the site loads: screen readers read the page's title then.
 */
export function RouteAnnouncer({ message }: { message: string }) {
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  )
}
