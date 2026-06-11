const YOUTUBE_ID_PATTERN =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export function extractYouTubeId(text: string): string | null {
  const match = YOUTUBE_ID_PATTERN.exec(text);
  return match?.[1] ?? null;
}

export function extractYouTubeIds(text: string): string[] {
  const pattern = new RegExp(YOUTUBE_ID_PATTERN.source, "g");
  const ids: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (!ids.includes(match[1])) ids.push(match[1]);
  }
  return ids;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

type TranscriptSegment = { text: string };

async function fetchViaPlus(videoId: string, lang?: string): Promise<string> {
  const { YoutubeTranscript } = await import("youtube-transcript-plus");
  const transcript = await YoutubeTranscript.fetchTranscript(
    videoId,
    lang ? { lang } : undefined,
  );
  return transcript.map((segment: TranscriptSegment) => decodeHtmlEntities(segment.text)).join(" ");
}

async function fetchViaLegacy(videoId: string, lang?: string): Promise<string> {
  const { YoutubeTranscript } = await import("youtube-transcript");
  const transcript = await YoutubeTranscript.fetchTranscript(
    videoId,
    lang ? { lang } : undefined,
  );
  return transcript.map((segment: TranscriptSegment) => decodeHtmlEntities(segment.text)).join(" ");
}

async function fetchYouTubeMetadata(videoId: string): Promise<string> {
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
    );
    if (!res.ok) return "";

    const data = (await res.json()) as { title?: string; author_name?: string };
    const title = data.title?.trim();
    const author = data.author_name?.trim();
    if (!title) return "";

    return [
      `YouTube Video: ${title}`,
      author ? `Channel: ${author}` : null,
      `URL: ${watchUrl}`,
      "Note: Captions were unavailable; using video metadata only.",
    ]
      .filter(Boolean)
      .join("\n");
  } catch {
    return "";
  }
}

export async function fetchYouTubeTranscriptText(videoIdOrUrl: string): Promise<string> {
  const videoId = extractYouTubeId(videoIdOrUrl) ?? videoIdOrUrl;
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    throw new Error(`Invalid YouTube video ID: ${videoIdOrUrl}`);
  }

  const attempts = [
    () => fetchViaPlus(videoId, "en"),
    () => fetchViaPlus(videoId),
    () => fetchViaLegacy(videoId, "en"),
    () => fetchViaLegacy(videoId),
  ];

  for (const attempt of attempts) {
    try {
      const text = await attempt();
      if (text.trim()) return text;
    } catch {
      // Try the next fetch strategy.
    }
  }

  const metadata = await fetchYouTubeMetadata(videoId);
  if (metadata.trim()) return metadata;

  throw new Error(`Transcript unavailable for video ${videoId}`);
}

export async function fetchYouTubeTranscriptsForMessage(
  text: string,
  maxLength = 40000,
): Promise<string> {
  const ids = extractYouTubeIds(text);
  if (ids.length === 0) return "";

  const parts: string[] = [];
  for (const id of ids) {
    try {
      const transcript = await fetchYouTubeTranscriptText(id);
      parts.push(`[YouTube Video ID: ${id}]\nTranscript:\n${transcript.slice(0, maxLength)}`);
    } catch {
      parts.push(`[YouTube Video ID: ${id}]\nNote: Transcript unavailable.`);
    }
  }
  return parts.join("\n\n");
}
