import { useQuery } from "@tanstack/react-query";
import { isAppError, messageFor } from "../api/errors";
import { fetchAccess, isStaff } from "../courses/course-api";
import { StateView } from "../state/StateView";
import { Screen } from "../ui";
import { AdminDashboard } from "./admin/AdminDashboard";
import { InstructorDashboard } from "./instructor/InstructorDashboard";
import { ManagerDashboard } from "./manager/ManagerDashboard";

/** A role-aware home for staff. Each tile opens a real screen; the server still checks every call. */
export function StaffDashboardScreen() {
  const access = useQuery({ queryKey: ["access"], queryFn: fetchAccess });
  if (access.status === "pending") {
    return (
      <Screen>
        <StateView state="loading" />
      </Screen>
    );
  }
  if (access.status === "error") {
    return (
      <Screen>
        <StateView
          state="error"
          message={isAppError(access.error) ? access.error.message : messageFor("unknown")}
          onAction={() => void access.refetch()}
        />
      </Screen>
    );
  }
  const a = access.data;
  if (!isStaff(a)) {
    return (
      <Screen>
        <StateView
          state="empty"
          title="Not available"
          message="The dashboard is for instructors, managers and admins."
        />
      </Screen>
    );
  }
  // Admins have the redesigned dashboard; Managers and Instructors have their own.
  if (a.roles.includes("admin")) return <AdminDashboard access={a} />;
  // Instructor and Lecturer share this screen; their own permissions decide what it lists.
  if (!a.roles.includes("manager")) return <InstructorDashboard access={a} />;
  return <ManagerDashboard access={a} />;
}
