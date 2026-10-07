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
            .from("players")
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

testSupabaseConnection();

async function testSupabaseInsert() {

    const { data, error } =
        await supabaseClient
            .from("players")
            .insert({
                player_id: "TEST-001",
                name: "Test Player",
                age_group: "TEST",
                gms: false,
                coach_gms_suggestion: false,
                active: true,
                archived: false
            })
            .select();

    if (error) {

        alert(
            "Supabase insert failed:\n\n" +
            error.message
        );

        return;
    }

    alert(
        "Supabase insert successful!"
    );
}

testSupabaseInsert();