// Geofence-Helper: prüft GPS und gibt die ID einer passenden Liste zurück.
// Event-Listener-Registrierung passiert im resumeOrchestrator, nicht hier —
// dieses Modul ist reine Logik.

import { getOfflineLists } from '$lib/sync/manager';
import { userSettings } from '$lib/userSettings.svelte';
import { pickNearestList } from '$lib/geofence';

const SESSION_KEY = 'groly_loc_nav_done';

function getCurrentPosition(): Promise<GeolocationPosition> {
	return new Promise((resolve, reject) => {
		navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 30000 });
	});
}

export function resetLocationNavSession() {
	try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

export async function findGeofenceMatch(): Promise<string | null> {
	if (!userSettings.locationNavEnabled) return null;
	if (!('geolocation' in navigator)) return null;
	try {
		if (sessionStorage.getItem(SESSION_KEY)) return null;
		sessionStorage.setItem(SESSION_KEY, '1');
	} catch { /* ignore */ }

	let pos: GeolocationPosition;
	try {
		pos = await getCurrentPosition();
	} catch {
		return null;
	}
	const { latitude, longitude } = pos.coords;

	const lists = await getOfflineLists();
	const match = pickNearestList(
		lists,
		latitude,
		longitude,
		userSettings.locationNavRadiusM,
		(id) => userSettings.isListLocationDisabled(id)
	);
	return match?.id ?? null;
}
