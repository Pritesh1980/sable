import { useState } from 'react'
import { getImageUrl } from '../data/planning'
import {
  BLANK_BOARD,
  addIdeaToBoard,
  removeIdeaFromBoard,
  moveIdeaInBoard,
  getBoardIdeas,
  getBoardCover,
} from '../data/boards'
import { buildBoardBrief } from '../data/export'

function BoardCard({ board, ideas, onOpen }) {
  const cover = getBoardCover(board, ideas)
  const count = board.ideaIds.length

  return (
    <button
      onClick={() => onOpen(board)}
      className="group block w-full text-left bg-ink-card border border-ink-border rounded-sm overflow-hidden hover:border-cream-muted/50 transition-colors animate-slide-up"
    >
      <div className="aspect-[4/3] bg-ink-muted relative overflow-hidden">
        {cover ? (
          <img
            src={cover}
            alt=""
            className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-cream-muted/20 text-5xl">▦</div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-display text-cream text-lg leading-tight mb-0.5">{board.name || 'Untitled board'}</h3>
        {board.description && (
          <p className="text-cream-muted text-sm font-body line-clamp-2 mb-2">{board.description}</p>
        )}
        <p className="text-cream-muted/80 text-[0.6875rem] font-mono tracking-widest uppercase">
          {count} idea{count !== 1 ? 's' : ''}
        </p>
      </div>
    </button>
  )
}

function BoardModal({ board, onClose, onSave, onDelete, ideas, artists }) {
  const [draft, setDraft] = useState({ ...BLANK_BOARD, ...board })
  const [copied, setCopied] = useState(false)
  const isNew = !board.id

  const boardIdeas = getBoardIdeas(draft, ideas)
  const availableIdeas = ideas.filter((i) => !draft.ideaIds.includes(i.id))

  function toggleIdea(id) {
    setDraft((d) =>
      d.ideaIds.includes(id) ? removeIdeaFromBoard(d, id) : addIdeaToBoard(d, id)
    )
  }

  function nudge(id, delta) {
    setDraft((d) => moveIdeaInBoard(d, id, delta))
  }

  function save() {
    if (!draft.name.trim()) return
    onSave({ ...draft, id: draft.id || Date.now().toString() })
  }

  async function copyBoardBrief() {
    await navigator.clipboard.writeText(buildBoardBrief(draft, ideas, artists))
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink-black/95 flex flex-col animate-fade-in overflow-y-auto">
      <div className="flex items-center justify-between px-5 pt-safe-top pt-6 pb-4 border-b border-ink-border sticky top-0 bg-ink-black z-10">
        <button onClick={onClose} className="text-cream-muted hover:text-cream text-sm tracking-widest uppercase">
          ← Back
        </button>
        <div className="flex gap-4">
          {!isNew && (
            <button
              onClick={() => {
                if (confirm(`Delete board "${draft.name}"? Ideas will not be deleted.`)) {
                  onDelete(board.id)
                  onClose()
                }
              }}
              className="text-accent/60 hover:text-accent text-sm transition-colors"
            >
              Delete
            </button>
          )}
          <button
            onClick={copyBoardBrief}
            disabled={!draft.name.trim()}
            className="text-cream-muted hover:text-cream disabled:opacity-30 text-sm transition-colors"
          >
            {copied ? 'Copied' : 'Copy brief'}
          </button>
          <button onClick={save} className="text-accent hover:text-accent-hover text-sm font-body transition-colors">
            {isNew ? 'Add' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex-1 px-5 py-6 max-w-2xl mx-auto w-full space-y-6">
        <input
          autoFocus
          className="bg-transparent border-b border-ink-border text-cream font-display text-2xl w-full outline-none pb-1 placeholder-cream-muted/60"
          placeholder="Board name…"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />

        <div>
          <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-3">Description</p>
          <textarea
            className="w-full bg-ink-muted border border-ink-border rounded-sm px-3 py-2 text-sm text-cream outline-none focus:border-cream-muted/50 font-body placeholder-cream-muted/60 resize-none"
            rows={3}
            placeholder="What's the theme of this board?"
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          />
        </div>

        {/* Ideas in board */}
        <div>
          <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-3">
            In this board ({boardIdeas.length})
          </p>
          {boardIdeas.length === 0 ? (
            <p className="text-cream-muted/60 text-xs font-mono">No ideas yet. Add from below.</p>
          ) : (
            <div className="space-y-2">
              {boardIdeas.map((idea, idx) => (
                <div
                  key={idea.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-sm border border-accent/40 bg-accent/5"
                >
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => nudge(idea.id, -1)}
                      disabled={idx === 0}
                      className="text-cream-muted hover:text-cream disabled:opacity-20 text-xs leading-none"
                    >▲</button>
                    <button
                      onClick={() => nudge(idea.id, 1)}
                      disabled={idx === boardIdeas.length - 1}
                      className="text-cream-muted hover:text-cream disabled:opacity-20 text-xs leading-none"
                    >▼</button>
                  </div>
                  {idea.images?.[0] && (
                    <img src={getImageUrl(idea.images[0])} alt="" className="w-10 h-10 object-cover rounded-sm" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                  )}
                  <span className="flex-1 text-cream text-sm font-body truncate">{idea.title}</span>
                  <button
                    onClick={() => toggleIdea(idea.id)}
                    className="text-accent/60 hover:text-accent text-lg leading-none"
                    title="Remove from board"
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Available ideas to add */}
        {availableIdeas.length > 0 && (
          <div>
            <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-3">Add ideas</p>
            <div className="space-y-1">
              {availableIdeas.map((idea) => (
                <button
                  key={idea.id}
                  onClick={() => toggleIdea(idea.id)}
                  className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-sm text-sm font-body transition-colors border border-ink-border text-cream-muted hover:border-cream-muted/50"
                >
                  {idea.images?.[0] && (
                    <img src={getImageUrl(idea.images[0])} alt="" className="w-8 h-8 object-cover rounded-sm" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                  )}
                  <span className="flex-1 truncate">{idea.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// The Boards tab of the Ideas page. Boards stay their own synced collection
// (tattoo_boards) — only the UI lives here now.
export default function BoardsSection({ boards, setBoards, ideas, artists, onGoToIdeas }) {
  const [modal, setModal] = useState(null)

  function saveBoard(board) {
    setBoards((prev) => {
      const exists = prev.find((b) => b.id === board.id)
      return exists ? prev.map((b) => (b.id === board.id ? board : b)) : [...prev, board]
    })
    setModal(null)
  }

  function deleteBoard(id) {
    setBoards((prev) => prev.filter((b) => b.id !== id))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-mono text-cream-muted/90 tracking-widest uppercase">
          Boards group related ideas
        </p>
        <button
          onClick={() => setModal({ ...BLANK_BOARD })}
          disabled={ideas.length === 0}
          className="w-10 h-10 rounded-full border border-ink-border text-cream-muted hover:text-cream hover:border-cream-muted/50 transition-colors flex items-center justify-center text-xl disabled:opacity-30 disabled:cursor-not-allowed"
          title={ideas.length === 0 ? 'Add ideas first' : 'New board'}
        >
          +
        </button>
      </div>

      {ideas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <span className="text-5xl mb-4 opacity-10">▦</span>
          <p className="text-cream-muted/90 font-body text-sm">No ideas yet.</p>
          <button
            onClick={onGoToIdeas}
            className="text-accent hover:text-accent-hover font-body text-xs mt-1 underline underline-offset-4"
          >
            Capture ideas first — boards group them
          </button>
        </div>
      ) : boards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <span className="text-5xl mb-4 opacity-10">▦</span>
          <p className="text-cream-muted/90 font-body text-sm">No boards yet.</p>
          <p className="text-cream-muted/90 font-body text-xs mt-1">Tap + to group ideas into a board.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {boards.map((board) => (
            <BoardCard key={board.id} board={board} ideas={ideas} onOpen={setModal} />
          ))}
        </div>
      )}

      {modal && (
        <BoardModal
          board={modal}
          onClose={() => setModal(null)}
          onSave={saveBoard}
          onDelete={deleteBoard}
          ideas={ideas}
          artists={artists}
        />
      )}
    </div>
  )
}
