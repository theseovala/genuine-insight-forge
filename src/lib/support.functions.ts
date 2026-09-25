// Support contact details are stored per workspace. Nothing is invented: the
// Support page only shows a channel once a real value has been saved here.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const settingsSchema = z.object({
  supportName: z.string().max(120).nullable(),
  phone: z.string().max(40).nullable(),
  whatsapp: z.string().max(40).nullable(),
  email: z.string().max(200).nullable(),
  hours: z.string().max(200).nullable(),
  // Rendered as a link on the Support page, so only http(s) URLs are accepted
  // (a javascript: or data: URL would otherwise become a clickable href).
  // An empty value is still allowed and is stored as "not set".
  helpUrl: z
    .string()
    .max(300)
    .nullable()
    .refine((value) => {
      const trimmed = value?.trim() ?? "";
      if (trimmed.length === 0) return true;
      try {
        const url = new URL(trimmed);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }, "Help centre link must be a full http:// or https:// address."),
  defaultMessage: z.string().max(500).nullable(),
});

export type SupportSettings = z.infer<typeof settingsSchema>;

async function workspaceId(supabase: any, userId: string) {
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("No workspace found for this account.");
  return data.workspace_id as string;
}

export const getSupportSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SupportSettings> => {
    const supabase = context.supabase;
    const ws = await workspaceId(supabase, context.userId);
    const { data } = await supabase
      .from("support_settings")
      .select("support_name,phone,whatsapp,email,hours,help_url,default_message")
      .eq("workspace_id", ws)
      .maybeSingle();
    return {
      supportName: data?.support_name ?? null,
      phone: data?.phone ?? null,
      whatsapp: data?.whatsapp ?? null,
      email: data?.email ?? null,
      hours: data?.hours ?? null,
      helpUrl: data?.help_url ?? null,
      defaultMessage: data?.default_message ?? null,
    };
  });

export const saveSupportSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => settingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const ws = await workspaceId(supabase, context.userId);
    const clean = (value: string | null) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length > 0 ? trimmed : null;
    };
    const { error } = await supabase.from("support_settings").upsert(
      {
        workspace_id: ws,
        support_name: clean(data.supportName),
        phone: clean(data.phone),
        whatsapp: clean(data.whatsapp),
        email: clean(data.email),
        hours: clean(data.hours),
        help_url: clean(data.helpUrl),
        default_message: clean(data.defaultMessage),
      },
      { onConflict: "workspace_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
