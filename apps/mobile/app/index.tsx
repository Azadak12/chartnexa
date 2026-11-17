import { Redirect } from "expo-router";
import { HOME_ROUTE } from "../src/navigation/return-to";
import { useSession } from "../src/session/session-store";

export default function Index() {
  const { status } = useSession();
  return <Redirect href={status === "signed-in" ? HOME_ROUTE : "/welcome"} />;
}
