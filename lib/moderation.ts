// Blocklist of slurs/offensive terms not allowed in posts or comments.
// Word-boundary matched so it won't false-positive on substrings inside other words.
const BLOCKED_WORDS = [
  'nigger',
  'nigga',
  'niggas',
  'niggers',
  'retard',
  'retarded',
  'faggot',
  'fag',
  'spic',
  'chink',
  'kike',
  'tranny',
  'whore',
  'slut',
  'cunt',
  // general profanity (distinct from the slurs above, same word-boundary matching)
  'fuck',
  'fucking',
  'fucked',
  'motherfucker',
  'shit',
  'bullshit',
  'asshole',
  'bastard',
  'dick',
  'piss',
  'bitch',
];

const BLOCKED_PATTERN = new RegExp(`\\b(${BLOCKED_WORDS.join('|')})\\b`, 'i');

export function containsBlockedWords(text: string): boolean {
  return BLOCKED_PATTERN.test(text);
}
