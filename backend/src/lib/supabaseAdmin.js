// backend/src/lib/supabaseAdmin.js

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase URL or Service Role Key in environment variables.");
  }

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

// --- NEW FUNCTION TO GENERATE SIGNED URL ---
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'vendor-documents';

/**
 * Generates a time-limited, signed URL for a private file in Supabase Storage.
 * @param {string} filePath - The full path to the file (e.g., 'documents/vendor-123/123456-cr.pdf')
 * @param {number} expiresInSeconds - The validity duration for the link (default: 60)
 * @returns {string} The public, temporary URL or null on error
 */
export async function getSignedUrl(filePath, expiresInSeconds = 60) {
    if (!filePath) {
        return null;
    }
    
    // The bucket name is read from the environment variable (or the 'vendor-documents' default)
    const { data, error } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(filePath, expiresInSeconds);

    if (error) {
        console.error("Error generating signed URL for path:", filePath, error);
        return null;
    }

    return data.signedUrl;
}