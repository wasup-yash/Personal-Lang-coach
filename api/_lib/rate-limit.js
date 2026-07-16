const memory = new Map();

export async function enforceRateLimit({ namespace, subject, limit, windowSeconds }) {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `${namespace}:${subject}:${bucket}`;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const response = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", key], ["EXPIRE", key, windowSeconds + 30]])
    });
    const data = await response.json();
    return Number(data?.[0]?.result || 0) <= limit;
  }

  if (process.env.NODE_ENV === "production") return false;
  const count = (memory.get(key) || 0) + 1;
  memory.set(key, count);
  return count <= limit;
}

export function enforceAsrRateLimit(userId) {
  return enforceRateLimit({
    namespace: "asr",
    subject: userId,
    limit: Number(process.env.ASR_RATE_LIMIT_PER_HOUR || 20),
    windowSeconds: 3600
  });
}
