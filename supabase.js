// lib/supabase.js

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing required env vars: SUPABASE_URL, SUPABASE_ANON_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const BUCKET = 'images';

/**
 * Upload a buffer to Supabase Storage.
 * @param {Buffer} buffer        - File contents
 * @param {string} filename      - Destination path inside the bucket
 * @param {string} mimetype      - MIME type of the file
 * @returns {Promise<string>}    - Public URL of the uploaded file
 */
async function uploadToStorage(buffer, filename, mimetype) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, {
      contentType: mimetype,
      upsert: false,
    });

  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

module.exports = { supabase, uploadToStorage, BUCKET };
