import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Button } from "../ui";
import { announcementApi } from "./announcement-api";

/** A shortcut on home when there is something unread. Silent while loading or on error. */
export function AnnouncementsBanner() {
  const router = useRouter();
  const q = useQuery({
    queryKey: ["announcements-unread"],
    queryFn: announcementApi.unread,
    staleTime: 0,
  });
  const n = q.data ?? 0;
  if (n === 0) return null;
  const label = `${n} new ${n === 1 ? "announcement" : "announcements"}`;
  return (
    <Button
      testID="announcements-banner"
      label={label}
      variant="secondary"
      onPress={() => router.push("/profile/announcements")}
    />
  );
}
