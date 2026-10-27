ALTER TABLE `requests` ADD `peer` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `requests` ADD `country` text;--> statement-breakpoint
ALTER TABLE `requests` ADD `country_name` text;--> statement-breakpoint
ALTER TABLE `requests` ADD `city` text;--> statement-breakpoint
ALTER TABLE `requests` ADD `lat` real;--> statement-breakpoint
ALTER TABLE `requests` ADD `lon` real;--> statement-breakpoint
CREATE INDEX `ix_requests_country_ts` ON `requests` (`country`,`ts`);