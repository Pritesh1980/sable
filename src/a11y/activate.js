// Keyboard activation for an element given role="button" (#104): Enter and
// Space run the handler, as they would on a real <button>. Used where a real
// button won't do, because the element contains its own link or button, or
// multi-line content. Write role="button" and tabIndex={0} literally beside
// it: a spread would hide them from the accessibility linters.
export function activateOnKey(handler) {
  return (e) => {
    // A key pressed on a nested link or button belongs to that control.
    if (e.target !== e.currentTarget) return
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    handler(e)
  }
}
