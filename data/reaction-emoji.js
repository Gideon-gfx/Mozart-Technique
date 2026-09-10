// The five reactions available on any chat message, shared by every chat
// surface (lesson chat, group chat, org chat) so the allowed set only ever
// needs to change in one place.
const REACTIONS = [
  { key: 'like', emoji: '👍', label: 'Like' },
  { key: 'love', emoji: '❤️', label: 'Love' },
  { key: 'laugh', emoji: '😂', label: 'Laugh' },
  { key: 'sad', emoji: '😢', label: 'Sad' },
  { key: 'thanks', emoji: '🙏', label: 'Thanks' },
];

const ALLOWED_EMOJI = new Set(REACTIONS.map((r) => r.emoji));

function isValidReaction(emoji) {
  return ALLOWED_EMOJI.has(emoji);
}

module.exports = { REACTIONS, isValidReaction };
