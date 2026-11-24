CREATE OR REPLACE FUNCTION ikiraro_keep_review_time()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	raw text;
BEGIN
	raw := current_setting('ikiraro.reviewed_at', true);
	IF raw IS NOT NULL AND char_length(btrim(raw)) > 0 THEN
		NEW.decided_at := btrim(raw)::timestamptz;
	END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS submission_verifications_review_time ON submission_verifications;
--> statement-breakpoint
CREATE TRIGGER submission_verifications_review_time
BEFORE INSERT ON submission_verifications
FOR EACH ROW
EXECUTE FUNCTION ikiraro_keep_review_time();
