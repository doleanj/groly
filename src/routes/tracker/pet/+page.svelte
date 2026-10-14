<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import HamburgerMenu from '$lib/components/HamburgerMenu.svelte';
	import AppBottomNav from '$lib/components/AppBottomNav.svelte';
	import ManageSheetShell from '$lib/components/supplements/ManageSheetShell.svelte';
	import TrackerSectionNav from '$lib/components/supplements/TrackerSectionNav.svelte';
	import { userSettings } from '$lib/userSettings.svelte';
	import { currentLang } from '$lib/i18n.svelte';
	import { toLocalDateKey } from '$lib/dates';

	type HealthEvent = {
		id: string;
		subject: string;
		occurredAt: number;
		symptoms: string[];
		location: string | null;
		activity: string | null;
		medicineGiven: boolean;
		note: string | null;
		createdByUsername: string | null;
	};
	type Suggestions = { subjects: string[]; symptoms: string[]; locations: string[]; activities: string[] };

	let { data } = $props();

	const tr = (en: string, de: string) => (currentLang() === 'en' ? en : de);
	const ACCENT = '#F472B6';
	const SUBJECT_KEY = 'groly_pet_subject';

	let menuOpen = $state(false);
	let loading = $state(true);
	let error = $state('');
	let events = $state<HealthEvent[]>([]);
	let suggestions = $state<Suggestions>({ subjects: [], symptoms: ['cough'], locations: ['living-room'], activities: ['playing'] });
	let subject = $state('');

	// editor sheet
	let sheetOpen = $state(false);
	let editingId = $state<string | null>(null);
	let fSubject = $state('');
	let fWhen = $state('');
	let fSymptoms = $state<string[]>([]);
	let fSymptomInput = $state('');
	let fLocation = $state('');
	let fActivity = $state('');
	let fMedicine = $state(false);
	let fNote = $state('');
	let fClientId = $state('');
	let saving = $state(false);
	let formError = $state('');
	let confirmDelete = $state(false);

	const pad = (n: number) => String(n).padStart(2, '0');
	const toInput = (ms: number) => { const d = new Date(ms); return `${toLocalDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
	const timeOf = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

	const visible = $derived(events.filter((e) => !subject || e.subject === subject));
	const days = $derived.by(() => {
		const groups: { key: string; label: string; items: HealthEvent[] }[] = [];
		for (const e of visible) {
			const key = toLocalDateKey(new Date(e.occurredAt));
			let g = groups[groups.length - 1];
			if (!g || g.key !== key) {
				g = { key, label: new Date(e.occurredAt).toLocaleDateString(currentLang() === 'en' ? 'en-GB' : 'de-DE', { weekday: 'short', day: 'numeric', month: 'short' }), items: [] };
				groups.push(g);
			}
			g.items.push(e);
		}
		return groups;
	});
	const stats = $derived.by(() => {
		const since = Date.now() - 7 * 24 * 3600 * 1000;
		const recent = visible.filter((e) => e.occurredAt >= since);
		return { week: recent.length, medicine: recent.filter((e) => e.medicineGiven).length, last: visible[0]?.occurredAt ?? null };
	});

	function ago(ms: number): string {
		const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
		if (mins < 60) return tr(`${mins} min ago`, `vor ${mins} Min.`);
		const h = Math.round(mins / 60);
		if (h < 48) return tr(`${h} h ago`, `vor ${h} Std.`);
		const d = Math.round(h / 24);
		return tr(`${d} days ago`, `vor ${d} Tagen`);
	}

	async function load() {
		loading = true;
		error = '';
		try {
			const res = await fetch('/api/health-events');
			if (!res.ok) throw new Error(String(res.status));
			const body = await res.json();
			events = body.events;
			suggestions = body.suggestions;
			if (!subject || !suggestions.subjects.includes(subject)) subject = suggestions.subjects[0] ?? '';
		} catch {
			error = tr('Could not load the log (offline?).', 'Log konnte nicht geladen werden (offline?).');
		}
		loading = false;
	}

	function pickSubject(s: string) {
		subject = s;
		try { localStorage.setItem(SUBJECT_KEY, s); } catch { /* optional */ }
	}

	function openNew() {
		editingId = null;
		fSubject = subject;
		fWhen = toInput(Date.now());
		fSymptoms = [];
		fSymptomInput = '';
		fLocation = '';
		fActivity = '';
		fMedicine = false;
		fNote = '';
		fClientId = crypto.randomUUID();
		formError = '';
		confirmDelete = false;
		sheetOpen = true;
	}

	function openEdit(e: HealthEvent) {
		editingId = e.id;
		fSubject = e.subject;
		fWhen = toInput(e.occurredAt);
		fSymptoms = [...e.symptoms];
		fSymptomInput = '';
		fLocation = e.location ?? '';
		fActivity = e.activity ?? '';
		fMedicine = e.medicineGiven;
		fNote = e.note ?? '';
		fClientId = '';
		formError = '';
		confirmDelete = false;
		sheetOpen = true;
	}

	function toggleSymptom(s: string) {
		fSymptoms = fSymptoms.some((x) => x.toLowerCase() === s.toLowerCase())
			? fSymptoms.filter((x) => x.toLowerCase() !== s.toLowerCase())
			: [...fSymptoms, s];
	}
	function addSymptom() {
		const s = fSymptomInput.trim();
		if (s && !fSymptoms.some((x) => x.toLowerCase() === s.toLowerCase())) fSymptoms = [...fSymptoms, s];
		fSymptomInput = '';
	}

	async function save() {
		addSymptom();
		if (!fSubject.trim()) { formError = tr('Please name who it is about (e.g. the cat).', 'Bitte angeben, um wen es geht (z. B. die Katze).'); return; }
		const when = new Date(fWhen).getTime();
		if (!Number.isFinite(when)) { formError = tr('Please set a valid date and time.', 'Bitte gültiges Datum und Uhrzeit setzen.'); return; }
		saving = true;
		formError = '';
		try {
			const res = await fetch(editingId ? `/api/health-events/${editingId}` : '/api/health-events', {
				method: editingId ? 'PUT' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					subject: fSubject, occurredAt: when, symptoms: fSymptoms, location: fLocation, activity: fActivity,
					medicineGiven: fMedicine, note: fNote, ...(editingId ? {} : { clientLogId: fClientId })
				})
			});
			if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? String(res.status));
			pickSubject(fSubject.trim());
			sheetOpen = false;
			await load();
		} catch (e) {
			formError = e instanceof Error ? e.message : String(e);
		}
		saving = false;
	}

	async function remove() {
		if (!editingId) return;
		if (!confirmDelete) { confirmDelete = true; return; }
		saving = true;
		const res = await fetch(`/api/health-events/${editingId}`, { method: 'DELETE' }).catch(() => null);
		saving = false;
		if (res?.ok) { sheetOpen = false; await load(); } else formError = tr('Delete failed.', 'Löschen fehlgeschlagen.');
	}

	function exportCsv() {
		const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
		const rows = [['date', 'time', 'subject', 'symptoms', 'location', 'activity', 'medicine_given', 'note', 'logged_by']];
		for (const e of [...visible].reverse()) {
			const d = new Date(e.occurredAt);
			rows.push([toLocalDateKey(d), timeOf(e.occurredAt), e.subject, e.symptoms.join('; '), e.location ?? '', e.activity ?? '', e.medicineGiven ? 'yes' : 'no', e.note ?? '', e.createdByUsername ?? '']);
		}
		const blob = new Blob(['﻿' + rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `${(subject || 'pet-log').replace(/[^\w-]+/g, '_')}-${toLocalDateKey(new Date())}.csv`;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	onMount(async () => {
		try { subject = localStorage.getItem(SUBJECT_KEY) ?? ''; } catch { /* optional */ }
		await load();
		// opened from the Tracker "+" menu: go straight to the new-event sheet
		if (new URLSearchParams(location.search).get('new') === '1') {
			history.replaceState({}, '', location.pathname);
			openNew();
		}
	});
</script>

<AppHeader title={tr('Pet log', 'Haustier-Log')} onMenuOpen={() => (menuOpen = true)} onBack={() => goto('/tracker')}>
	{#snippet actions()}
		<button onclick={exportCsv} disabled={!visible.length} class="min-h-10 flex-shrink-0 px-2 text-xs font-semibold active:opacity-60 disabled:opacity-30" style="color: {ACCENT}">
			{tr('Export CSV', 'CSV exportieren')}
		</button>
	{/snippet}
</AppHeader>

<HamburgerMenu bind:open={menuOpen} user={data?.user ?? null} />

<div class="px-4 pb-3" style="padding-top: 5.25rem">
	<TrackerSectionNav activeSection="pet" nutritionEnabled={userSettings.nutritionTrackerEnabled} />
</div>

<main class="px-4 pb-32">
	{#if suggestions.subjects.length > 1}
		<div class="flex gap-2 overflow-x-auto pb-3" role="radiogroup" aria-label={tr('Subject', 'Wer')}>
			{#each suggestions.subjects as s (s)}
				<button role="radio" aria-checked={subject === s} onclick={() => pickSubject(s)} class="chip" class:on={subject === s}>{s}</button>
			{/each}
		</div>
	{/if}

	<div class="grid grid-cols-3 gap-2 mb-4">
		<div class="stat"><strong>{stats.week}</strong><span>{tr('last 7 days', 'letzte 7 Tage')}</span></div>
		<div class="stat"><strong>{stats.medicine}</strong><span>💊 {tr('given (7 d)', 'gegeben (7 T.)')}</span></div>
		<div class="stat"><strong>{stats.last ? ago(stats.last) : '–'}</strong><span>{tr('last event', 'letztes Ereignis')}</span></div>
	</div>

	{#if error}
		<p class="text-sm" style="color: var(--color-error)">{error}</p>
	{:else if loading}
		<p class="text-sm" style="color: var(--color-on-surface-variant)">…</p>
	{:else if !visible.length}
		<p class="text-sm leading-relaxed" style="color: var(--color-on-surface-variant)">
			{tr('Nothing logged yet. Tap + to record the first event: when, symptoms, where, what the cat was doing, and whether medicine was given. Everyone on this Groly sees the same log.',
				'Noch nichts erfasst. Mit + das erste Ereignis eintragen: wann, Symptome, wo, was die Katze tat und ob Medizin gegeben wurde. Alle in dieser Groly sehen dasselbe Log.')}
		</p>
	{:else}
		{#each days as g (g.key)}
			<h3 class="text-[11px] font-semibold uppercase tracking-widest mt-4 mb-2" style="color: var(--color-on-surface-variant)">{g.label}</h3>
			<div class="rounded-2xl overflow-hidden" style="background-color: var(--bubble-container-bg); border: 1px solid var(--bubble-container-border)">
				{#each g.items as e, i (e.id)}
					{#if i > 0}<div class="h-px mx-4" style="background-color: var(--color-outline-variant)"></div>{/if}
					<button onclick={() => openEdit(e)} class="w-full text-left px-4 py-3 active:opacity-70">
						<div class="flex items-baseline gap-2">
							<strong class="text-sm tabular-nums" style="color: {ACCENT}">{timeOf(e.occurredAt)}</strong>
							<span class="text-sm font-medium" style="color: var(--color-on-surface)">{e.symptoms.join(', ') || tr('(no symptom)', '(kein Symptom)')}</span>
							{#if e.medicineGiven}<span title={tr('Medicine given', 'Medizin gegeben')}>💊</span>{/if}
						</div>
						<div class="text-xs mt-0.5" style="color: var(--color-on-surface-variant)">
							{[e.location, e.activity].filter(Boolean).join(' · ')}{e.location || e.activity ? ' · ' : ''}{e.subject}{e.createdByUsername ? ` · ${e.createdByUsername}` : ''}
						</div>
						{#if e.note}<div class="text-xs mt-1" style="color: var(--color-on-surface-variant)">{e.note}</div>{/if}
					</button>
				{/each}
			</div>
		{/each}
	{/if}
</main>

<AppBottomNav activeTab="tracker" trackerBack onFabTap={openNew} fabLabel={tr('Log an event', 'Ereignis erfassen')} fabColor={ACCENT} />

{#if sheetOpen}
	<ManageSheetShell accent={ACCENT} title={editingId ? tr('Edit event', 'Ereignis bearbeiten') : tr('New event', 'Neues Ereignis')} onclose={() => (sheetOpen = false)} zIndex={60} {body} {footer} />
{/if}

{#snippet body()}
	<div class="form">
		<label>{tr('Who', 'Wer')}
			<input bind:value={fSubject} maxlength="60" list="pet-subjects" placeholder={tr('e.g. the cat\'s name', 'z. B. Name der Katze')} />
			<datalist id="pet-subjects">{#each suggestions.subjects as s (s)}<option value={s}></option>{/each}</datalist>
		</label>

		<label>{tr('When', 'Wann')}
			<input type="datetime-local" bind:value={fWhen} />
		</label>

		<div>
			<span class="lbl">{tr('Symptoms', 'Symptome')}</span>
			<div class="chips">
				{#each [...new Set([...suggestions.symptoms, ...fSymptoms])] as s (s)}
					<button type="button" class="chip" class:on={fSymptoms.some((x) => x.toLowerCase() === s.toLowerCase())} onclick={() => toggleSymptom(s)}>{s}</button>
				{/each}
			</div>
			<input bind:value={fSymptomInput} maxlength="60" placeholder={tr('Add another symptom, then Enter', 'Weiteres Symptom, dann Enter')}
				onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSymptom(); } }} />
		</div>

		<div>
			<span class="lbl">{tr('Where', 'Wo')}</span>
			<input bind:value={fLocation} maxlength="100" placeholder={tr('Location', 'Ort')} />
			<div class="chips">{#each suggestions.locations.slice(0, 6) as s (s)}<button type="button" class="chip" class:on={fLocation === s} onclick={() => (fLocation = s)}>{s}</button>{/each}</div>
		</div>

		<div>
			<span class="lbl">{tr('What the cat was doing', 'Was die Katze tat')}</span>
			<input bind:value={fActivity} maxlength="100" placeholder={tr('Activity', 'Aktivität')} />
			<div class="chips">{#each suggestions.activities.slice(0, 6) as s (s)}<button type="button" class="chip" class:on={fActivity === s} onclick={() => (fActivity = s)}>{s}</button>{/each}</div>
		</div>

		<label class="row">
			<input type="checkbox" bind:checked={fMedicine} />
			<span>💊 {tr('Medicine given', 'Medizin gegeben')}</span>
		</label>

		<label>{tr('Note', 'Notiz')}
			<textarea bind:value={fNote} maxlength="1000" rows="2"></textarea>
		</label>

		{#if formError}<p class="text-xs" style="color: var(--color-error)">{formError}</p>{/if}
	</div>
{/snippet}

{#snippet footer()}
	<div class="footer-row">
		{#if editingId}
			<button type="button" class="btn danger" onclick={remove} disabled={saving}>{confirmDelete ? tr('Tap again to delete', 'Nochmal tippen zum Löschen') : tr('Delete', 'Löschen')}</button>
		{/if}
		<button type="button" class="btn primary" onclick={save} disabled={saving}>{tr('Save', 'Speichern')}</button>
	</div>
{/snippet}

<style>
	.chip { flex: none; min-height: 32px; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 600; background: var(--color-surface-container); color: var(--color-on-surface-variant); }
	.chip.on { background: #F472B6; color: #1a0a12; }
	.stat { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 6px; border-radius: 16px; background: var(--bubble-container-bg); border: 1px solid var(--bubble-container-border); text-align: center; }
	.stat strong { font-size: 15px; color: var(--color-on-surface); }
	.stat span { font-size: 10px; color: var(--color-on-surface-variant); }
	.form { display: flex; flex-direction: column; gap: 12px; padding: 4px 2px 8px; }
	.form label, .lbl { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: var(--color-on-surface-variant); }
	.form input:not([type='checkbox']), .form textarea { width: 100%; box-sizing: border-box; min-height: 40px; padding: 8px 12px; border-radius: 12px; font-size: 14px; background: var(--color-surface-container); color: var(--color-on-surface); border: 1px solid transparent; }
	.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
	.row { flex-direction: row !important; align-items: center; gap: 10px !important; font-size: 14px !important; color: var(--color-on-surface) !important; }
	.row input { width: 20px; height: 20px; accent-color: #F472B6; }
	.footer-row { display: flex; gap: 8px; width: 100%; }
	.btn { flex: 1 1 auto; min-height: 44px; border-radius: 14px; font-size: 14px; font-weight: 700; }
	.btn.primary { background: #F472B6; color: #1a0a12; }
	.btn.danger { flex: none; padding: 0 16px; color: var(--color-error); background: var(--color-surface-container); }
	.btn:disabled { opacity: .5; }
</style>
