CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`matchId` text NOT NULL,
	`personKey` text NOT NULL,
	`userId` text,
	`status` text NOT NULL,
	`changedAt` integer NOT NULL,
	`mutation` text NOT NULL,
	FOREIGN KEY (`matchId`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_person` ON `attendance` (`matchId`,`personKey`);--> statement-breakpoint
CREATE INDEX `attendance_account` ON `attendance` (`userId`);--> statement-breakpoint
CREATE TABLE `conductEvents` (
	`id` text PRIMARY KEY NOT NULL,
	`matchId` text NOT NULL,
	`userId` text NOT NULL,
	`action` text NOT NULL,
	`delta` integer NOT NULL,
	`source` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`matchId`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_conduct_event` ON `conductEvents` (`source`,`action`);--> statement-breakpoint
CREATE INDEX `conduct_account` ON `conductEvents` (`userId`,`at`);--> statement-breakpoint
CREATE TABLE `generalReports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter` text NOT NULL,
	`targetType` text NOT NULL,
	`targetId` text NOT NULL,
	`reason` text NOT NULL,
	`at` integer NOT NULL,
	`state` text NOT NULL,
	`reviewer` text,
	`result` text,
	`resolvedAt` integer,
	FOREIGN KEY (`reporter`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reports_by_author` ON `generalReports` (`reporter`,`at`);--> statement-breakpoint
CREATE INDEX `reports_by_target` ON `generalReports` (`reporter`,`targetType`,`targetId`);--> statement-breakpoint
CREATE INDEX `reports_pending` ON `generalReports` (`state`,`at`);--> statement-breakpoint
CREATE TABLE `noShows` (
	`id` text PRIMARY KEY NOT NULL,
	`matchId` text NOT NULL,
	`personKey` text NOT NULL,
	`name` text NOT NULL,
	`representativeId` text NOT NULL,
	`subjectId` text,
	`state` text NOT NULL,
	`openedAt` integer NOT NULL,
	`deadline` integer NOT NULL,
	`appeal` text,
	`appealedAt` integer,
	`resolvedBy` text,
	`reason` text,
	`resolvedAt` integer,
	`confirmedAt` integer,
	`mutation` text NOT NULL,
	FOREIGN KEY (`matchId`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`representativeId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subjectId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolvedBy`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_absence_report` ON `noShows` (`matchId`,`personKey`);--> statement-breakpoint
CREATE INDEX `absence_due` ON `noShows` (`state`,`deadline`);--> statement-breakpoint
CREATE INDEX `absence_subject` ON `noShows` (`subjectId`,`state`,`confirmedAt`);--> statement-breakpoint
CREATE TABLE `praises` (
	`id` text PRIMARY KEY NOT NULL,
	`matchId` text NOT NULL,
	`sender` text NOT NULL,
	`recipient` text NOT NULL,
	`reason` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`matchId`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `praise_per_pair` ON `praises` (`matchId`,`sender`,`recipient`);--> statement-breakpoint
CREATE INDEX `praise_for` ON `praises` (`recipient`);--> statement-breakpoint
CREATE TABLE `policy_consents` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`version` text NOT NULL,
	`at` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_policy_version` ON `policy_consents` (`userId`,`version`);--> statement-breakpoint
CREATE TABLE `push_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`matchId` text NOT NULL,
	`deviceId` text NOT NULL,
	`start` text NOT NULL,
	`hours` integer NOT NULL,
	`status` text NOT NULL,
	`at` text NOT NULL,
	FOREIGN KEY (`matchId`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `push_delivery_match` ON `push_deliveries` (`matchId`);--> statement-breakpoint
CREATE TABLE `push_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`subscription` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `push_device_owner` ON `push_devices` (`userId`);--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`teamId` text NOT NULL,
	`userId` text,
	`guestName` text,
	`status` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "team_member_identity" CHECK((status='guest' AND guestName IS NOT NULL AND userId IS NULL)
    OR (status IN ('pending','accepted','declined') AND userId IS NOT NULL AND guestName IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_member_user` ON `team_members` (`teamId`,`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `team_member_guest` ON `team_members` (`teamId`,`guestName`);--> statement-breakpoint
CREATE INDEX `team_inbox` ON `team_members` (`userId`,`status`);--> statement-breakpoint
CREATE TABLE `team_preferences` (
	`userId` text PRIMARY KEY NOT NULL,
	`activeTeamId` text,
	`inviteCode` text,
	FOREIGN KEY (`userId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activeTeamId`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_invite_code` ON `team_preferences` (`inviteCode`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerId` text NOT NULL,
	`name` text NOT NULL,
	`sport` text NOT NULL,
	`affiliation` text DEFAULT '' NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`archivedAt` text,
	FOREIGN KEY (`ownerId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `team_owner` ON `teams` (`ownerId`);--> statement-breakpoint
ALTER TABLE `entries` ADD `teamId` text;--> statement-breakpoint
ALTER TABLE `entries` ADD `memberIds` text;--> statement-breakpoint
ALTER TABLE `entries` ADD `proposedMemberIds` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `hostTeamId` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `homeMemberIds` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `info` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `endAt` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `levels` text;
