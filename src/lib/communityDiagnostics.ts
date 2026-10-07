type DiagnosticStage = 'PRESIGN' | 'LOCAL_FILE' | 'S3_PUT' | 'POST_CREATE' | 'POST_CHANGE' | 'CLEANUP' | 'REGISTER';
type DiagnosticDetails = {
  method?: string; path?: string; imageIndex?: number; status?: number; responseBody?: string; requestId?: string;
  signedHeaders?: string; contentType?: string; bodyType?: string; bodySize?: number;
  canonicalRequestPresent?: boolean; actualContentTypePresent?: boolean;
  actualMethod?: string; actualContentType?: string; actualSignedHeaders?: string;
};

// Error bodies can echo credentials or a signed request. Never log raw errors/URLs.
export function sanitizeCommunityDiagnostic(value: string): string {
  return value
    .replace(/<(AWSAccessKeyId|AccessKeyId|SecretAccessKey|SecurityToken|SessionToken|Credential|Credentials|SignatureProvided|StringToSign|StringToSignBytes|CanonicalRequest|CanonicalRequestBytes)>[\s\S]*?<\/\1>/gi, '<$1>[REDACTED]</$1>')
    .replace(/("(?:access[_-]?token|refresh[_-]?token|upload[_-]?token|upload[_-]?url|authorization|(?:aws[_-]?)?(?:access[_-]?key[_-]?id|secret[_-]?(?:access[_-]?)?key|session[_-]?token)|credentials?|x[_-]?amz[_-]?(?:credential|signature|security[_-]?token)|password|signature)"\s*:\s*)"(?:\\.|[^"\\])*"/gi, '$1"[REDACTED]"')
    .replace(/https?:[\\/]{2,}[^\s"'<>]+/gi, '[URL REDACTED]')
    .replace(/Bearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[AWS KEY REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[TOKEN REDACTED]')
    .replace(/((?:X-Amz-(?:Credential|Signature|Security-Token)|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN)\s*[=:]\s*)[^\s&"'<>]+/gi, '$1[REDACTED]')
    .slice(0, 4096);
}

export async function readCommunityErrorBody(response: Response): Promise<string> {
  try { return sanitizeCommunityDiagnostic(await response.text()); }
  catch { return '[Response body unavailable]'; }
}

export function describeS3Put(uploadUrl: string, bytes: ArrayBuffer): DiagnosticDetails {
  let signedHeaders: string | undefined;
  try {
    const value = new URL(uploadUrl).searchParams.get('X-Amz-SignedHeaders');
    if (value && /^[a-z0-9-]+(?:;[a-z0-9-]+)*$/.test(value)) signedHeaders = value;
  } catch { /* A malformed URL is still reported by the existing PUT failure path. */ }
  return { signedHeaders, contentType: 'image/webp', bodyType: 'ArrayBuffer', bodySize: bytes.byteLength };
}

export async function readS3PutError(response: Response): Promise<DiagnosticDetails> {
  try {
    const rawBody = await response.text();
    // Project only safe canonical request fields; redact the full canonical request/query/signature.
    const canonical = /<CanonicalRequest>([\s\S]*?)<\/CanonicalRequest>/i.exec(rawBody)?.[1]
      .replace(/&#(?:x0*a|0*10);/gi, '\n').replace(/&#(?:x0*d|0*13);/gi, '\r')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/\r\n?/g, '\n');
    const actualMethod = canonical?.split('\n')[0].trim();
    const contentTypeHeader = /^content-type:([^\n]*)$/im.exec(canonical ?? '');
    const actualContentType = contentTypeHeader?.[1].trim();
    const actualSignedHeaders = canonical?.split('\n').map((line) => line.trim())
      .find((line) => /^(?:host|[a-z0-9-]+(?:;[a-z0-9-]+)+)$/.test(line));
    return {
      responseBody: sanitizeCommunityDiagnostic(rawBody),
      canonicalRequestPresent: canonical !== undefined,
      actualContentTypePresent: canonical !== undefined ? contentTypeHeader !== null : undefined,
      actualMethod: actualMethod && /^[A-Z]{3,10}$/.test(actualMethod) ? actualMethod : undefined,
      actualContentType: actualContentType === '' ? '' : actualContentType
        && /^[a-z0-9.+-]+\/[a-z0-9.+-]+(?:\s*;\s*[a-z0-9.+-]+=[a-z0-9.+_-]+)*$/i.test(actualContentType)
        ? actualContentType : undefined,
      actualSignedHeaders,
    };
  } catch { return { responseBody: '[Response body unavailable]' }; }
}

export function logCommunityError(stage: DiagnosticStage, details: DiagnosticDetails, error: unknown): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const diagnostic: Record<string, string | number | boolean | undefined> = { stage, ...details };
  diagnostic.errorMessage = error instanceof Error ? error.message : 'Unknown error';
  for (const key of Object.keys(diagnostic)) {
    const value = diagnostic[key];
    if (typeof value === 'string') diagnostic[key] = sanitizeCommunityDiagnostic(value);
  }
  console.error('[COMMUNITY]', diagnostic);
}
