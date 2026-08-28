import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getCurrentAuthUser } from "@/lib/session.functions";

// ssr: false — the Supabase session lives in browser storage/cookies that a
// framed preview does not send during SSR. Gating client-side lets the function
// middleware attach the bearer token, so a signed-in user is never bounced.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const user = await getCurrentAuthUser();
    if (!user) throw redirect({ to: "/auth" });
    return { user };
  },
  component: () => <Outlet />,
});
