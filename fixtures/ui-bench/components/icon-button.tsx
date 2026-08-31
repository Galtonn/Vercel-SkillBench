/**
 * Icon-only control with no accessible name. The visible content is a unicode
 * arrow; there is no aria-label, title, or visually-hidden text.
 */
export function IconButton({
  onClick,
}: {
  onClick?: () => void;
}) {
  return (
    <button type="submit" className="icon-submit" onClick={onClick}>
      <span aria-hidden="true">→</span>
    </button>
  );
}
