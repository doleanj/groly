// Changes made in this fork (doleanj/groly), shown next to upstream's changelog under "My changes".
// Convention: every PR that changes behaviour adds an entry here in the same PR, newest first.
// `version` is the date (add ".2" for a second entry the same day). Use status 'in-progress' or 'planned' to dev-track a change
// that takes longer than one PR, then switch it to 'released' (or drop the status) when it ships.
// Upstream's own changelog stays in changelog.ts and is only touched by merging upstream/main.
export type ForkStatus = 'released' | 'in-progress' | 'planned';

export type ForkChangelogEntry = {
	version: string;
	status?: ForkStatus;
	de: string[];
	en: string[];
};

export const FORK_CHANGELOG: ForkChangelogEntry[] = [
	{
		version: 'planned',
		status: 'planned',
		de: [
			'Preisbeobachtung für Artikel über Web-Watcher mit Preisverlauf und günstigstem Laden',
			'Admin-API für Besitzerwechsel, Mitglieder und Sicherung'
		],
		en: [
			'Price watch for items through Web-watcher, with price history and cheapest store',
			'Admin API for ownership changes, members and backups'
		]
	},
	{
		version: '2026-10-14.5',
		status: 'released',
		de: ['Der Browser bietet keine Übersetzung der App mehr an (sie würde Texte einfrieren, die die App aktualisiert); die Sprache stellst du in Groly ein'],
		en: ['Browsers no longer offer to translate the app (a translated page freezes text the app updates); set the language in Groly instead']
	},
	{
		version: '2026-10-14.4',
		status: 'released',
		de: [
			'Haustier-Log als Kachel mit Katzen-Symbol im Tracker-+-Menü (Anzahl der Woche, direkt zum neuen Eintrag)'
		],
		en: [
			'Pet log as a tile with a cat icon in the Tracker + menu (this week\'s count, straight to a new entry)'
		]
	},
	{
		version: '2026-10-14.3',
		status: 'released',
		de: [
			'Übersichtszähler: nach Änderungen an Artikeln wird beim Zurückkehren auf die Übersicht gewartet, bis der Server sie hat; zusätzliche Aktualisierung beim Zurückholen der App und nach dem Leeren der Offline-Warteschlange'
		],
		en: [
			'Home-screen counters: after item changes, returning to the overview waits until the server has them; also refreshes when the app returns to the front and after the offline queue drains'
		]
	},
	{
		version: '2026-10-14.2',
		status: 'released',
		de: [
			'Weitere englische Übersetzungen: Hinweis zu Benachrichtigungen (Abfrage und Fehlermeldung), Admin-Fehlermeldungen und -Beschriftungen, Suche ohne Treffer, Meditations-Startzeit und Dauer, Import-Meldung'
		],
		en: [
			'More English translations: notification prompt and its error message, admin error messages and labels, empty search results, meditation start time and duration, import message'
		]
	},
	{
		version: '2026-10-14',
		status: 'released',
		de: [
			'Haustier-Log als Katzen-Symbol in den Tracker-Reitern (statt im Seitenmenü)',
			'Änderungsprotokoll mit Auswahl: Groly (Original) oder Meine Änderungen'
		],
		en: [
			'Pet log moved to a cat icon in the Tracker tabs (instead of the side menu)',
			'Changelog with a source selector: Groly (upstream) or My changes'
		]
	},
	{
		version: '2026-10-13.3',
		status: 'released',
		de: [
			'Haustier-Log: gemeinsames Haushaltsprotokoll (z. B. Husten der Katze) mit Zeit, Symptomen, Ort, Aktivität, Medikament und Notiz; CSV-Export',
		],
		en: [
			'Pet log: a shared household log (e.g. the cat coughing) with time, symptoms, place, activity, medicine given and a note; CSV export'
		]
	},
	{
		version: '2026-10-13.2',
		status: 'released',
		de: [
			'Standort: Es öffnet sich die nächstgelegene Liste; Radius einstellbar (100 bis 500 m)'
		],
		en: [
			'Location: the nearest list opens; radius adjustable (100 to 500 m)'
		]
	},
	{
		version: '2026-10-13',
		status: 'released',
		de: [
			'Synology-Chat-Meldungen: neue Artikel und abgeschlossene Listen werden im Chat gemeldet (optional)'
		],
		en: [
			'Synology Chat messages: new items and completed lists are announced in chat (optional)'
		]
	}
];
