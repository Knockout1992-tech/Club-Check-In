import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = { "Content-Type": "application/json" };

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const publicKey = Deno.env.get("COACH_PUSH_VAPID_PUBLIC_KEY");
    const privateKey = Deno.env.get("COACH_PUSH_VAPID_PRIVATE_KEY");
    const subject = Deno.env.get("COACH_PUSH_VAPID_SUBJECT") || "mailto:club-admin@rhrufc.co.uk";
    if (!url || !serviceKey || !publicKey || !privateKey) {
      console.error("Push dispatch is missing Supabase or VAPID secrets");
      return new Response(JSON.stringify({ error: "Push service is not configured" }), { status: 503, headers: corsHeaders });
    }

    const webhookSecret = Deno.env.get("COACH_PUSH_WEBHOOK_SECRET");
    if (!webhookSecret || req.headers.get("x-coach-push-secret") !== webhookSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const payload = await req.json();
    const outboxId = Number(payload?.record?.id ?? payload?.id);
    if (!Number.isInteger(outboxId) || outboxId <= 0) {
      return new Response(JSON.stringify({ error: "Invalid outbox event" }), { status: 400, headers: corsHeaders });
    }

    const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: event, error: eventError } = await db.from("coach_notification_outbox")
      .select("*").eq("id", outboxId).maybeSingle();
    if (eventError || !event) return new Response(JSON.stringify({ error: "Notification event not found" }), { status: 404, headers: corsHeaders });
    if (event.processed_at) return new Response(JSON.stringify({ success: true, duplicate: true }), { headers: corsHeaders });

    const groupIds = event.age_group_ids?.length ? event.age_group_ids :
      (event.age_group_id ? [event.age_group_id] : []);
    if (!groupIds.length) {
      await db.from("coach_notification_outbox").update({ processed_at: new Date().toISOString(), attempts: event.attempts + 1 })
        .eq("id", outboxId);
      return new Response(JSON.stringify({ success: true, recipients: 0 }), { headers: corsHeaders });
    }

    const { data: assignments, error: assignmentError } = await db.from("user_age_group_assignments")
      .select("person_id,age_group_id").in("age_group_id", groupIds);
    if (assignmentError) throw assignmentError;
    const people = [...new Set((assignments ?? []).map((row: any) => row.person_id))];
    if (!people.length) {
      await db.from("coach_notification_outbox").update({ processed_at: new Date().toISOString(), attempts: event.attempts + 1 })
        .eq("id", outboxId);
      return new Response(JSON.stringify({ success: true, recipients: 0 }), { headers: corsHeaders });
    }

    const { data: subscriptions, error: subscriptionError } = await db.from("coach_push_subscriptions")
      .select("id,person_id,installation_id,endpoint,p256dh,auth_secret")
      .in("person_id", people).is("revoked_at", null);
    if (subscriptionError) throw subscriptionError;

    webpush.setVapidDetails(subject, publicKey, privateKey);
    const kindText = event.event_kind === "published" ? "New event" :
      event.event_kind === "cancelled" ? "Event cancelled" : "Event updated";
    const title = event.event_kind === "published" ? "New club event" :
      event.event_kind === "cancelled" ? "Club event cancelled" : "Club event updated";
    const dateText = event.event_date ? new Date(event.event_date + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
    const bodyText = [event.event_title, dateText].filter(Boolean).join(" · ");
    const notification = JSON.stringify({
      title: event.event_kind === "published" && event.event_type === "match" ? "New fixture" :
        event.event_kind === "cancelled" && event.event_type === "match" ? "Fixture cancelled" :
        event.event_kind === "updated" && event.event_type === "match" ? "Fixture updated" : title,
      body: bodyText || kindText,
      url: "./",
      tag: "club-event-" + event.event_key,
    });

    let sent = 0;
    let failed = 0;
    for (const sub of subscriptions ?? []) {
      const [{ data: user }, { data: installation }, { data: access }, { data: role }, { data: personGroups }] = await Promise.all([
        db.from("approved_users").select("active").eq("person_id", sub.person_id).maybeSingle(),
        db.from("installations").select("active").eq("installation_id", sub.installation_id).maybeSingle(),
        db.from("installation_user_access").select("active").eq("person_id", sub.person_id).eq("installation_id", sub.installation_id).maybeSingle(),
        db.from("user_role_assignments").select("person_id").eq("person_id", sub.person_id).eq("role_key", "coach").maybeSingle(),
        db.from("user_age_group_assignments").select("age_group_id").eq("person_id", sub.person_id),
      ]);
      const assigned = (personGroups ?? []).some((row: any) => groupIds.includes(Number(row.age_group_id)));
      if (user?.active !== true || installation?.active !== true || access?.active !== true || !role || !assigned) {
        await db.from("coach_push_subscriptions").update({ revoked_at: new Date().toISOString() }).eq("id", sub.id);
        continue;
      }
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth_secret },
        }, notification, { TTL: 3600 });
        sent++;
      } catch (error: any) {
        failed++;
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await db.from("coach_push_subscriptions").update({ revoked_at: new Date().toISOString() }).eq("id", sub.id);
        } else {
          console.error("Push delivery failed for subscription", sub.id, error?.statusCode || error?.message);
        }
      }
    }

    await db.from("coach_notification_outbox").update({
      processed_at: new Date().toISOString(),
      attempts: Number(event.attempts || 0) + 1,
      last_error: failed ? failed + " delivery attempt(s) failed" : null,
    }).eq("id", outboxId);

    return new Response(JSON.stringify({ success: true, sent, failed }), { headers: corsHeaders });
  } catch (error) {
    console.error("Coach push dispatch failed:", error);
    return new Response(JSON.stringify({ error: "Push dispatch failed" }), { status: 500, headers: corsHeaders });
  }
});
