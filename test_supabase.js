import { createClient } from '@supabase/supabase-js';
try {
    const supabase = createClient(undefined, undefined);
    console.log("Success");
} catch (e) {
    console.log("Error:", e.message);
}
