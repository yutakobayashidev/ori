CREATE TABLE `beeper_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL,
	`account_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`data` text NOT NULL,
	`observed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `beeper_media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL,
	`source_uri` text NOT NULL,
	`observed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `beeper_message_sends` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`activity_id` text NOT NULL,
	`target_id` text NOT NULL,
	`account_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`actual_chat_id` text,
	`body` text NOT NULL,
	`reply_to_message_id` text,
	`draft_hash` text NOT NULL,
	`expected_revision` integer NOT NULL,
	`state` text NOT NULL,
	`pending_message_id` text,
	`message_id` text,
	`error_code` text,
	`upstream_status` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `beeper_message_sends_request_id_unique` ON `beeper_message_sends` (`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `beeper_send_draft_claim` ON `beeper_message_sends` (`activity_id`,`expected_revision`,`draft_hash`);--> statement-breakpoint
CREATE TABLE `beeper_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL,
	`account_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`message_id` text NOT NULL,
	`data` text NOT NULL,
	`observed_at` integer NOT NULL
);
