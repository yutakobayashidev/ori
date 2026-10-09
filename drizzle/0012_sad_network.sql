ALTER TABLE `activities` ADD `read_at` integer;
UPDATE `activities` SET `read_at` = `created_at`;
