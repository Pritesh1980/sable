export const BLANK_BOARD = {
  name: '',
  description: '',
  ideaIds: [],
  cover: '',
}

export function addIdeaToBoard(board, ideaId) {
  if (board.ideaIds.includes(ideaId)) return { ...board }
  return { ...board, ideaIds: [...board.ideaIds, ideaId] }
}

export function removeIdeaFromBoard(board, ideaId) {
  return { ...board, ideaIds: board.ideaIds.filter((id) => id !== ideaId) }
}

export function moveIdeaInBoard(board, ideaId, delta) {
  const idx = board.ideaIds.indexOf(ideaId)
  if (idx < 0) return { ...board }
  const target = idx + delta
  if (target < 0 || target >= board.ideaIds.length) return { ...board }
  const next = [...board.ideaIds]
  const [item] = next.splice(idx, 1)
  next.splice(target, 0, item)
  return { ...board, ideaIds: next }
}

export function getBoardIdeas(board, ideas) {
  const byId = new Map(ideas.map((i) => [i.id, i]))
  return board.ideaIds.map((id) => byId.get(id)).filter(Boolean)
}

export function getBoardCover(board, ideas) {
  if (board.cover) return board.cover
  const boardIdeas = getBoardIdeas(board, ideas)
  for (const idea of boardIdeas) {
    if (idea.images?.length) return idea.images[0]
  }
  return ''
}
