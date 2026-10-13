CREATE TABLE `health_events` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`symptoms` text DEFAULT '[]' NOT NULL,
	`location` text,
	`activity` text,
	`medicine_given` integer DEFAULT false NOT NULL,
	`note` text,
	`created_by` text,
	`client_log_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `health_events_occurred_at_idx` ON `health_events` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `health_events_subject_idx` ON `health_events` (`subject`);--> statement-breakpoint
CREATE UNIQUE INDEX `health_events_client_log_id_unique` ON `health_events` (`created_by`,`client_log_id`);