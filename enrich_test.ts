import { createClient } from "@supabase/supabase-js";
import { enrichLead } from "./src/lib/lead-enrichment.server";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: lead } = await admin.from("leads").select("id, meta_leadgen_id, enrichment_status").eq("meta_leadgen_id", "1862460961805586").maybeSingle();
console.log("before:", lead);
if (lead) {
  const r = await enrichLead(admin as any, lead.id);
  console.log("result:", JSON.stringify(r));
  const { data: after } = await admin.from("leads").select("full_name, campaign_name, ad_name, adset_name, enrichment_status, enrichment_error, enrichment_attempts, phone_hash, email_hash, raw_field_data").eq("id", lead.id).maybeSingle();
  console.log("after:", JSON.stringify(after, null, 2));
}
