// Tracks item changes that are on their way to the server, so a screen that reads server-side counts right after
// (the home screen after toggling or adding an item) can wait for them instead of showing stale numbers.
const inFlight = new Set<Promise<unknown>>();

/** Registers a mutation promise; it is dropped from the set once settled (success or failure). */
export function trackMutation<T>(promise: Promise<T>): Promise<T> {
	inFlight.add(promise);
	const done = () => { inFlight.delete(promise); };
	promise.then(done, done);
	return promise;
}

/** Resolves when every mutation tracked so far has settled, or after timeoutMs, whichever comes first. Never rejects. */
export async function settleMutations(timeoutMs = 3000): Promise<void> {
	if (inFlight.size === 0) return;
	let timer: ReturnType<typeof setTimeout> | undefined;
	await Promise.race([
		Promise.allSettled([...inFlight]),
		new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs); })
	]);
	if (timer) clearTimeout(timer);
}

export function pendingMutationCount(): number {
	return inFlight.size;
}
