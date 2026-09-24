CREATE TABLE `legacy_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`payload_hash` text NOT NULL,
	`deck_ids` text NOT NULL,
	`created_at` integer NOT NULL
);
