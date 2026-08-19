const URL_REGEX = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?[^\s"'<>]*/i;

export function parseStartupUrl(output: string): string | null {
  const match = output.match(URL_REGEX);
  if (!match) return null;
  return match[0].replace("0.0.0.0", "localhost");
}
