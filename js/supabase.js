const SUPABASE_URL =
    "https://muxxlewtqhpckhoqeinn.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_u3IexkNha97RFr5qEguI1A_Y-NBjxeo";

// Keep one stable installation ID on this browser and attach it to every
// database request so server-side PIN lockout applies to every RPC.
let installationIDForRequests = localStorage.getItem("installationID");
if (!installationIDForRequests) {
    installationIDForRequests = "INSTALL-" + crypto.randomUUID();
    localStorage.setItem("installationID", installationIDForRequests);
}

const supabaseClient =
    supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY,
        {
            global: {
                headers: {
                    "x-client-info": "club-check-in-installation=" + installationIDForRequests
                }
            }
        }
    );
