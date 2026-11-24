CREATE TABLE `chat_messages` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nonce` text NOT NULL,
	`matchId` text NOT NULL,
	`senderId` text NOT NULL,
	`body` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`matchId`) REFERENCES `chat_rooms`(`matchId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`senderId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_message_nonce` ON `chat_messages` (`nonce`);--> statement-breakpoint
CREATE INDEX `chat_room_sequence` ON `chat_messages` (`matchId`,`seq`);--> statement-breakpoint
CREATE INDEX `chat_sender_time` ON `chat_messages` (`senderId`,`at`);--> statement-breakpoint
CREATE TABLE `chat_rooms` (
	`matchId` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL,
	`closedAt` integer,
	`closeReason` text,
	`announcement` text,
	FOREIGN KEY (`matchId`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TRIGGER chat_delete_on_close AFTER UPDATE OF closedAt ON chat_rooms
WHEN NEW.closedAt IS NOT NULL
BEGIN
  DELETE FROM chat_messages WHERE matchId=NEW.matchId;
  UPDATE chat_rooms SET announcement=NULL WHERE matchId=NEW.matchId;
END;
--> statement-breakpoint
CREATE TRIGGER chat_close_on_operation AFTER UPDATE OF state ON match_operations
WHEN json_extract(NEW.state,'$.startedAt') IS NOT NULL
  OR json_extract(NEW.state,'$.cancelledAt') IS NOT NULL
  OR json_extract(NEW.state,'$.endedAt') IS NOT NULL
  OR json_extract(NEW.state,'$.invalidated')=1
BEGIN
  UPDATE chat_rooms SET closedAt=COALESCE(json_extract(NEW.state,'$.startedAt'),json_extract(NEW.state,'$.cancelledAt'),json_extract(NEW.state,'$.endedAt'),NEW.updatedAt),
    closeReason=CASE WHEN json_extract(NEW.state,'$.cancelledAt') IS NOT NULL THEN 'cancelled' ELSE 'started' END,
    announcement=NULL
  WHERE matchId=NEW.matchId AND closedAt IS NULL;
END;
--> statement-breakpoint
CREATE TRIGGER chat_close_on_cancel AFTER UPDATE OF cancelledAt ON matches
WHEN NEW.cancelledAt IS NOT NULL
BEGIN
  UPDATE chat_rooms SET closedAt=unixepoch()*1000,closeReason='cancelled',announcement=NULL
  WHERE matchId=NEW.id AND closedAt IS NULL;
END;
--> statement-breakpoint
CREATE TRIGGER chat_close_on_finish AFTER UPDATE OF endAt ON matches
WHEN unixepoch(NEW.endAt)<=unixepoch()
BEGIN
  UPDATE chat_rooms SET closedAt=unixepoch()*1000,closeReason='ended',announcement=NULL
  WHERE matchId=NEW.id AND closedAt IS NULL;
END;
