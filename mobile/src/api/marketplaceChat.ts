import { apiFetch } from './client';

// Marketplace chats are created by the server only after a performer has
// accepted an event request. The endpoint deliberately returns only chats the
// signed-in performer participates in; a client cannot use an id from another
// event to read or send messages here.
export interface MarketplaceChatParticipant {
  id: number;
  name: string;
  photoUrl?: string | null;
}

export interface MarketplaceChatSummary {
  id: number;
  offerId?: number | null;
  requestId?: number | null;
  // `client` is the preferred server shape. The optional aliases allow this
  // native release to stay compatible with existing marketplace naming while
  // the server routes are rolled out.
  client?: MarketplaceChatParticipant | null;
  requester?: MarketplaceChatParticipant | null;
  participant?: MarketplaceChatParticipant | null;
  clientName?: string | null;
  clientPhotoUrl?: string | null;
  eventType?: string | null;
  eventDate?: string | null;
  eventLocation?: string | null;
  lastMessage?: { text?: string | null; createdAt?: string | null } | null;
  lastMessageText?: string | null;
  updatedAt?: string | null;
  unreadCount?: number;
}

export interface MarketplaceChatMessage {
  id: number;
  senderId: number;
  senderName?: string | null;
  text: string;
  createdAt: string;
}

export interface MarketplaceChatDetail extends MarketplaceChatSummary {
  client?: MarketplaceChatParticipant | null;
}

// Required server contract:
// GET  /api/marketplace/chats -> { success, chats: MarketplaceChatSummary[] }
// GET  /api/marketplace/chats/:id/messages -> { success, chat, messages }
// POST /api/marketplace/chats/:id/messages { text } -> { success, message }
// The API should return conversations for accepted offers only and mark them
// read for the signed-in participant when the messages endpoint is fetched.
export function fetchMarketplaceChats() {
  return apiFetch<{ success: true; chats: MarketplaceChatSummary[] }>('/api/marketplace/chats');
}

export function fetchMarketplaceChatMessages(chatId: number) {
  return apiFetch<{ success: true; chat: MarketplaceChatDetail; messages: MarketplaceChatMessage[] }>(`/api/marketplace/chats/${chatId}/messages`);
}

export function sendMarketplaceChatMessage(chatId: number, text: string) {
  return apiFetch<{ success: true; message: MarketplaceChatMessage }>(`/api/marketplace/chats/${chatId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}
