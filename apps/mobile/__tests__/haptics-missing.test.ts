// A development app built before expo-haptics was added has no native module, and importing the
// package throws there. Feedback must then quietly do nothing.
jest.mock("expo-haptics", () => {
  throw new Error("Cannot find native module 'ExpoHaptics'");
});

import { primaryFeedback, successFeedback, tapFeedback } from "../src/feedback/haptics";

it("never throws when the native module is missing", () => {
  expect(() => {
    tapFeedback();
    primaryFeedback();
    successFeedback();
  }).not.toThrow();
});
