CREATE TABLE `oidc_login_requests` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`nonce` text NOT NULL,
	`code_verifier` text NOT NULL,
	`return_to` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
DROP TABLE `auth_throttle`;--> statement-breakpoint
ALTER TABLE `workspace_owner` DROP COLUMN `password_hash`;