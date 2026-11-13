# Bank profile reordering

## Objective

Let users reorder bank profiles with drag and drop from a dedicated handle, and
use that order in the calculator profile selector without breaking the
last-used-profile preference.

## Product decision

- The profile array order controls the order of profile cards and of the
  calculator `<select>`.
- The last valid profile used in the calculator remains the selected profile on
  reload.
- `profiles[0]` is only the fallback when no valid remembered profile exists.
- Reordering must not change the currently selected profile or historical
  purchase snapshots.

## Scope

- Add dnd-kit-based drag and drop to the bank profiles panel.
- Restrict dragging to a dedicated 44x44 handle, with pointer, touch, and
  keyboard sensors.
- Restrict movement to the vertical axis and use a one-column profile list.
- Persist the new order through the existing Zustand `profiles` array.
- Keep `Card` reusable by adding a `leading` slot for the drag handle.
- Do not change records or purchase snapshots; only the profile selector order
  is affected.

## Tasks

- [x] Add `moveProfile(activeId, overId)` to the store with immutable reorder
      semantics and invalid-id no-ops.
- [x] Add profile-order store tests, including persistence and no mutation.
- [x] Add a reusable `leading` slot to `Card`.
- [x] Render bank profiles as a single-column sortable list with drag handles.
- [x] Add `DragOverlay`, vertical axis restriction, touch activation delay, and
      keyboard sorting.
- [x] Keep the last-used profile selected and test the calculator selector
      order.
- [x] Add panel tests for accessible handles and store-driven DOM order.

## Acceptance criteria

- Dragging a profile by its handle changes the card order.
- The new order is persisted and survives reload.
- The calculator selector follows the saved order.
- A valid remembered profile remains selected after reordering.
- A missing remembered profile falls back to the first profile.
- Mouse, touch, and keyboard reordering work.
- No horizontal page overflow at desktop or mobile widths.

## Evidence

- `npx vitest run --reporter=dot` -> 129 tests passed.
- `npx tsc --noEmit` -> clean.
- `npm run build` -> green.
- Browser smoke at 1280px and 390px: drag reorders and persists; desktop and
  mobile report no horizontal overflow.
- Touch drag via CDP and keyboard `Space` + `ArrowUp` + `Space` both reorder the
  list correctly.
