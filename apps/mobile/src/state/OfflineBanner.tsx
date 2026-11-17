import { useNetInfo } from "@react-native-community/netinfo";
import { Banner } from "../ui/Banner";

/** Non-blocking: sits above the content, which stays mounted. Hidden once the connection returns. */
export function OfflineBanner() {
  const { isConnected } = useNetInfo();
  if (isConnected !== false) return null;
  return (
    <Banner
      kind="warning"
      message="You are offline. Showing what was already loaded."
      testID="offline-banner"
    />
  );
}
