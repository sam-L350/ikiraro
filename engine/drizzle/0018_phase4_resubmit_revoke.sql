CREATE TABLE "verification_revocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verification_id" uuid NOT NULL,
	"actor_user_id" integer NOT NULL,
	"reason" text NOT NULL,
	"suspend_reviewer" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_revocations_verification_id_unique" UNIQUE("verification_id"),
	CONSTRAINT "verification_revocations_reason" CHECK (char_length(btrim("verification_revocations"."reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "user_roles" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "verification_revocations" ADD CONSTRAINT "verification_revocations_verification_id_submission_verifications_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."submission_verifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_revocations" ADD CONSTRAINT "verification_revocations_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
DROP TRIGGER IF EXISTS verification_revocations_append_only ON verification_revocations;--> statement-breakpoint
CREATE TRIGGER verification_revocations_append_only
BEFORE UPDATE OR DELETE ON verification_revocations
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();--> statement-breakpoint
CREATE OR REPLACE FUNCTION reverse_award(
	p_verification_id uuid,
	p_actor_id integer,
	p_reason text,
	p_idempotency_key text,
	p_suspend_reviewer boolean,
	p_ip text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
	v_decision text;
	v_reviewer integer;
	v_submission uuid;
	v_task uuid;
	v_owner integer;
	v_enrollment uuid;
	v_module uuid;
	v_district uuid;
	v_existing jsonb;
	v_reason text;
	v_minutes integer;
	v_have integer;
	v_points integer := 0;
	v_revocation uuid;
	v_badge_revoked boolean := false;
	v_suspended boolean := false;
	v_result jsonb;
BEGIN
	IF p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) = 0 THEN
		RAISE EXCEPTION 'ikiraro:key';
	END IF;
	v_reason := btrim(coalesce(p_reason, ''));
	IF char_length(v_reason) = 0 THEN
		RAISE EXCEPTION 'ikiraro:reason';
	END IF;

	SELECT
		sv.decision,
		sv.reviewer_user_id,
		sv.submission_id,
		ts.task_id,
		ts.owner_user_id,
		ts.enrollment_id,
		t.module_id,
		s.district_id
	INTO
		v_decision,
		v_reviewer,
		v_submission,
		v_task,
		v_owner,
		v_enrollment,
		v_module,
		v_district
	FROM submission_verifications sv
	INNER JOIN task_submissions ts ON ts.id = sv.submission_id
	INNER JOIN tasks t ON t.id = ts.task_id
	INNER JOIN enrollments e ON e.id = ts.enrollment_id
	INNER JOIN learning_centers lc ON lc.id = e.center_id
	INNER JOIN sectors s ON s.id = lc.sector_id
	WHERE sv.id = p_verification_id
	FOR UPDATE OF sv;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'ikiraro:missing';
	END IF;

	SELECT response INTO v_existing
	FROM idempotency_keys
	WHERE key = p_idempotency_key
		AND route = 'reverse_award'
		AND actor_key = p_actor_id::text;
	IF FOUND THEN
		RETURN v_existing;
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM user_roles ur
		INNER JOIN role_permissions rp ON rp.role_id = ur.role_id
		INNER JOIN permissions perm ON perm.id = rp.permission_id
		WHERE ur.user_id = p_actor_id
			AND ur.suspended_at IS NULL
			AND (
				(perm.code = 'admin.manage' AND ur.scope_type = 'global')
				OR (
					perm.code = 'district.manage'
					AND ur.scope_type = 'district'
					AND ur.scope_id = v_district::text
				)
			)
	) THEN
		RAISE EXCEPTION 'ikiraro:scope';
	END IF;

	IF v_decision <> 'approved' THEN
		RAISE EXCEPTION 'ikiraro:decision';
	END IF;
	IF EXISTS (
		SELECT 1 FROM verification_revocations
		WHERE verification_id = p_verification_id
	) THEN
		RAISE EXCEPTION 'ikiraro:closed';
	END IF;

	SELECT (response->>'verifiedMinutes')::integer INTO v_minutes
	FROM idempotency_keys
	WHERE route = 'award_submission'
		AND response->>'id' = p_verification_id::text
	LIMIT 1;
	IF NOT FOUND OR v_minutes IS NULL OR v_minutes < 0 THEN
		RAISE EXCEPTION 'ikiraro:missing';
	END IF;

	SELECT verified_minutes INTO v_have
	FROM digital_passports
	WHERE user_id = v_owner
	FOR UPDATE;
	IF NOT FOUND OR v_have < v_minutes THEN
		RAISE EXCEPTION 'ikiraro:passport';
	END IF;

	INSERT INTO verification_revocations (
		verification_id, actor_user_id, reason, suspend_reviewer
	) VALUES (
		p_verification_id, p_actor_id, v_reason, coalesce(p_suspend_reviewer, false)
	)
	RETURNING id INTO v_revocation;

	SELECT coalesce(sum(-amount), 0)::integer INTO v_points
	FROM point_transactions
	WHERE verification_id = p_verification_id
		AND kind <> 'reversal';
	INSERT INTO point_transactions (
		user_id, amount, kind, reference_type, reference_id, verification_id
	)
	SELECT user_id, -amount, 'reversal', reference_type, reference_id, verification_id
	FROM point_transactions
	WHERE verification_id = p_verification_id
		AND kind <> 'reversal';

	UPDATE digital_passports
	SET verified_minutes = verified_minutes - v_minutes
	WHERE user_id = v_owner;

	UPDATE task_progress
	SET status = 'started', completed_at = NULL
	WHERE enrollment_id = v_enrollment
		AND task_id = v_task;

	IF EXISTS (
		SELECT 1 FROM point_transactions
		WHERE verification_id = p_verification_id
			AND kind = 'module_completed'
	) THEN
		UPDATE module_progress
		SET status = 'started', completed_at = NULL
		WHERE enrollment_id = v_enrollment
			AND module_id = v_module;
	END IF;

	INSERT INTO earned_badges (
		user_id, badge_id, enrollment_id, verification_id, entry
	)
	SELECT user_id, badge_id, enrollment_id, verification_id, 'revoked'
	FROM earned_badges
	WHERE verification_id = p_verification_id
		AND entry = 'awarded';
	IF FOUND THEN
		v_badge_revoked := true;
	END IF;

	IF coalesce(p_suspend_reviewer, false) THEN
		UPDATE user_roles ur
		SET suspended_at = now()
		WHERE ur.user_id = v_reviewer
			AND ur.suspended_at IS NULL
			AND EXISTS (
				SELECT 1
				FROM role_permissions rp
				INNER JOIN permissions perm ON perm.id = rp.permission_id
				WHERE rp.role_id = ur.role_id
					AND perm.code = 'submission.review'
			);
		IF FOUND THEN
			v_suspended := true;
		END IF;
	END IF;

	v_result := jsonb_build_object(
		'id', v_revocation,
		'verificationId', p_verification_id,
		'points', v_points,
		'verifiedMinutes', v_minutes,
		'badgeRevoked', v_badge_revoked,
		'reviewerSuspended', v_suspended
	);
	INSERT INTO domain_events (name, payload)
	VALUES (
		'points.adjusted',
		jsonb_build_object(
			'verificationId', p_verification_id,
			'points', v_points,
			'reason', v_reason
		)
	);
	INSERT INTO system_audit_logs (
		actor_id, action, target_type, target_id, ip_address, metadata
	) VALUES (
		p_actor_id,
		'award.reversed',
		'submission_verification',
		p_verification_id::text,
		p_ip,
		v_result
	);
	INSERT INTO idempotency_keys (key, actor_key, route, response)
	VALUES (p_idempotency_key, p_actor_id::text, 'reverse_award', v_result);
	RETURN v_result;
END;
$$;