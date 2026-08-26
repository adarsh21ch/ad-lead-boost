import { createServerFn } from "@tanstack/react-start";

export const getCurrentAuthUser = createServerFn({ method: "GET" }).handler(async () => {
  const { getServerAuthUser } = await import("@/integrations/supabase/session.server");
  return getServerAuthUser();
});