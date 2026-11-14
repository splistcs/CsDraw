/** Painel lateral deslizante que flutua sobre a tela (nao empurra o conteudo). */
export function SideDrawer({ side, open, onToggle = null, title, handleLabel = '', className = '', children }) {
  return (
    <aside className={`drawer drawer-${side}${open ? ' open' : ''} ${className}`} aria-label={title} aria-hidden={!open}>
      {onToggle && (
        <button className="drawer-handle" onClick={onToggle} aria-expanded={open} aria-label={handleLabel}>
          {(side === 'left') === open ? '‹' : '›'}
        </button>
      )}
      <div className="drawer-body">{children}</div>
    </aside>
  );
}
