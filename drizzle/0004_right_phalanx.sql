CREATE TABLE `team_invite_links` (
	`id` text PRIMARY KEY NOT NULL,
	`teamId` text NOT NULL,
	`createdBy` text NOT NULL,
	`tokenHash` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`usedBy` text,
	`usedAt` integer,
	`usedMutation` text,
	`revokedAt` integer,
	FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`createdBy`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`usedBy`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invite_link_hash` ON `team_invite_links` (`tokenHash`);