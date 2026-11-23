CREATE TABLE "earned_badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"badge_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"verification_id" uuid NOT NULL,
	"entry" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "earned_badges_entry" CHECK ("earned_badges"."entry" in ('awarded', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "point_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"kind" text NOT NULL,
	"reference_type" text NOT NULL,
	"reference_id" text NOT NULL,
	"verification_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "point_transactions_kind" CHECK ("point_transactions"."kind" in ('task_approved', 'module_completed', 'course_completed', 'streak_bonus', 'community_contribution', 'manual_adjustment', 'reversal')),
	CONSTRAINT "point_transactions_amount" CHECK ("point_transactions"."kind" = 'reversal' or "point_transactions"."amount" >= 0),
	CONSTRAINT "point_transactions_reference" CHECK ("point_transactions"."reference_type" in ('submission', 'module', 'course', 'badge', 'adjustment'))
);
--> statement-breakpoint
ALTER TABLE "digital_passports" ADD COLUMN "verified_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "earned_badges" ADD CONSTRAINT "earned_badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earned_badges" ADD CONSTRAINT "earned_badges_badge_id_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earned_badges" ADD CONSTRAINT "earned_badges_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earned_badges" ADD CONSTRAINT "earned_badges_verification_id_submission_verifications_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."submission_verifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_verification_id_submission_verifications_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."submission_verifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "earned_badges_user_badge_entry" ON "earned_badges" USING btree ("user_id","badge_id","entry");--> statement-breakpoint
CREATE INDEX "point_transactions_user_created" ON "point_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "digital_passports" ADD CONSTRAINT "digital_passports_minutes" CHECK ("digital_passports"."verified_minutes" >= 0);--> statement-breakpoint
DROP TRIGGER IF EXISTS point_transactions_append_only ON point_transactions;--> statement-breakpoint
CREATE TRIGGER point_transactions_append_only
BEFORE UPDATE OR DELETE ON point_transactions
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();--> statement-breakpoint
DROP TRIGGER IF EXISTS earned_badges_append_only ON earned_badges;--> statement-breakpoint
CREATE TRIGGER earned_badges_append_only
BEFORE UPDATE OR DELETE ON earned_badges
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();--> statement-breakpoint
CREATE OR REPLACE FUNCTION award_submission(
	p_submission_id uuid,
	p_reviewer_id integer,
	p_note text,
	p_scores jsonb,
	p_idempotency_key text,
	p_ip text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
	v_center uuid;
	v_district uuid;
	v_task uuid;
	v_module uuid;
	v_course uuid;
	v_owner integer;
	v_status text;
	v_enrollment uuid;
	v_version uuid;
	v_threshold integer;
	v_existing jsonb;
	v_note text;
	v_criteria integer := 0;
	v_weighted integer := 0;
	v_weight integer := 0;
	v_score integer;
	v_score_total integer;
	v_snapshot jsonb;
	v_task_points integer := 0;
	v_minutes integer := 0;
	v_module_points integer := 0;
	v_course_points integer := 0;
	v_verification uuid;
	v_passport_minutes integer;
	v_required integer := 0;
	v_done integer := 0;
	v_module_required integer := 0;
	v_module_done integer := 0;
	v_current_required boolean := false;
	v_current_in_module boolean := false;
	v_points integer := 0;
	v_badge_id uuid;
	v_awarded_badge uuid;
	v_rule jsonb;
	v_min_score integer;
	v_min_hours integer;
	v_lowest integer;
	v_missing_score integer;
	v_met boolean := false;
	v_result jsonb;
	v_mod jsonb;
	v_task_json jsonb;
	v_criterion record;
BEGIN
	IF p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) = 0 THEN
		RAISE EXCEPTION 'ikiraro:key';
	END IF;
	v_note := btrim(coalesce(p_note, ''));
	IF char_length(v_note) = 0 THEN
		RAISE EXCEPTION 'ikiraro:note';
	END IF;
	IF p_scores IS NULL THEN
		p_scores := '[]'::jsonb;
	END IF;
	IF jsonb_typeof(p_scores) <> 'array' THEN
		RAISE EXCEPTION 'ikiraro:score';
	END IF;

	SELECT
		ts.status,
		ts.task_id,
		ts.owner_user_id,
		ts.enrollment_id,
		ts.content_version_id,
		e.center_id,
		e.course_id,
		s.district_id,
		t.module_id,
		t.pass_threshold
	INTO
		v_status,
		v_task,
		v_owner,
		v_enrollment,
		v_version,
		v_center,
		v_course,
		v_district,
		v_module,
		v_threshold
	FROM task_submissions ts
	INNER JOIN enrollments e ON e.id = ts.enrollment_id
	INNER JOIN learning_centers lc ON lc.id = e.center_id
	INNER JOIN sectors s ON s.id = lc.sector_id
	INNER JOIN tasks t ON t.id = ts.task_id
	WHERE ts.id = p_submission_id
	FOR UPDATE OF ts;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'ikiraro:missing';
	END IF;

	SELECT response INTO v_existing
	FROM idempotency_keys
	WHERE key = p_idempotency_key
		AND route = 'award_submission'
		AND actor_key = p_reviewer_id::text;
	IF FOUND THEN
		RETURN v_existing;
	END IF;

	IF p_reviewer_id = v_owner THEN
		RAISE EXCEPTION 'ikiraro:self';
	END IF;
	IF EXISTS (
		SELECT 1 FROM declared_relationships
		WHERE (user_id = p_reviewer_id AND related_user_id = v_owner)
			OR (user_id = v_owner AND related_user_id = p_reviewer_id)
	) THEN
		RAISE EXCEPTION 'ikiraro:relative';
	END IF;
	IF NOT (
		EXISTS (
			SELECT 1 FROM center_staff
			WHERE user_id = p_reviewer_id
				AND center_id = v_center
				AND role IN ('trainer', 'center_manager')
		)
		OR EXISTS (
			SELECT 1
			FROM user_roles ur
			INNER JOIN role_permissions rp ON rp.role_id = ur.role_id
			INNER JOIN permissions p ON p.id = rp.permission_id
			WHERE ur.user_id = p_reviewer_id
				AND p.code = 'submission.review'
				AND (
					ur.scope_type = 'global'
					OR (ur.scope_type = 'center' AND ur.scope_id = v_center::text)
					OR (ur.scope_type = 'district' AND ur.scope_id = v_district::text)
				)
		)
	) THEN
		RAISE EXCEPTION 'ikiraro:scope';
	END IF;
	IF v_status NOT IN ('pending', 'in_review') THEN
		RAISE EXCEPTION 'ikiraro:closed';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_scores) elem
		GROUP BY elem->>'criterionId'
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'ikiraro:score';
	END IF;
	FOR v_criterion IN
		SELECT id, weight FROM rubric_criteria WHERE task_id = v_task
	LOOP
		SELECT (elem->>'score')::integer INTO v_score
		FROM jsonb_array_elements(p_scores) elem
		WHERE elem->>'criterionId' = v_criterion.id::text;
		IF v_score IS NULL OR v_score < 0 OR v_score > 100 THEN
			RAISE EXCEPTION 'ikiraro:score';
		END IF;
		v_criteria := v_criteria + 1;
		v_weighted := v_weighted + v_score * v_criterion.weight;
		v_weight := v_weight + v_criterion.weight;
	END LOOP;
	IF v_criteria = 0 THEN
		IF jsonb_array_length(p_scores) > 0 THEN
			RAISE EXCEPTION 'ikiraro:score';
		END IF;
		v_score_total := NULL;
	ELSE
		IF jsonb_array_length(p_scores) <> v_criteria THEN
			RAISE EXCEPTION 'ikiraro:score';
		END IF;
		v_score_total := round(v_weighted::numeric / v_weight)::integer;
		IF v_score_total < v_threshold THEN
			RAISE EXCEPTION 'ikiraro:threshold';
		END IF;
	END IF;

	SELECT snapshot INTO v_snapshot
	FROM content_versions
	WHERE id = v_version;
	IF v_snapshot IS NULL OR jsonb_typeof(v_snapshot->'modules') <> 'array' THEN
		v_snapshot := jsonb_build_object('modules', '[]'::jsonb);
	END IF;
	FOR v_mod IN SELECT value FROM jsonb_array_elements(v_snapshot->'modules')
	LOOP
		IF v_mod->>'id' = v_module::text THEN
			BEGIN
				v_module_points := greatest(coalesce((v_mod->>'points')::integer, 0), 0);
			EXCEPTION WHEN others THEN
				v_module_points := 0;
			END;
		END IF;
		FOR v_task_json IN SELECT value FROM jsonb_array_elements(coalesce(v_mod->'tasks', '[]'::jsonb))
		LOOP
			IF coalesce((v_task_json->>'required')::boolean, true) THEN
				v_required := v_required + 1;
				IF v_mod->>'id' = v_module::text THEN
					v_module_required := v_module_required + 1;
				END IF;
			END IF;
			IF v_task_json->>'id' = v_task::text THEN
				v_current_required := coalesce((v_task_json->>'required')::boolean, true);
				v_current_in_module := v_mod->>'id' = v_module::text;
				BEGIN
					v_task_points := greatest(coalesce((v_task_json->>'points')::integer, 0), 0);
					v_minutes := greatest(coalesce((v_task_json->>'verifiedMinutes')::integer, 0), 0);
				EXCEPTION WHEN others THEN
					v_task_points := 0;
					v_minutes := 0;
				END;
			END IF;
		END LOOP;
	END LOOP;
	BEGIN
		v_course_points := greatest(coalesce((v_snapshot->>'points')::integer, 0), 0);
	EXCEPTION WHEN others THEN
		v_course_points := 0;
	END;

	SELECT count(*)::integer INTO v_done
	FROM task_progress tp
	WHERE tp.enrollment_id = v_enrollment
		AND tp.status = 'complete'
		AND tp.task_id::text IN (
			SELECT task.value->>'id'
			FROM jsonb_array_elements(v_snapshot->'modules') mod,
				jsonb_array_elements(coalesce(mod.value->'tasks', '[]'::jsonb)) task
			WHERE coalesce((task.value->>'required')::boolean, true)
		);
	SELECT count(*)::integer INTO v_module_done
	FROM task_progress tp
	WHERE tp.enrollment_id = v_enrollment
		AND tp.status = 'complete'
		AND tp.task_id::text IN (
			SELECT task.value->>'id'
			FROM jsonb_array_elements(v_snapshot->'modules') mod,
				jsonb_array_elements(coalesce(mod.value->'tasks', '[]'::jsonb)) task
			WHERE mod.value->>'id' = v_module::text
				AND coalesce((task.value->>'required')::boolean, true)
		);

	INSERT INTO submission_verifications (
		submission_id, reviewer_user_id, decision, note, reason_code, score_total
	) VALUES (
		p_submission_id, p_reviewer_id, 'approved', v_note, NULL, v_score_total
	) RETURNING id INTO v_verification;
	INSERT INTO verification_scores (verification_id, criterion_id, score)
	SELECT v_verification, (elem->>'criterionId')::uuid, (elem->>'score')::integer
	FROM jsonb_array_elements(p_scores) elem;

	UPDATE task_submissions
	SET status = 'approved'
	WHERE id = p_submission_id
		AND status IN ('pending', 'in_review');
	IF NOT FOUND THEN
		RAISE EXCEPTION 'ikiraro:closed';
	END IF;

	INSERT INTO task_progress (enrollment_id, task_id, status, completed_at)
	VALUES (v_enrollment, v_task, 'complete', now())
	ON CONFLICT (enrollment_id, task_id)
	DO UPDATE SET status = 'complete', completed_at = coalesce(task_progress.completed_at, now());

	INSERT INTO point_transactions (
		user_id, amount, kind, reference_type, reference_id, verification_id
	) VALUES (
		v_owner, v_task_points, 'task_approved', 'submission', p_submission_id::text, v_verification
	);
	v_points := v_points + v_task_points;

	UPDATE digital_passports
	SET verified_minutes = verified_minutes + v_minutes
	WHERE user_id = v_owner
	RETURNING verified_minutes INTO v_passport_minutes;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'ikiraro:passport';
	END IF;

	IF v_module_required > 0
		AND v_current_required
		AND v_current_in_module
		AND v_module_done + 1 = v_module_required
	THEN
		INSERT INTO module_progress (enrollment_id, module_id, status, completed_at)
		VALUES (v_enrollment, v_module, 'complete', now())
		ON CONFLICT (enrollment_id, module_id)
		DO UPDATE SET status = 'complete', completed_at = coalesce(module_progress.completed_at, now());
		INSERT INTO point_transactions (
			user_id, amount, kind, reference_type, reference_id, verification_id
		) VALUES (
			v_owner, v_module_points, 'module_completed', 'module', v_module::text, v_verification
		);
		v_points := v_points + v_module_points;
	END IF;
	IF v_current_required THEN
		v_done := v_done + 1;
		IF v_current_in_module THEN
			v_module_done := v_module_done + 1;
		END IF;
	END IF;

	IF v_required > 0 AND v_current_required AND v_done = v_required AND (v_done - 1) < v_required THEN
		INSERT INTO point_transactions (
			user_id, amount, kind, reference_type, reference_id, verification_id
		) VALUES (
			v_owner, v_course_points, 'course_completed', 'course', v_course::text, v_verification
		);
		v_points := v_points + v_course_points;
	END IF;

	IF v_snapshot->'badge' IS NOT NULL AND jsonb_typeof(v_snapshot->'badge') = 'object' THEN
		BEGIN
			v_badge_id := (v_snapshot->'badge'->>'id')::uuid;
		EXCEPTION WHEN others THEN
			v_badge_id := NULL;
		END;
		v_rule := v_snapshot->'badge'->'rule';
		v_met := true;
		IF coalesce((v_rule->>'allRequiredTasksApproved')::boolean, true) AND (v_required = 0 OR v_done < v_required) THEN
			v_met := false;
		END IF;
		IF v_rule IS NOT NULL AND jsonb_typeof(v_rule->'minimumScore') = 'number' THEN
			v_min_score := (v_rule->>'minimumScore')::integer;
			SELECT count(*)::integer INTO v_missing_score
			FROM task_submissions ts
			LEFT JOIN submission_verifications sv ON sv.submission_id = ts.id
			WHERE ts.enrollment_id = v_enrollment
				AND ts.status = 'approved'
				AND ts.task_id::text IN (
					SELECT task.value->>'id'
					FROM jsonb_array_elements(v_snapshot->'modules') mod,
						jsonb_array_elements(coalesce(mod.value->'tasks', '[]'::jsonb)) task
					WHERE coalesce((task.value->>'required')::boolean, true)
				)
				AND sv.score_total IS NULL;
			SELECT min(sv.score_total) INTO v_lowest
			FROM task_submissions ts
			INNER JOIN submission_verifications sv ON sv.submission_id = ts.id
			WHERE ts.enrollment_id = v_enrollment
				AND ts.status = 'approved'
				AND sv.score_total IS NOT NULL
				AND ts.task_id::text IN (
					SELECT task.value->>'id'
					FROM jsonb_array_elements(v_snapshot->'modules') mod,
						jsonb_array_elements(coalesce(mod.value->'tasks', '[]'::jsonb)) task
					WHERE coalesce((task.value->>'required')::boolean, true)
				);
			IF v_missing_score > 0 OR v_lowest IS NULL OR v_lowest < v_min_score THEN
				v_met := false;
			END IF;
		END IF;
		IF v_rule IS NOT NULL AND jsonb_typeof(v_rule->'minimumHours') = 'number' THEN
			v_min_hours := (v_rule->>'minimumHours')::integer;
			IF floor(v_passport_minutes / 60.0) < v_min_hours THEN
				v_met := false;
			END IF;
		END IF;
		IF v_met AND v_badge_id IS NOT NULL AND NOT EXISTS (
			SELECT 1 FROM earned_badges
			WHERE user_id = v_owner AND badge_id = v_badge_id AND entry = 'awarded'
		) THEN
			INSERT INTO earned_badges (
				user_id, badge_id, enrollment_id, verification_id, entry
			) VALUES (
				v_owner, v_badge_id, v_enrollment, v_verification, 'awarded'
			);
			v_awarded_badge := v_badge_id;
		END IF;
	END IF;

	v_result := jsonb_build_object(
		'id', v_verification,
		'submissionId', p_submission_id,
		'decision', 'approved',
		'scoreTotal', v_score_total,
		'points', v_points,
		'verifiedMinutes', v_minutes,
		'badgeId', v_awarded_badge
	);
	INSERT INTO domain_events (name, payload)
	VALUES (
		'submission.approved',
		jsonb_build_object(
			'submissionId', p_submission_id,
			'verificationId', v_verification,
			'points', v_points
		)
	);
	IF v_awarded_badge IS NOT NULL THEN
		INSERT INTO domain_events (name, payload)
		VALUES (
			'badge.awarded',
			jsonb_build_object(
				'badgeId', v_awarded_badge,
				'userId', v_owner,
				'verificationId', v_verification
			)
		);
	END IF;
	INSERT INTO system_audit_logs (
		actor_id, action, target_type, target_id, ip_address, metadata
	) VALUES (
		p_reviewer_id,
		'submission.awarded',
		'submission_verification',
		v_verification::text,
		p_ip,
		v_result
	);
	INSERT INTO idempotency_keys (key, actor_key, route, response)
	VALUES (p_idempotency_key, p_reviewer_id::text, 'award_submission', v_result);
	RETURN v_result;
END;
$$;