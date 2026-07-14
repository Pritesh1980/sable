# Logo Home Navigation Design

## Goal

Make the complete Sable page-header logo lockup—the koru mark and wordmark—a
standard link to the canonical Home/Wall route (`/`). The interaction must work
with a pointer, keyboard navigation, and normal browser link behavior.

## Scope

- Change the shared `Logo` component used in authenticated page headers.
- Preserve the current visual layout and styling.
- Keep the standalone `LogoMark` and `Wordmark` components presentational so
  login and loading states do not acquire unexpected navigation.
- Update the matching getting-started documentation and in-app Help content.
- Re-capture affected documentation imagery as required by the repository's
  documentation-maintenance workflow.

The Wall's separate `Sable.` masthead and other textual mentions of Sable are
outside this change.

## Component Design

`src/components/Logo.jsx` will render the full lockup with React Router's
`Link`, targeting `/`. The link itself will retain the existing inline-flex
layout classes and receive an explicit keyboard focus treatment. Its accessible
name will come from the visible `Sable` wordmark, so no duplicate hidden label
is required.

Using a shared router link is preferred over wrapping the component on every
page because it covers all current and future page-header uses consistently.
It is also preferred over an `onClick` handler because it preserves anchor
semantics, keyboard activation, and open-in-new-tab behavior.

## Navigation and Error Behavior

React Router will perform client-side navigation to `/`, where the existing
protected Home/Wall route renders. Authentication behavior remains owned by
`ProtectedRoute`; the logo does not add special error or fallback handling.

## Testing

Add a focused component test that:

1. renders the full `Logo` inside a `MemoryRouter` on a non-home route;
2. confirms it is exposed as a link named `Sable` with `href="/"`;
3. activates the link; and
4. verifies that the current router location becomes `/`.

Follow TDD by running this test before implementation and confirming it fails
because the current logo is a non-interactive `div`. After the minimal component
change, run the focused test, the complete test suite, and the production build.

## Documentation

Document that the page-header Sable logo returns to Home in both the relevant
Markdown guide and the matching `SECTIONS` entry in `src/pages/Help.jsx`. Follow
`docs/MAINTAINING.md` to refresh the affected screenshot and validate the docs
contract.
