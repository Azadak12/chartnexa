/**
 * Development builds show a large floating "Tools" gear (expo-dev-client) on top of every screen.
 * It crowds the design, so it is hidden at launch. The developer menu is still there: shake the
 * phone, or press "m" in the Expo terminal. The Test server address stays on the Welcome screen.
 * Release builds do not contain the dev client, so this does nothing there.
 */
export function hideDevToolsButton(): void {
  try {
    // A plain require keeps the module out of builds and tests that do not have the native part.
    // expo-dev-client re-exports the dev menu API.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const menu = require("expo-dev-client") as { setToolsButtonVisible?: (v: boolean) => void };
    menu.setToolsButtonVisible?.(false);
  } catch {
    // No dev client in this build: nothing to hide.
  }
}
