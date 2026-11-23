ALTER TABLE "task_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_submissions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "task_submissions_subject" ON "task_submissions"
	AS PERMISSIVE
	FOR ALL
	TO PUBLIC
	USING (
		current_setting('app.rls', true) IS DISTINCT FROM 'on'
		OR current_setting('app.rls_scope', true) = 'staff'
		OR "owner_user_id" = NULLIF(current_setting('app.user_id', true), '')::integer
	)
	WITH CHECK (
		current_setting('app.rls', true) IS DISTINCT FROM 'on'
		OR current_setting('app.rls_scope', true) = 'staff'
		OR "owner_user_id" = NULLIF(current_setting('app.user_id', true), '')::integer
	);--> statement-breakpoint
ALTER TABLE "consents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "consents" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "consents_subject" ON "consents"
	AS PERMISSIVE
	FOR ALL
	TO PUBLIC
	USING (
		current_setting('app.rls', true) IS DISTINCT FROM 'on'
		OR current_setting('app.rls_scope', true) = 'staff'
		OR "user_id" = NULLIF(current_setting('app.user_id', true), '')::integer
	)
	WITH CHECK (
		current_setting('app.rls', true) IS DISTINCT FROM 'on'
		OR current_setting('app.rls_scope', true) = 'staff'
		OR "user_id" = NULLIF(current_setting('app.user_id', true), '')::integer
	);--> statement-breakpoint
ALTER TABLE "digital_passports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "digital_passports" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "digital_passports_subject" ON "digital_passports"
	AS PERMISSIVE
	FOR ALL
	TO PUBLIC
	USING (
		current_setting('app.rls', true) IS DISTINCT FROM 'on'
		OR current_setting('app.rls_scope', true) = 'staff'
		OR "user_id" = NULLIF(current_setting('app.user_id', true), '')::integer
	)
	WITH CHECK (
		current_setting('app.rls', true) IS DISTINCT FROM 'on'
		OR current_setting('app.rls_scope', true) = 'staff'
		OR "user_id" = NULLIF(current_setting('app.user_id', true), '')::integer
	);
