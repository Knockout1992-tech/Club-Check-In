const SUPABASE_URL =
    "https://muxxlewtqhpckhoqeinn.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_u3IexkNha97RFr5qEguI1A_Y-NBjxeo";

const supabaseClient =
    supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
    );

async function testSupabaseConnection() {

    const { data, error } =
        await supabaseClient
            .from("Players")
            .select("id")
            .limit(1);

    if (error) {

        alert(
            "Supabase test failed:\n\n" +
            error.message
        );

        return;
    }

    alert(
        "Supabase connection successful!"
    );
}