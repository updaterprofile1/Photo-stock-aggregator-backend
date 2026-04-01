const { supabase, BUCKET } = require('./supabase');

async function uploadOriginal(buffer, path, mimetype) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: mimetype,
      upsert: false,
    });

  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  const { data, error: publicUrlError } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (publicUrlError) {
    throw new Error(`Failed to get public URL: ${publicUrlError.message}`);
  }

  return {
    publicUrl: data.publicUrl,
    storageKey: path,
  };
}

function getPublicUrl(path) {
  const { data, error } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (error) {
    throw new Error(`Failed to get public URL: ${error.message}`);
  }

  return data.publicUrl;
}

async function deleteOriginal(path) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  return !error;
}

module.exports = {
  uploadOriginal,
  getPublicUrl,
  deleteOriginal,
};
