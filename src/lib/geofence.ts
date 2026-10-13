// Pure geofence logic (no browser APIs), shared by locationNav.ts and unit tested.

export const DEFAULT_RADIUS_M = 100;
export const RADIUS_OPTIONS_M = [100, 200, 300, 500] as const;

export function normalizeRadius(v: unknown): number {
	return typeof v === 'number' && (RADIUS_OPTIONS_M as readonly number[]).includes(v) ? v : DEFAULT_RADIUS_M;
}

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const R = 6371000;
	const dLat = (lat2 - lat1) * Math.PI / 180;
	const dLng = (lng2 - lng1) * Math.PI / 180;
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type GeoList = { id: string; locationLat?: number | null; locationLng?: number | null };

/** The list whose location is nearest to the position and within radiusM, or null. Ties keep the first list. */
export function pickNearestList<T extends GeoList>(
	lists: T[],
	lat: number,
	lng: number,
	radiusM: number,
	isDisabled: (listId: string) => boolean = () => false
): T | null {
	let best: T | null = null;
	let bestDistance = Infinity;
	for (const l of lists) {
		if (l.locationLat == null || l.locationLng == null || isDisabled(l.id)) continue;
		const d = haversineDistance(lat, lng, l.locationLat, l.locationLng);
		if (d <= radiusM && d < bestDistance) {
			best = l;
			bestDistance = d;
		}
	}
	return best;
}
