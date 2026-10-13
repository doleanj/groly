import { env } from '$env/dynamic/private';
import { sendChatEvent, type ChatConfig, type ChatEvent } from './chatNotify';

/** Configured through GROLY_CHAT_URL (bridge base URL), GROLY_CHAT_CLIENT and GROLY_CHAT_SECRET; all three unset = feature off. */
function chatConfig(): ChatConfig | null {
	const { GROLY_CHAT_URL: url, GROLY_CHAT_CLIENT: client, GROLY_CHAT_SECRET: secret, ORIGIN: origin } = env;
	return url && client && secret ? { url, client, secret, origin } : null;
}

export function postChatEvent(event: ChatEvent): void {
	void sendChatEvent(chatConfig(), event);
}
