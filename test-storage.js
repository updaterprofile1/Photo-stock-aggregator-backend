const { uploadOriginal, getPublicUrl, deleteOriginal } = require('./lib/storage');

async function runTests() {
  const dummyBuffer = Buffer.from('Hello Supabase Storage');
  const storagePath = `test-${Date.now()}.txt`;
  const mimetype = 'text/plain';

  console.log('Starting storage tests...');

  try {
    const uploadResult = await uploadOriginal(dummyBuffer, storagePath, mimetype);
    console.log('uploadOriginal result:', uploadResult);

    const publicUrl = getPublicUrl(storagePath);
    console.log('getPublicUrl result:', publicUrl);

    if (publicUrl !== uploadResult.publicUrl) {
      throw new Error('getPublicUrl returned a different URL than uploadOriginal');
    }

    const deleteSuccess = await deleteOriginal(storagePath);
    console.log('deleteOriginal result:', deleteSuccess);

    if (!deleteSuccess) {
      throw new Error('deleteOriginal reported failure');
    }

    console.log('All storage tests passed.');
  } catch (error) {
    console.error('Storage test failed:', error);
    process.exitCode = 1;
  }
}

runTests();
