import { describe, expect, it } from 'vitest';
import { DEFAULT_RADIUS_M, normalizeRadius, pickNearestList } from '$lib/geofence';

// 0.001 deg of latitude is about 111 m
const here = { lat: 45.0, lng: 6.0 };
const at = (id: string, dLat: number, extra = {}) => ({ id, locationLat: here.lat + dLat, locationLng: here.lng, ...extra });

describe('geofence', () => {
	it('picks the nearest list when two are in range, whatever their order', () => {
		const far = at('far', 0.0008); // ~89 m
		const near = at('near', 0.0003); // ~33 m
		expect(pickNearestList([far, near], here.lat, here.lng, 100)?.id).toBe('near');
		expect(pickNearestList([near, far], here.lat, here.lng, 100)?.id).toBe('near');
	});

	it('respects the radius', () => {
		const l = at('a', 0.002); // ~222 m
		expect(pickNearestList([l], here.lat, here.lng, 100)).toBeNull();
		expect(pickNearestList([l], here.lat, here.lng, 300)?.id).toBe('a');
	});

	it('skips lists without a location and disabled lists', () => {
		const lists = [{ id: 'nolocation' }, at('off', 0.0001), at('on', 0.0004)];
		expect(pickNearestList(lists, here.lat, here.lng, 100, (id) => id === 'off')?.id).toBe('on');
	});

	it('normalizes the radius setting', () => {
		expect(normalizeRadius(300)).toBe(300);
		expect(normalizeRadius(250)).toBe(DEFAULT_RADIUS_M);
		expect(normalizeRadius(undefined)).toBe(DEFAULT_RADIUS_M);
		expect(normalizeRadius('500')).toBe(DEFAULT_RADIUS_M);
	});
});
