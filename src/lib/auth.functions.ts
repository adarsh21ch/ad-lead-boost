import { createServerFn } from "@tanstack/react-start";

export const registerWithEmail = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; password: string }) => {
    const email = data?.email?.trim().toLowerCase();
    const password = data?.password ?? "";
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address");
    if (password.length < 6) throw new Error("Password must be at least 6 characters");
    return { email, password };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });

    if (error) {
      const message = error.message.toLowerCase().includes("already")
        ? "An account already exists for this email. Sign in instead."
        : error.message;
      throw new Error(message);
    }

    return { userId: created.user?.id ?? null };
  });