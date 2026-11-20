CREATE TABLE `match_operations` (
	`matchId` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`state` text NOT NULL,
	`mutation` text NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`matchId`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `operation_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`matchId` text NOT NULL,
	`actor` text,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`matchId`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `operation_audit_match` ON `operation_audit` (`matchId`,`at`);--> statement-breakpoint
CREATE TABLE `participant_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`caseId` text NOT NULL,
	`reporter` text NOT NULL,
	`reason` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`caseId`) REFERENCES `report_cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reporter`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_once_per_case` ON `participant_reports` (`caseId`,`reporter`);--> statement-breakpoint
CREATE TABLE `report_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`matchId` text NOT NULL,
	`targetId` text NOT NULL,
	`category` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`reason` text,
	`reviewer` text,
	`appeal` text,
	`appealedAt` integer,
	`resolvedAt` integer,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`matchId`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`targetId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_case_subject` ON `report_cases` (`matchId`,`targetId`,`category`);