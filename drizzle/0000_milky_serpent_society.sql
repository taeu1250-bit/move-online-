CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`matchId` text NOT NULL,
	`userId` text NOT NULL,
	`team` text,
	`roster` text NOT NULL,
	`note` text NOT NULL,
	`status` text NOT NULL,
	`at` text NOT NULL,
	`mutation` text NOT NULL,
	FOREIGN KEY (`matchId`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "entry_status_enum" CHECK(status in ('pending','approved','rejected','cancelled','unselected'))
);
--> statement-breakpoint
CREATE INDEX `entry_status` ON `entries` (`matchId`,`status`);--> statement-breakpoint
CREATE INDEX `entry_user` ON `entries` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_user_application` ON `entries` (`matchId`,`userId`) WHERE status in ('pending','approved');--> statement-breakpoint
CREATE UNIQUE INDEX `one_team_application` ON `entries` (`matchId`,`team`) WHERE team is not null and status in ('pending','approved');--> statement-breakpoint
CREATE UNIQUE INDEX `one_opponent` ON `entries` (`matchId`) WHERE team is not null and status='approved';--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`hostId` text NOT NULL,
	`kind` text NOT NULL,
	`sport` text NOT NULL,
	`title` text NOT NULL,
	`venue` text NOT NULL,
	`start` text NOT NULL,
	`capacity` integer NOT NULL,
	`existing` integer NOT NULL,
	`fee` integer NOT NULL,
	`level` text NOT NULL,
	`description` text NOT NULL,
	`createdAt` text NOT NULL,
	`homeTeam` text,
	`homeRoster` text NOT NULL,
	`cancelledAt` text,
	`mutation` text,
	FOREIGN KEY (`hostId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "capacity_bounds" CHECK("matches"."capacity" between 2 and 30 and "matches"."existing" between 1 and "matches"."capacity")
);
--> statement-breakpoint
CREATE INDEX `match_start` ON `matches` (`start`);--> statement-breakpoint
CREATE INDEX `match_host` ON `matches` (`hostId`);--> statement-breakpoint
CREATE TABLE `notices` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient` text NOT NULL,
	`matchId` text NOT NULL,
	`text` text NOT NULL,
	`at` text NOT NULL,
	`seen` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`recipient`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`matchId`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notice_inbox` ON `notices` (`recipient`,`at`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`year` integer NOT NULL
);
