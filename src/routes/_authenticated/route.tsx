import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getCurrentAuthUser } from "@/lib/session.functions";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const user = await getCurrentAuthUser();
    if (!user) throw redirect({ to: "/auth" });
    return { user };
  },
  component: () => <Outlet />,
});
