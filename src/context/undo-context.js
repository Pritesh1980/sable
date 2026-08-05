import { createContext } from 'react'

// Null outside a provider — `useUndo` degrades to "no undo offered" rather than
// throwing, so components can still be unit-tested without the app shell.
export const UndoContext = createContext(null)
