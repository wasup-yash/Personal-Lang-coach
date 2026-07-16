import { DeleteObjectCommand, DeleteObjectsCommand, HeadObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

function storageClient() {
  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || ""
    }
  });
}

function bucket() {
  if (!process.env.S3_BUCKET) throw new Error("Transient audio storage is not configured.");
  return process.env.S3_BUCKET;
}

export function objectKey(userId, jobId, filename) {
  const extension = (filename?.split(".").pop() || "webm").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "webm";
  return `jobs/${userId}/${jobId}/audio.${extension}`;
}

export async function createUploadUrl({ key, contentType }) {
  const client = storageClient();
  const post = await createPresignedPost(client, {
    Bucket: bucket(),
    Key: key,
    Expires: 300,
    Fields: {
      "Content-Type": contentType,
      "x-amz-server-side-encryption": "AES256"
    },
    Conditions: [
      ["content-length-range", 1, 25_000_000],
      ["starts-with", "$Content-Type", "audio/"],
      { "x-amz-server-side-encryption": "AES256" }
    ]
  });
  return {
    url: post.url,
    method: "POST",
    fields: post.fields
  };
}

export async function deleteUserObjects(userId) {
  const client = storageClient();
  let continuationToken;
  let deleted = 0;
  do {
    const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: `jobs/${userId}/`, ContinuationToken: continuationToken }));
    const objects = (listed.Contents || []).map(({ Key }) => ({ Key })).filter(({ Key }) => Key);
    if (objects.length) {
      const result = await client.send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: objects, Quiet: true } }));
      if (result.Errors?.length) throw new Error(`Could not delete ${result.Errors.length} transient audio objects.`);
      deleted += result.Deleted?.length ?? 0;
    }
    continuationToken = listed.NextContinuationToken;
  } while (continuationToken);
  return deleted;
}

export async function deleteObject(key) {
  await storageClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function assertAudioObject(key, maxBytes = 25_000_000) {
  const metadata = await storageClient().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
  if (!metadata.ContentLength || metadata.ContentLength > maxBytes || !metadata.ContentType?.startsWith("audio/")) {
    throw new Error("Uploaded object is not an allowed audio file.");
  }
  return metadata;
}
