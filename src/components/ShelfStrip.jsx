import { useState, useRef, useEffect } from 'react';

// Preset shelf colors. Kept small on purpose — a full color picker
// is design fatigue; 6 options cover every reasonable "mood shelf"
// use case and keeps the strip visually coherent.
const SHELF_COLORS = [
  '#6366f1', // indigo (default)
  '#e04666', // rose
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#3b82f6', // blue
  '#22c55e', // green (matches --success; replaced the original purple
             // which was too close to indigo at 14px swatch size)
];

export default function ShelfStrip({
  shelves,
  worksByShelf,
  activeShelfId,
  setActiveShelfId,
  createShelf,
  updateShelf,
  deleteShelf,
  isAtShelfLimit,
  shelvesRemaining,
  totalShelfCount,
  shelfLimit,
  isPremium,
  onUpgradeClick,
}) {
  // Local UI state — the hook owns the data, the strip owns the affordances.
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(SHELF_COLORS[0]);
  const [createError, setCreateError] = useState('');
  const [menuOpenFor, setMenuOpenFor] = useState(null); // shelf id
  const [editingShelfId, setEditingShelfId] = useState(null);
  const [editName, setEditName] = useState('');
  const [hitLimitFlash, setHitLimitFlash] = useState(false);

  const createInputRef = useRef(null);
  const editInputRef = useRef(null);
  const menuRef = useRef(null);

  // Autofocus the input when entering create/edit mode. Ref + effect is
  // the React-friendly way; calling .focus() in the onClick handler
  // races with React committing the DOM.
  useEffect(() => {
    if (creating && createInputRef.current) createInputRef.current.focus();
  }, [creating]);
  useEffect(() => {
    if (editingShelfId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingShelfId]);

  // Close the "..." menu when clicking outside it. Standard popover pattern.
  useEffect(() => {
    if (!menuOpenFor) return;
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpenFor(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpenFor]);

  function startCreate() {
    if (isAtShelfLimit) {
      // Flash the limit indicator instead of silently failing.
      setHitLimitFlash(true);
      setTimeout(() => setHitLimitFlash(false), 2000);
      return;
    }
    setCreating(true);
    setNewName('');
    setNewColor(SHELF_COLORS[0]);
    setCreateError('');
  }

  function cancelCreate() {
    setCreating(false);
    setNewName('');
    setCreateError('');
  }

  async function submitCreate() {
    const trimmed = newName.trim();
    if (!trimmed) {
      setCreateError('Name is required');
      return;
    }
    if (trimmed.length > 50) {
      setCreateError('Name must be 50 characters or fewer');
      return;
    }
    const result = await createShelf({ name: trimmed, color: newColor });
    if (result.hitLimit) {
      setCreateError('Free tier is limited to 3 shelves');
      setHitLimitFlash(true);
      return;
    }
    if (result.error) {
      // Duplicate name comes back as a 23505 (unique_violation)
      if (result.error.code === '23505') {
        setCreateError('You already have a shelf with that name');
      } else {
        setCreateError('Could not create shelf');
      }
      return;
    }
    cancelCreate();
  }

  function startEdit(shelf) {
    setEditingShelfId(shelf.id);
    setEditName(shelf.name);
    setMenuOpenFor(null);
  }

  async function submitEdit(shelf) {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === shelf.name) {
      setEditingShelfId(null);
      return;
    }
    const result = await updateShelf(shelf.id, { name: trimmed });
    if (result.error) {
      // Silently revert on error — the chip stays as it was.
      // A toast system would be better but we don't have one in
      // this codebase yet.
      console.error('Rename failed:', result.error);
    }
    setEditingShelfId(null);
  }

  async function handleDelete(shelf) {
    setMenuOpenFor(null);
    const count = worksByShelf.get(shelf.id)?.size || 0;
    const msg = count > 0
      ? `Delete "${shelf.name}"? ${count} fic${count === 1 ? '' : 's'} will be removed from this shelf (but not from your library).`
      : `Delete "${shelf.name}"?`;
    if (!confirm(msg)) return;
    if (activeShelfId === shelf.id) setActiveShelfId(null);
    await deleteShelf(shelf.id);
  }

  const hasShelves = shelves.length > 0;

  return (
    <div className="shelf-strip">
      <div className="shelf-strip-header">
        <span className="shelf-strip-label">Shelves</span>
        {!isPremium && (
          <span
            className={`shelf-strip-count ${hitLimitFlash ? 'flash' : ''}`}
            title={`Free tier: ${totalShelfCount} of ${shelfLimit} shelves used`}
          >
            {totalShelfCount}/{shelfLimit}
          </span>
        )}
      </div>

      <div className="shelf-chips">
        {/* "All" chip — clears the active shelf filter */}
        {hasShelves && (
          <button
            className={`shelf-chip shelf-chip-all ${activeShelfId === null ? 'active' : ''}`}
            onClick={() => setActiveShelfId(null)}
          >
            All
          </button>
        )}

        {shelves.map(shelf => {
          const count = worksByShelf.get(shelf.id)?.size || 0;
          const isActive = activeShelfId === shelf.id;
          const isEditing = editingShelfId === shelf.id;
          const isMenuOpen = menuOpenFor === shelf.id;

          return (
            <div key={shelf.id} className={`shelf-chip-wrap ${isActive ? 'active' : ''}`}>
              {isEditing ? (
                <div className="shelf-chip shelf-chip-editing">
                  <span className="shelf-dot" style={{ background: shelf.color }} />
                  <input
                    ref={editInputRef}
                    className="shelf-chip-input"
                    value={editName}
                    maxLength={50}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') submitEdit(shelf);
                      if (e.key === 'Escape') setEditingShelfId(null);
                    }}
                    onBlur={() => submitEdit(shelf)}
                  />
                </div>
              ) : (
                <button
                  className={`shelf-chip ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveShelfId(isActive ? null : shelf.id)}
                  title={shelf.name}
                >
                  <span className="shelf-dot" style={{ background: shelf.color }} />
                  <span className="shelf-chip-name">{shelf.name}</span>
                  <span className="shelf-chip-count">{count}</span>
                </button>
              )}

              {!isEditing && (
                <button
                  className="shelf-chip-menu-btn"
                  onClick={e => {
                    e.stopPropagation();
                    setMenuOpenFor(isMenuOpen ? null : shelf.id);
                  }}
                  title="Shelf options"
                  aria-label="Shelf options"
                >
                  ⋯
                </button>
              )}

              {isMenuOpen && (
                <div className="shelf-chip-menu" ref={menuRef}>
                  <button onClick={() => startEdit(shelf)}>Rename</button>
                  <button
                    className="shelf-chip-menu-danger"
                    onClick={() => handleDelete(shelf)}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Create affordance */}
        {creating ? (
          <div className="shelf-chip shelf-chip-creating">
            <span className="shelf-dot" style={{ background: newColor }} />
            <input
              ref={createInputRef}
              className="shelf-chip-input"
              placeholder="Shelf name"
              value={newName}
              maxLength={50}
              onChange={e => { setNewName(e.target.value); setCreateError(''); }}
              onKeyDown={e => {
                if (e.key === 'Enter') submitCreate();
                if (e.key === 'Escape') cancelCreate();
              }}
            />
            <div className="shelf-color-picker">
              {SHELF_COLORS.map(c => (
                <button
                  key={c}
                  className={`shelf-color-swatch ${c === newColor ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setNewColor(c)}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
            <button className="btn btn-sm btn-accent" onClick={submitCreate}>Add</button>
            <button className="btn btn-sm btn-ghost" onClick={cancelCreate}>Cancel</button>
          </div>
        ) : (
          <button
            className={`shelf-chip shelf-chip-add ${isAtShelfLimit ? 'disabled' : ''}`}
            onClick={startCreate}
            title={isAtShelfLimit ? 'Upgrade to Plus for unlimited shelves' : 'Create a new shelf'}
          >
            + New shelf
          </button>
        )}

        {/* Upgrade CTA appears when the cap is hit */}
        {isAtShelfLimit && onUpgradeClick && (
          <button className="shelf-chip shelf-chip-upgrade" onClick={onUpgradeClick}>
            ✨ Upgrade for unlimited
          </button>
        )}
      </div>

      {createError && (
        <div className="shelf-strip-error">{createError}</div>
      )}
    </div>
  );
}
