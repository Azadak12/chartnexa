// Network status is native; tests control it through this mock.
jest.mock("@react-native-community/netinfo", () => {
  let state = { isConnected: true };
  const listeners = new Set();
  return {
    __esModule: true,
    default: {
      addEventListener: (fn) => {
        listeners.add(fn);
        fn(state);
        return () => listeners.delete(fn);
      },
      fetch: () => Promise.resolve(state),
    },
    useNetInfo: () => {
      const React = require("react");
      const [current, setCurrent] = React.useState(state);
      React.useEffect(() => {
        listeners.add(setCurrent);
        setCurrent(state);
        return () => listeners.delete(setCurrent);
      }, []);
      return current;
    },
    __setConnected: (v) => {
      state = { isConnected: v };
      listeners.forEach((l) => l(state));
    },
  };
});

jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve(true)),
}));

jest.mock(
  "react-native-safe-area-context",
  () => require("react-native-safe-area-context/jest/mock").default,
);
// Fonts are asset-backed and native; navigation tests do not need to wait for them.
jest.mock("./src/fonts/use-app-fonts", () => ({ useAppFonts: () => true, FONT_TIMEOUT_MS: 3000 }));
