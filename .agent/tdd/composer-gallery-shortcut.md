# Composer gallery shortcut TDD evidence

## Behavior matrix

| Case                | Expected behavior                                                                       | Coverage                                                      |
| ------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Chat composer       | Gallery shortcut remains visible to the right of the attachment `+` button.             | `composer-attachments.spec.ts` / gallery shortcut             |
| Direct image action | Pressing the shortcut opens the platform image chooser and creates an image attachment. | Same Playwright test                                          |
| Terminal composer   | Chat-only attachment controls remain hidden with the gallery shortcut.                  | Existing composer input-mode presentation                     |
| HarmonyOS picker    | The shortcut continues to use `paseoPhotoPicker` when the bridge is present.            | `harmony-gallery-picker.ts`, `use-image-attachment-picker.ts` |

## Red evidence

- `npx playwright test e2e/browser/composer-attachments.spec.ts --project=browser -g "gallery shortcut"` failed because `message-input-gallery-button` did not exist in the web/desktop composer.

## Green evidence

- The same Playwright test passes after showing the shortcut for every chat composer.
- The test verifies the gallery button is to the right of `message-input-attach-button` and that clicking it opens a file chooser and attaches the selected image.
- `npm run typecheck`, `npm run lint`, and `npm run format:check` pass.

## Mutation sensitivity

- The original `showGalleryButton = false` state is the direct mutation: it removes the button and the Playwright assertion fails before the fix.
