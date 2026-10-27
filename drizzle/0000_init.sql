CREATE TABLE `domains` (
	`domain` text PRIMARY KEY NOT NULL,
	`service` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `log_cursor` (
	`path` text PRIMARY KEY NOT NULL,
	`ino` text NOT NULL,
	`offset` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `minute_stats` (
	`minute` integer NOT NULL,
	`domain` text NOT NULL,
	`c2` integer DEFAULT 0 NOT NULL,
	`c3` integer DEFAULT 0 NOT NULL,
	`c4` integer DEFAULT 0 NOT NULL,
	`c5` integer DEFAULT 0 NOT NULL,
	`dur_sum` real DEFAULT 0 NOT NULL,
	PRIMARY KEY(`minute`, `domain`)
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` integer PRIMARY KEY NOT NULL,
	`ts` integer NOT NULL,
	`domain` text NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`route` text NOT NULL,
	`status` integer NOT NULL,
	`dur` real NOT NULL,
	`size` integer NOT NULL,
	`ip` text NOT NULL,
	`ua` text DEFAULT '' NOT NULL,
	`proto` text DEFAULT '' NOT NULL,
	`scheme` text DEFAULT '' NOT NULL,
	`router` text DEFAULT '' NOT NULL,
	`service` text DEFAULT '' NOT NULL,
	`upstream` text DEFAULT '' NOT NULL,
	`entrypoint` text DEFAULT '' NOT NULL,
	`overhead` real DEFAULT 0 NOT NULL,
	`origin` real DEFAULT 0 NOT NULL,
	`req_id` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ix_requests_ts` ON `requests` (`ts`);--> statement-breakpoint
CREATE INDEX `ix_requests_domain_ts` ON `requests` (`domain`,`ts`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
