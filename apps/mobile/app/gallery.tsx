import NotFound from "./+not-found";

// Development-only component gallery. In production builds `__DEV__` is false, the require is
// removed from the bundle, and this route shows the normal not-found screen.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Gallery: React.ComponentType = __DEV__ ? require("../src/dev/Gallery").default : NotFound;

export default Gallery;
