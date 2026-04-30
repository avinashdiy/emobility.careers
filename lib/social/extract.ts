/**
 * Shared hashtag/mention extraction. Used by post creation, comment
 * indexing, answer indexing, and any future surface that needs to
 * pick @-mentions or #-hashtags out of free text.
 *
 * Both regexes look for the marker preceded by start-of-string OR
 * whitespace so we don't pick up email addresses (foo@bar.com),
 * markdown anchors (#section-2), or URL fragments. The capture is
 * limited to lower-case alphanumerics + dash/underscore — same shape
 * as a slug — so we can safely use the captured strings as identifiers
 * without further normalisation.
 */

const HASHTAG_RE = /(?:^|\s)#([a-z0-9][a-z0-9_-]{1,30})/gi;
const MENTION_RE = /(?:^|\s)@([a-z0-9][a-z0-9_-]{1,30})/gi;

/** Extract up to 10 unique hashtags from a body string. */
export function extractHashtags(body: string): string[] {
  const tags = new Set<string>();
  let m;
  while ((m = HASHTAG_RE.exec(body))) tags.add(m[1].toLowerCase());
  return [...tags].slice(0, 10);
}

/** Extract up to 20 unique mention handles from a body string. */
export function extractMentions(body: string): string[] {
  const set = new Set<string>();
  let m;
  while ((m = MENTION_RE.exec(body))) set.add(m[1].toLowerCase());
  return [...set].slice(0, 20);
}
