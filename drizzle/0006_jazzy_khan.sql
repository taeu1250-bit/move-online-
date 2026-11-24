ALTER TABLE `notices` ADD `dismissedAt` text;
--> statement-breakpoint
DROP TRIGGER chat_close_on_operation;
--> statement-breakpoint
CREATE TRIGGER chat_close_on_operation AFTER UPDATE OF state ON match_operations
WHEN json_extract(NEW.state,'$.cancelledAt') IS NOT NULL
  OR json_extract(NEW.state,'$.invalidated')=1
  OR (json_extract(NEW.state,'$.startedAt') IS NOT NULL
      AND NEW.updatedAt>=json_extract(NEW.state,'$.startedAt')+7200000)
BEGIN
  UPDATE chat_rooms SET closedAt=COALESCE(json_extract(NEW.state,'$.cancelledAt'),NEW.updatedAt),
    closeReason=CASE WHEN json_extract(NEW.state,'$.cancelledAt') IS NOT NULL THEN 'cancelled' ELSE 'expired' END,
    announcement=NULL
  WHERE matchId=NEW.matchId AND closedAt IS NULL;
END;
--> statement-breakpoint
DROP TRIGGER chat_close_on_finish;
