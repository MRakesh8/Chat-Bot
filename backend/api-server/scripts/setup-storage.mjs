import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupStorage() {
  console.log("Setting up Supabase Storage...");

  const bucketName = "project-files";

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error("Error listing buckets:", listError);
    process.exit(1);
  }

  const exists = buckets.find((b) => b.name === bucketName);

  if (!exists) {
    console.log(`Creating bucket: ${bucketName}...`);
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: false, // Must use signed URLs or access token to view
      fileSizeLimit: 52428800, // 50MB
    });

    if (createError) {
      console.error("Error creating bucket:", createError);
      process.exit(1);
    }
    console.log(`Bucket ${bucketName} created successfully.`);
  } else {
    console.log(`Bucket ${bucketName} already exists.`);
  }
}

setupStorage().catch(console.error);
