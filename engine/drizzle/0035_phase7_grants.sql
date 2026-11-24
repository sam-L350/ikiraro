ALTER TABLE "allocation_rounds" ADD COLUMN "formula" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE TABLE "ranking_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"body" jsonb NOT NULL,
	"recorded_by_user_id" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "ranking_snapshots_round" ON "ranking_snapshots" USING btree ("round_id", "recorded_at");--> statement-breakpoint
ALTER TABLE "ranking_snapshots" ADD CONSTRAINT "ranking_snapshots_round_id_allocation_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."allocation_rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_snapshots" ADD CONSTRAINT "ranking_snapshots_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "committee_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"decided_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "committee_decisions_decision" CHECK ("decision" in ('awarded', 'declined')),
	CONSTRAINT "committee_decisions_reason" CHECK (char_length(btrim("reason")) between 1 and 400)
);--> statement-breakpoint
CREATE UNIQUE INDEX "committee_decisions_application" ON "committee_decisions" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "committee_decisions_round" ON "committee_decisions" USING btree ("round_id", "created_at");--> statement-breakpoint
ALTER TABLE "committee_decisions" ADD CONSTRAINT "committee_decisions_round_id_allocation_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."allocation_rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_decisions" ADD CONSTRAINT "committee_decisions_application_id_round_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."round_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_decisions" ADD CONSTRAINT "committee_decisions_snapshot_id_ranking_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."ranking_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_decisions" ADD CONSTRAINT "committee_decisions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "hardware_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"decision_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"inventory_id" uuid NOT NULL,
	"recipient_user_id" integer NOT NULL,
	"approved_by_user_id" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"awarded_on" date DEFAULT current_date NOT NULL,
	"handover_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hardware_grants_status" CHECK ("status" in ('active', 'recovered', 'transferred'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "hardware_grants_decision" ON "hardware_grants" USING btree ("decision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hardware_grants_application" ON "hardware_grants" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hardware_grants_active_item" ON "hardware_grants" USING btree ("inventory_id") WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX "hardware_grants_round" ON "hardware_grants" USING btree ("round_id");--> statement-breakpoint
ALTER TABLE "hardware_grants" ADD CONSTRAINT "hardware_grants_decision_id_committee_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."committee_decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardware_grants" ADD CONSTRAINT "hardware_grants_round_id_allocation_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."allocation_rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardware_grants" ADD CONSTRAINT "hardware_grants_application_id_round_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."round_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardware_grants" ADD CONSTRAINT "hardware_grants_inventory_id_hardware_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."hardware_inventory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardware_grants" ADD CONSTRAINT "hardware_grants_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardware_grants" ADD CONSTRAINT "hardware_grants_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
DROP TRIGGER IF EXISTS ranking_snapshots_append_only ON ranking_snapshots;--> statement-breakpoint
CREATE TRIGGER ranking_snapshots_append_only
BEFORE UPDATE OR DELETE ON ranking_snapshots
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();--> statement-breakpoint
DROP TRIGGER IF EXISTS committee_decisions_append_only ON committee_decisions;--> statement-breakpoint
CREATE TRIGGER committee_decisions_append_only
BEFORE UPDATE OR DELETE ON committee_decisions
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();--> statement-breakpoint
CREATE OR REPLACE FUNCTION decide_grant(
	p_round_id uuid,
	p_application_id uuid,
	p_inventory_id uuid,
	p_decider_id integer,
	p_reason text,
	p_idempotency_key text,
	p_ip text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
	v_quantity integer;
	v_district uuid;
	v_user integer;
	v_status text;
	v_center uuid;
	v_item_district uuid;
	v_snapshot uuid;
	v_body jsonb;
	v_formula jsonb;
	v_awarded integer;
	v_reason text;
	v_existing jsonb;
	v_decision uuid;
	v_grant uuid;
	v_result jsonb;
BEGIN
	IF p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) = 0 THEN
		RAISE EXCEPTION 'ikiraro:key';
	END IF;
	v_reason := btrim(coalesce(p_reason, ''));
	IF char_length(v_reason) < 1 OR char_length(v_reason) > 400 THEN
		RAISE EXCEPTION 'ikiraro:reason';
	END IF;

	SELECT quantity, district_id INTO v_quantity, v_district
	FROM allocation_rounds
	WHERE id = p_round_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'ikiraro:missing';
	END IF;

	SELECT response INTO v_existing
	FROM idempotency_keys
	WHERE key = p_idempotency_key
		AND route = 'decide_grant'
		AND actor_key = p_decider_id::text;
	IF FOUND THEN
		RETURN v_existing;
	END IF;

	SELECT user_id INTO v_user
	FROM round_applications
	WHERE id = p_application_id
		AND round_id = p_round_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'ikiraro:missing';
	END IF;

	IF EXISTS (
		SELECT 1 FROM committee_decisions WHERE application_id = p_application_id
	) THEN
		RAISE EXCEPTION 'ikiraro:closed';
	END IF;

	IF p_decider_id = v_user THEN
		RAISE EXCEPTION 'ikiraro:self';
	END IF;
	IF EXISTS (
		SELECT 1 FROM declared_relationships
		WHERE (user_id = p_decider_id AND related_user_id = v_user)
			OR (user_id = v_user AND related_user_id = p_decider_id)
	) THEN
		RAISE EXCEPTION 'ikiraro:relative';
	END IF;
	IF EXISTS (
		SELECT 1
		FROM users mine
		JOIN users decider ON decider.id = p_decider_id
		WHERE mine.id = v_user
			AND mine.guardian_contact IS NOT NULL
			AND btrim(mine.guardian_contact) <> ''
			AND decider.guardian_contact IS NOT NULL
			AND lower(btrim(decider.guardian_contact)) = lower(btrim(mine.guardian_contact))
	) THEN
		RAISE EXCEPTION 'ikiraro:household';
	END IF;

	SELECT id, body INTO v_snapshot, v_body
	FROM ranking_snapshots
	WHERE round_id = p_round_id
	ORDER BY recorded_at DESC
	LIMIT 1;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'ikiraro:rank';
	END IF;
	IF NOT EXISTS (
		SELECT 1
		FROM jsonb_array_elements(coalesce(v_body->'rows', '[]'::jsonb)) elem
		WHERE elem->>'applicationId' = p_application_id::text
	) THEN
		RAISE EXCEPTION 'ikiraro:rank';
	END IF;

	v_formula := v_body->'formula';
	IF v_formula IS NULL OR jsonb_typeof(v_formula->'onePerHousehold') <> 'boolean' THEN
		RAISE EXCEPTION 'ikiraro:formula';
	END IF;
	IF jsonb_typeof(v_formula->'blockActiveGrant') <> 'boolean' THEN
		RAISE EXCEPTION 'ikiraro:formula';
	END IF;

	SELECT status, center_id INTO v_status, v_center
	FROM hardware_inventory
	WHERE id = p_inventory_id
	FOR UPDATE;
	IF NOT FOUND OR v_status <> 'in_stock' THEN
		RAISE EXCEPTION 'ikiraro:stock';
	END IF;
	SELECT s.district_id INTO v_item_district
	FROM learning_centers lc
	JOIN sectors s ON s.id = lc.sector_id
	WHERE lc.id = v_center;
	IF v_item_district IS NULL OR v_item_district <> v_district THEN
		RAISE EXCEPTION 'ikiraro:district';
	END IF;

	SELECT count(*)::int INTO v_awarded
	FROM hardware_grants
	WHERE round_id = p_round_id;
	IF v_awarded >= v_quantity THEN
		RAISE EXCEPTION 'ikiraro:quantity';
	END IF;
	IF v_formula ? 'quota' AND v_awarded >= (v_formula->>'quota')::int THEN
		RAISE EXCEPTION 'ikiraro:quota';
	END IF;
	IF (v_formula->>'blockActiveGrant')::boolean AND EXISTS (
		SELECT 1 FROM hardware_grants
		WHERE recipient_user_id = v_user
			AND status = 'active'
	) THEN
		RAISE EXCEPTION 'ikiraro:active';
	END IF;
	IF (v_formula->>'onePerHousehold')::boolean AND EXISTS (
		SELECT 1
		FROM hardware_grants g
		JOIN users other ON other.id = g.recipient_user_id
		JOIN users mine ON mine.id = v_user
		WHERE g.round_id = p_round_id
			AND (
				(
					mine.guardian_contact IS NOT NULL
					AND btrim(mine.guardian_contact) <> ''
					AND other.guardian_contact IS NOT NULL
					AND lower(btrim(other.guardian_contact)) = lower(btrim(mine.guardian_contact))
				)
				OR EXISTS (
					SELECT 1 FROM declared_relationships r
					WHERE r.kind = 'household'
						AND (
							(r.user_id = v_user AND r.related_user_id = g.recipient_user_id)
							OR (r.user_id = g.recipient_user_id AND r.related_user_id = v_user)
						)
				)
			)
	) THEN
		RAISE EXCEPTION 'ikiraro:one-household';
	END IF;

	INSERT INTO committee_decisions (
		round_id, application_id, snapshot_id, decision, reason, decided_by_user_id
	) VALUES (
		p_round_id, p_application_id, v_snapshot, 'awarded', v_reason, p_decider_id
	) RETURNING id INTO v_decision;

	INSERT INTO hardware_grants (
		decision_id, round_id, application_id, inventory_id,
		recipient_user_id, approved_by_user_id, status
	) VALUES (
		v_decision, p_round_id, p_application_id, p_inventory_id,
		v_user, p_decider_id, 'active'
	) RETURNING id INTO v_grant;

	UPDATE hardware_inventory
	SET status = 'awarded'
	WHERE id = p_inventory_id
		AND status = 'in_stock';
	IF NOT FOUND THEN
		RAISE EXCEPTION 'ikiraro:stock';
	END IF;

	INSERT INTO hardware_status_history (
		inventory_id, status, center_id, recorded_by_user_id
	) VALUES (
		p_inventory_id, 'awarded', v_center, p_decider_id
	);

	INSERT INTO domain_events (name, payload)
	VALUES ('grant.decided', jsonb_build_object('userId', v_user));

	INSERT INTO system_audit_logs (actor_id, action, target_type, target_id, ip_address, metadata)
	VALUES (
		p_decider_id,
		'grant.decided',
		'hardware_grant',
		v_grant::text,
		p_ip,
		jsonb_build_object('roundId', p_round_id)
	);

	v_result := jsonb_build_object(
		'id', v_grant,
		'decisionId', v_decision,
		'inventoryId', p_inventory_id,
		'recipientId', v_user
	);
	INSERT INTO idempotency_keys (key, actor_key, route, response)
	VALUES (p_idempotency_key, p_decider_id::text, 'decide_grant', v_result);
	RETURN v_result;
END;
$$;
