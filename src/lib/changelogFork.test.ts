import { describe, expect, it } from 'vitest';
import { FORK_CHANGELOG } from '$lib/changelogFork';

describe('fork changelog', () => {
	it('has unique versions and matching de/en entries', () => {
		const versions = FORK_CHANGELOG.map((e) => e.version);
		expect(new Set(versions).size).toBe(versions.length);
		for (const e of FORK_CHANGELOG) {
			expect(e.de.length, e.version).toBeGreaterThan(0);
			expect(e.de.length, e.version).toBe(e.en.length);
			for (const line of [...e.de, ...e.en]) expect(line.trim().length, e.version).toBeGreaterThan(0);
		}
	});

	it('uses only known statuses', () => {
		for (const e of FORK_CHANGELOG) {
			expect([undefined, 'released', 'in-progress', 'planned']).toContain(e.status);
		}
	});

	it('lists dev-track entries (in progress, planned) before released ones', () => {
		const firstReleased = FORK_CHANGELOG.findIndex((e) => e.status === 'released');
		const lastOpen = FORK_CHANGELOG.map((e) => e.status).lastIndexOf('planned');
		expect(firstReleased).toBeGreaterThan(lastOpen);
	});
});
