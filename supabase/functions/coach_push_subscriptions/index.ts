import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const action = body?.action;
    const credential = body?.coach_code;
    const installationId = body?.installation_id;

    if (!["subscribe", "unsubscribe"].includes(action) ||
        typeof credential !== "string" || !/^[0-9a-f]{64}$/.test(credential) ||
        typeof installationId !== "string" || !installationId.trim()) {
      return reply({ error: "Invalid request" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return reply({ error: "Service unavailable" }, 500);

    const db = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: personId, error: authError } = await db.rpc("get_authenticated_person_id", {
      supplied_credential: credential,
      required_access_role: "coach",
      supplied_installation_id: installationId.trim(),
    });
    if (authError || !personId) return reply({ error: "A valid personal Coach session is required" }, 401);

    const [{ data: user }, { data: installation }, { data: access }, { data: role }, { data: assignments }] = await Promise.all([
      db.from("approved_users").select("active").eq("person_id", personId).maybeSingle(),
      db.from("installations").select("active").eq("installation_id", installationId.trim()).maybeSingle(),
      db.from("installation_user_access").select("active").eq("person_id", personId).eq("installation_id", installationId.trim()).maybeSingle(),
      db.from("user_role_assignments").select("person_id").eq("person_id", personId).eq("role_key", "coach").maybeSingle(),
      db.from("user_age_group_assignments").select("age_group_id").eq("person_id", personId),
    ]);

    if (user?.active !== true || installation?.active !== true || access?.active !== true ||
        !role || !(assignments ?? []).length) {
      return reply({ error: "Coach access is inactive or has no age-group assignments" }, 403);
    }

    if (action === "unsubscribe") {
      const { error } = await db.from("coach_push_subscriptions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("person_id", personId)
        .eq("installation_id", installationId.trim())
        .is("revoked_at", null);
      if (error) return reply({ error: "Unable to disable notifications" }, 500);
      return reply({ success: true, subscribed: false });
    }

    const subscription = body?.subscription;
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const authSecret = subscription?.keys?.auth;
    if (typeof endpoint !== "string" || !endpoint.startsWith("https://") ||
        typeof p256dh !== "string" || typeof authSecret !== "string") {
      return reply({ error: "Invalid push subscription" }, 400);
    }

    const { data: existing, error: existingError } = await db.from("coach_push_subscriptions")
      .select("person_id,installation_id")
      .eq("endpoint", endpoint)
      .maybeSingle();
    if (existingError) return reply({ error: "Unable to verify existing subscription" }, 500);
    if (existing && (existing.person_id !== personId || existing.installation_id !== installationId.trim())) {
      return reply({ error: "This device subscription is already registered to another account" }, 409);
    }

    const { error: saveError } = await db.from("coach_push_subscriptions").upsert({
      person_id: personId,
      installation_id: installationId.trim(),
      endpoint,
      p256dh,
      auth_secret: authSecret,
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
    }, { onConflict: "endpoint" });

    if (saveError) {
      console.error("Subscription save failed:", saveError.message);
      return reply({ error: "Unable to save notification settings" }, 500);
    }

    return reply({ success: true, subscribed: true });
  } catch (error) {
    console.error("Coach push subscription error:", error);
    return reply({ error: "Invalid request" }, 400);
  }
});
