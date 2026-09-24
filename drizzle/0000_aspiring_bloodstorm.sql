CREATE TABLE `connection_credentials` (
	`connection_id` text PRIMARY KEY NOT NULL,
	`encrypted_token` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`origin` text NOT NULL,
	`account_id` text,
	`relay_profile` text,
	`display_name` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connections_account` ON `connections` (`platform`,`origin`,`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `connections_relay_profile` ON `connections` (`origin`,`relay_profile`);--> statement-breakpoint
CREATE TABLE `deck_columns` (
	`id` text NOT NULL,
	`deck_id` text NOT NULL,
	`position` integer NOT NULL,
	`connection_id` text NOT NULL,
	`title` text NOT NULL,
	`source` text NOT NULL,
	PRIMARY KEY(`deck_id`, `id`),
	FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "deck_columns_valid_position" CHECK("deck_columns"."position" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deck_columns_position` ON `deck_columns` (`deck_id`,`position`);--> statement-breakpoint
CREATE TABLE `decks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "decks_positive_revision" CHECK("decks"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE `oauth_apps` (
	`id` text PRIMARY KEY NOT NULL,
	`origin` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`scopes` text NOT NULL,
	`client_id` text NOT NULL,
	`encrypted_client_secret` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_apps_configuration` ON `oauth_apps` (`origin`,`redirect_uri`,`scopes`);--> statement-breakpoint
CREATE TABLE `oauth_attempts` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`browser_hash` text NOT NULL,
	`app_id` text NOT NULL,
	`encrypted_verifier` text NOT NULL,
	`connection_id` text,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	FOREIGN KEY (`app_id`) REFERENCES `oauth_apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade
);
