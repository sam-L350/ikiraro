CREATE TABLE "point_caps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"daily_cap" integer NOT NULL,
	"photo_cap" integer NOT NULL,
	"file_cap" integer NOT NULL,
	"note_cap" integer NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "point_caps_version_unique" UNIQUE("version"),
	CONSTRAINT "point_caps_daily" CHECK ("point_caps"."daily_cap" >= 0 and "point_caps"."daily_cap" <= 1000000),
	CONSTRAINT "point_caps_photo" CHECK ("point_caps"."photo_cap" >= 0 and "point_caps"."photo_cap" <= 1000000),
	CONSTRAINT "point_caps_file" CHECK ("point_caps"."file_cap" >= 0 and "point_caps"."file_cap" <= 1000000),
	CONSTRAINT "point_caps_note" CHECK ("point_caps"."note_cap" >= 0 and "point_caps"."note_cap" <= 1000000)
);
--> statement-breakpoint
CREATE TABLE "point_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"points" integer NOT NULL,
	"weight" integer NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "point_rules_target" CHECK ("point_rules"."target_type" in ('task', 'module', 'course')),
	CONSTRAINT "point_rules_points" CHECK ("point_rules"."points" >= 0 and "point_rules"."points" <= 1000000),
	CONSTRAINT "point_rules_weight" CHECK ("point_rules"."weight" >= 1 and "point_rules"."weight" <= 1000)
);
--> statement-breakpoint
ALTER TABLE "point_transactions" ADD COLUMN "rule_id" uuid;--> statement-breakpoint
ALTER TABLE "point_transactions" ADD COLUMN "uncapped_amount" integer;--> statement-breakpoint
ALTER TABLE "point_caps" ADD CONSTRAINT "point_caps_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_rules" ADD CONSTRAINT "point_rules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "point_rules_target_version" ON "point_rules" USING btree ("target_type","target_id","version");--> statement-breakpoint
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_rule_id_point_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."point_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_uncapped" CHECK ("point_transactions"."uncapped_amount" is null or "point_transactions"."uncapped_amount" >= 0);
--> statement-breakpoint
DROP TRIGGER IF EXISTS point_rules_append_only ON point_rules;
CREATE TRIGGER point_rules_append_only
BEFORE UPDATE OR DELETE ON point_rules
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS point_caps_append_only ON point_caps;
CREATE TRIGGER point_caps_append_only
BEFORE UPDATE OR DELETE ON point_caps
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ikiraro_cap_points(
	p_user_id integer,
	p_amount integer,
	p_evidence text
) RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
	v_daily integer;
	v_photo integer;
	v_file integer;
	v_note integer;
	v_today integer;
	v_type_today integer;
	v_type_cap integer;
	v_room integer;
	v_allowed integer;
	v_day date;
BEGIN
	v_allowed := greatest(coalesce(p_amount, 0), 0);
	SELECT daily_cap, photo_cap, file_cap, note_cap
	INTO v_daily, v_photo, v_file, v_note
	FROM point_caps
	ORDER BY version DESC
	LIMIT 1;
	IF NOT FOUND THEN
		RETURN v_allowed;
	END IF;
	v_day := (now() AT TIME ZONE 'Africa/Kigali')::date;
	SELECT coalesce(sum(amount), 0)::integer INTO v_today
	FROM point_transactions
	WHERE user_id = p_user_id
		AND kind <> 'reversal'
		AND (created_at AT TIME ZONE 'Africa/Kigali')::date = v_day;
	v_room := v_daily - coalesce(v_today, 0);
	IF v_room < 0 THEN
		v_room := 0;
	END IF;
	IF v_allowed > v_room THEN
		v_allowed := v_room;
	END IF;
	IF p_evidence IS NULL THEN
		RETURN v_allowed;
	END IF;
	v_type_cap := CASE p_evidence
		WHEN 'photo' THEN v_photo
		WHEN 'file' THEN v_file
		WHEN 'note' THEN v_note
		ELSE NULL
	END;
	IF v_type_cap IS NULL THEN
		RETURN v_allowed;
	END IF;
	SELECT coalesce(sum(pt.amount), 0)::integer INTO v_type_today
	FROM point_transactions pt
	INNER JOIN task_submissions ts ON ts.id::text = pt.reference_id
	WHERE pt.user_id = p_user_id
		AND pt.kind = 'task_approved'
		AND pt.reference_type = 'submission'
		AND ts.evidence_type = p_evidence
		AND (pt.created_at AT TIME ZONE 'Africa/Kigali')::date = v_day;
	v_room := v_type_cap - coalesce(v_type_today, 0);
	IF v_room < 0 THEN
		v_room := 0;
	END IF;
	IF v_allowed > v_room THEN
		v_allowed := v_room;
	END IF;
	RETURN v_allowed;
END;
$$;
--> statement-breakpoint
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
	v_evidence text;
	v_task_rule uuid;
	v_module_rule uuid;
	v_course_rule uuid;
	v_uncapped integer;
	v_scaled integer;
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
		t.pass_threshold,
		ts.evidence_type
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
		v_threshold,
		v_evidence
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


	SELECT id, points * weight INTO v_task_rule, v_scaled
	FROM point_rules
	WHERE target_type = 'task' AND target_id = v_task
	ORDER BY version DESC
	LIMIT 1;
	IF FOUND THEN
		v_task_points := greatest(v_scaled, 0);
	END IF;
	v_uncapped := v_task_points;
	v_task_points := ikiraro_cap_points(v_owner, v_uncapped, v_evidence);

	SELECT id, points * weight INTO v_module_rule, v_scaled
	FROM point_rules
	WHERE target_type = 'module' AND target_id = v_module
	ORDER BY version DESC
	LIMIT 1;
	IF FOUND THEN
		v_module_points := greatest(v_scaled, 0);
	END IF;

	SELECT id, points * weight INTO v_course_rule, v_scaled
	FROM point_rules
	WHERE target_type = 'course' AND target_id = v_course
	ORDER BY version DESC
	LIMIT 1;
	IF FOUND THEN
		v_course_points := greatest(v_scaled, 0);
	END IF;

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
		user_id, amount, kind, reference_type, reference_id, verification_id, rule_id, uncapped_amount
	) VALUES (
		v_owner, v_task_points, 'task_approved', 'submission', p_submission_id::text, v_verification, v_task_rule, v_uncapped
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
		v_uncapped := v_module_points;
		v_module_points := ikiraro_cap_points(v_owner, v_uncapped, NULL);
		INSERT INTO point_transactions (
			user_id, amount, kind, reference_type, reference_id, verification_id, rule_id, uncapped_amount
		) VALUES (
			v_owner, v_module_points, 'module_completed', 'module', v_module::text, v_verification, v_module_rule, v_uncapped
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
		v_uncapped := v_course_points;
		v_course_points := ikiraro_cap_points(v_owner, v_uncapped, NULL);
		INSERT INTO point_transactions (
			user_id, amount, kind, reference_type, reference_id, verification_id, rule_id, uncapped_amount
		) VALUES (
			v_owner, v_course_points, 'course_completed', 'course', v_course::text, v_verification, v_course_rule, v_uncapped
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
--> statement-breakpoint
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
		user_id, amount, kind, reference_type, reference_id, verification_id, rule_id
	)
	SELECT user_id, -amount, 'reversal', reference_type, reference_id, verification_id, rule_id
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
