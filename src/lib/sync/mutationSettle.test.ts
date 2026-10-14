import { afterEach, describe, expect, it, vi } from 'vitest';
import { pendingMutationCount, settleMutations, trackMutation } from '$lib/sync/mutationSettle';

afterEach(() => { vi.useRealTimers(); });

describe('mutation settling', () => {
	it('resolves immediately when nothing is in flight', async () => {
		await expect(settleMutations()).resolves.toBeUndefined();
	});

	it('waits for a tracked mutation and then forgets it', async () => {
		let release!: () => void;
		const p = trackMutation(new Promise<void>((r) => { release = r; }));
		expect(pendingMutationCount()).toBe(1);
		let settled = false;
		const waiting = settleMutations().then(() => { settled = true; });
		await Promise.resolve();
		expect(settled).toBe(false);
		release();
		await p;
		await waiting;
		expect(settled).toBe(true);
		expect(pendingMutationCount()).toBe(0);
	});

	it('does not reject when a mutation fails, and still clears it', async () => {
		const failing = trackMutation(Promise.reject(new Error('network')));
		await expect(settleMutations()).resolves.toBeUndefined();
		await failing.catch(() => undefined);
		expect(pendingMutationCount()).toBe(0);
	});

	it('gives up after the timeout so a hung request cannot freeze the screen', async () => {
		vi.useFakeTimers();
		trackMutation(new Promise<void>(() => { /* never settles */ }));
		let done = false;
		const waiting = settleMutations(1000).then(() => { done = true; });
		await vi.advanceTimersByTimeAsync(999);
		expect(done).toBe(false);
		await vi.advanceTimersByTimeAsync(2);
		await waiting;
		expect(done).toBe(true);
	});
});
