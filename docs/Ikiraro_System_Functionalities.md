# Ikiraro: System Functionalities

Version 3.0 (build-ready functional blueprint)
Author: Samuel NIZEYIMANA, with design review and extensions

This document replaces the functional scope in SRS v2.0. It keeps your original ideas where they were strong, removes or reworks the weak ones (see Section 12), and adds what an enterprise-grade, donor-fundable, auditable platform needs.

---

## 0. How to read this document

**Priority tags**

- **[M]** Must have: the platform is not usable or not trustworthy without it.
- **[S]** Should have: strong value, build right after the core.
- **[C]** Could have: build when the foundations are stable.

**ID convention**: `FR-<MODULE>-<NN>` for functional requirements, `BR-<NN>` for business rules, `NFR-<AREA>-<NN>` for non-functional requirements.

**Release phases** are in Section 10. A requirement's tag is its importance. The phase is when you build it.

---

## 1. Product vision and design principles

**What Ikiraro really is.** Ikiraro is not a course website. It is a **trust and allocation system**: it converts real-world practice in rural communities into verified, portable proof of skill, and uses that proof to decide, fairly and visibly, who receives mentorship, referrals and donated equipment. The learning content is the input. The verified record and the fair allocation are the product.

**Principles that drive every decision**

1. **Evidence over claims.** Nothing is credited until a person with the right authority has verified real work.
2. **Fairness must be provable.** Every allocation decision can be explained and audited by an outsider.
3. **Works where the network doesn't.** Offline-first and low-bandwidth are core, not extras.
4. **Low literacy is a primary user case.** Audio, icons, local language and assisted use are first-class.
5. **Shared devices are normal.** Sessions, privacy and quick logout are designed around community PCs.
6. **Trust is attackable.** Plan for cheating, collusion and favoritism from day one.
7. **Impact is measured, not assumed.** The system tracks what happens after a learner earns a badge or a device.

---

## 2. Actors and roles

The ERD has `roles` and `user_roles`, so roles are data, not hard-coded. Seed these roles and scope each one to a geography or center.

| Role | Description | Scope |
|---|---|---|
| **Learner** | Takes courses, submits evidence, builds a passport, may apply for hardware. | Own data only |
| **Trainer** | Runs sessions at a center and reviews evidence. | Assigned center(s) |
| **Center Manager** | Runs a learning center: schedules, devices, attendance, trainers. | Own center |
| **District Coordinator** | Oversees centers in a district, handles escalations, nominates hardware candidates. | District |
| **Content Author** | Writes and translates courses, tasks and rubrics. | Content only |
| **Content Reviewer** | Approves content before it is published. | Content only |
| **Hardware Officer** | Manages inventory, handover and recovery of equipment. | Hardware module |
| **Allocation Committee Member** | Votes on hardware awards where human review is required. | Assigned rounds |
| **Auditor / Donor Viewer** | Read-only access to aggregated impact, allocation records and audit trails. | Read-only, no personal data by default |
| **Platform Admin** | Manages users, roles, configuration, integrations. | Whole system |
| **Mentor / Partner** | Verified external person or organization offering mentorship or opportunities. | Opt-in learner connections only |
| **Public Verifier** | Anyone checking a passport link or QR code. | Public verification page only |

**Rule**: a user can hold several roles (as `user_roles` allows), but conflict-of-interest rules in Section 8 apply across roles.

---

## 3. Module overview

| # | Module | Purpose |
|---|---|---|
| 1 | Identity, access and security | Accounts, authentication, roles, sessions |
| 2 | Geography and learning center management | Provinces to centers, trainers, devices, sessions |
| 3 | Content management | Course authoring, translation, versioning, publishing |
| 4 | Learning delivery | Enrollment, progress, offline and assisted learning |
| 5 | Evidence submission | Capture and upload proof of real work |
| 6 | Verification and quality assurance | Trainer review, second review, sampling, appeals |
| 7 | Digital opportunity passport and credentials | Badges, hours, public verification |
| 8 | Merit points and eligibility engine | Ledger, rules, reversals |
| 9 | Hardware and equipment program | Inventory, allocation rounds, handover, recovery |
| 10 | Post-award follow-up and impact tracking | Usage check-ins, outcomes |
| 11 | Mentorship and opportunity matching | Mentors, referrals, opportunities |
| 12 | Notifications and communication | SMS, in-app, email, announcements |
| 13 | Analytics, reporting and exports | Operational and donor reporting |
| 14 | Administration, audit and compliance | Config, audit logs, data protection |
| 15 | Support, feedback and disputes | Help, reports, appeals |
| 16 | Integrations and public API | SMS, storage, verification API, webhooks |
| 17 | Offline and synchronization | Local storage, queued uploads, conflict handling |

---

## 4. Functional requirements

### Module 1: Identity, access and security

Tables: `users`, `roles`, `user_roles`, `system_audit_logs`.

| ID | Requirement | Pri |
|---|---|---|
| FR-IAM-01 | Register with a Rwandan phone number or email. Phone is the primary identifier. Verify with a one-time code (OTP) before activation. | M |
| FR-IAM-02 | Assisted registration: a trainer can register a learner at the center. The learner confirms later by OTP. The record stores who assisted. | M |
| FR-IAM-03 | Login by phone or email plus password, or by phone plus OTP for learners who struggle with passwords. | M |
| FR-IAM-04 | Role-based access control with scope. A permission is a role plus a scope (own data, center, district, global). Enforce on the server for every query and mutation. | M |
| FR-IAM-05 | Shared-device mode: short idle timeout, one-tap logout, no password autofill, and a clear "signed in as" banner. | M |
| FR-IAM-06 | Session management: list active sessions, revoke a session, and force logout of a compromised account. | S |
| FR-IAM-07 | Account recovery by OTP, with rate limits and lockout after repeated failures. | M |
| FR-IAM-08 | Profile: name, location (district, sector, village), economic sector, preferred language, optional photo. | M |
| FR-IAM-09 | Mandatory password change on first login for staff accounts created by an admin. Optional two-factor authentication for staff roles. | S |
| FR-IAM-10 | Learner consent capture at registration: terms, data use, and separate opt-ins for public passport, leaderboard visibility and mentor contact. Store version and timestamp. | M |
| FR-IAM-11 | Minors: if the learner is under 18, require guardian contact and consent. Restrict public visibility and mentor contact by default. | S |
| FR-IAM-12 | Account deactivation and deletion request flow that respects the data protection rules in Section 7. | M |
| FR-IAM-13 | Duplicate account detection (same phone, similar name plus date of birth plus center) with a manual merge tool for admins, logged in the audit trail. | S |

### Module 2: Geography and learning center management

Tables: `provinces`, `districts`, `sectors`, `learning_centers`, `users.center_id`.

| ID | Requirement | Pri |
|---|---|---|
| FR-CEN-01 | Maintain the geography hierarchy (province, district, sector) and learning centers with coordinates and active status. | M |
| FR-CEN-02 | Center directory with a map and search, so learners and partners can find the nearest center. | S |
| FR-CEN-03 | Assign trainers and a manager to a center. A trainer can belong to several centers. | M |
| FR-CEN-04 | Session scheduling: a center creates sessions (topic, course, date, trainer, capacity). Learners can see upcoming sessions. | S |
| FR-CEN-05 | Attendance capture per session, by trainer tick-list or learner QR check-in. Attendance feeds verified hours. | S |
| FR-CEN-06 | Center device register: which computers, tablets and routers the center has, their condition and availability. Learners can book a practice slot. | S |
| FR-CEN-07 | Center health dashboard: active learners, sessions held, submissions waiting, average review time, device uptime. | S |
| FR-CEN-08 | Community tour events: define a temporary pop-up location and sessions, with sign-up and attendance, then link participants to a home center. | C |
| FR-CEN-09 | Center capacity and coverage view for planners: which sectors are underserved. | C |

### Module 3: Content management

Tables: `courses`, `course_translations`, `modules`, `module_tasks`, `badges`.

| ID | Requirement | Pri |
|---|---|---|
| FR-CMS-01 | Authors create courses, modules and tasks. Each task defines instructions in Kinyarwanda and English, the evidence type, and a validation rubric. | M |
| FR-CMS-02 | Translations stored per language (`course_translations`). The system falls back to English when a Kinyarwanda string is missing and flags the gap. | M |
| FR-CMS-03 | Content lifecycle: draft, in review, published, retired. A reviewer must approve before publishing. | M |
| FR-CMS-04 | Content versioning. Learners keep the version they started. Retiring or changing a task must not break completed records. | M |
| FR-CMS-05 | Prerequisites and ordering: a module can require earlier modules. | S |
| FR-CMS-06 | Structured rubrics: criteria with weights and pass thresholds, not free text. Trainers score against them. | M |
| FR-CMS-07 | Rich task media: images, short videos, audio narration and printable job aids, all optimized for low bandwidth. | S |
| FR-CMS-08 | Badge design and rules: a badge is tied to a course (as in `badges`), with the condition that unlocks it (all modules approved, minimum score, minimum hours). | M |
| FR-CMS-09 | Content templates for common task types such as record-keeping, crop log and online service navigation. | C |
| FR-CMS-10 | Learner feedback on content (clarity rating, "too hard" report) that feeds back to authors. | S |
| FR-CMS-11 | Content packs for offline use: a course can be exported as a downloadable bundle for a center without stable connectivity. | S |

### Module 4: Learning delivery

| ID | Requirement | Pri |
|---|---|---|
| FR-LRN-01 | Catalog of published courses filtered by language, category, economic sector and level. | M |
| FR-LRN-02 | Enrollment: self-enroll, or enrolled by a trainer. Enrollment records start date and center. | M |
| FR-LRN-03 | Progress tracking at course, module and task level, with a clear "what to do next" prompt. | M |
| FR-LRN-04 | Language switch at any time without losing place. | M |
| FR-LRN-05 | Low-literacy support: audio instructions for every task, icon-led navigation, large touch targets, and a read-aloud button. | M |
| FR-LRN-06 | Placement check: a short, visual skills check at registration that suggests a starting course. | S |
| FR-LRN-07 | Practice mode: learners can rehearse a task with sample data before doing the real, evidence-bearing task. | C |
| FR-LRN-08 | Reminders for stalled learners ("you are one task from your badge") by SMS or in-app. | S |
| FR-LRN-09 | Learning pathways: ordered course sequences for a goal such as "Run a small shop digitally" or "Plan a farming season". | S |
| FR-LRN-10 | Peer help: learners can ask a question on a task and trainers or advanced learners can answer. Moderated. | C |
| FR-LRN-11 | Group tasks for cooperatives and family businesses, with per-person credit rules. | C |

### Module 5: Evidence submission

Tables: `task_submissions`.

| ID | Requirement | Pri |
|---|---|---|
| FR-SUB-01 | Submit photo (JPEG, PNG, WebP), PDF or short text as evidence for a task. Direct camera capture. Size limit set by configuration (default 10 MB). | M |
| FR-SUB-02 | Client-side compression before upload so a photo uses a fraction of the data. | M |
| FR-SUB-03 | Record metadata: task, learner, attempt number, timestamp, device type, and location if the learner allows it. | M |
| FR-SUB-04 | Resumable and queued uploads: a submission survives a dropped connection and syncs when the network returns. | M |
| FR-SUB-05 | Submission status lifecycle: draft, pending, in review, approved, needs revision, rejected, escalated, withdrawn. | M |
| FR-SUB-06 | Duplicate and reuse detection: flag identical or near-identical images, and images reused across different learners. | S |
| FR-SUB-07 | Image quality gate: warn the learner if the photo is blurry or too dark before they send. | S |
| FR-SUB-08 | Privacy masking: let the learner blur names, phone numbers and ID numbers in a photo before upload. | S |
| FR-SUB-09 | Voice note evidence for learners who struggle to write. Transcript added by the trainer if needed. | C |
| FR-SUB-10 | Resubmission: after "needs revision" the learner sees trainer feedback beside the original and submits a new attempt (see BR-05 for limits). | M |
| FR-SUB-11 | Learner submission history with status and feedback. | M |
| FR-SUB-12 | Withdraw a submission before review begins. | S |

### Module 6: Verification and quality assurance

Tables: `submission_verifications`, `task_submissions`.

This module protects the credibility of the whole platform. If verification can be gamed, passports and hardware awards are worthless.

| ID | Requirement | Pri |
|---|---|---|
| FR-VER-01 | Trainer review queue, filtered by center and sorted by age. Show waiting time and highlight items close to the review deadline. | M |
| FR-VER-02 | Dual-pane review screen: evidence on one side, rubric scoring and feedback on the other. | M |
| FR-VER-03 | Decisions: Approve, Needs Revision (feedback required), Reject (reason required from a fixed list plus a note). | M |
| FR-VER-04 | Record verifier ID, decision, score per rubric criterion, notes and time on every decision (`submission_verifications`). Decisions are immutable. A change creates a new record. | M |
| FR-VER-05 | **Review SLA**: target review time (for example 72 hours). Overdue items escalate to the center manager, then the district coordinator. | S |
| FR-VER-06 | **Conflict-of-interest block**: a trainer cannot review their own submissions, those of family members they have declared, or those from a learner they flagged as a relative. | M |
| FR-VER-07 | **Second review sampling**: a configurable percentage of approvals (higher for new trainers) is re-reviewed by another trainer or coordinator. Disagreements are logged. | S |
| FR-VER-08 | **Trainer quality score**: approval rate, rework rate, average review time and second-review disagreement rate. Outliers are flagged for coaching. | S |
| FR-VER-09 | **In-person verification option** for high-value badges: the trainer confirms they saw the learner do the task, recorded with a location and time check. | S |
| FR-VER-10 | **Appeal**: a learner can appeal a rejection once. A different reviewer decides. | S |
| FR-VER-11 | Bulk actions for obvious cases, such as rejecting spam or approving a batch from a supervised session. All still logged individually. | C |
| FR-VER-12 | Canned feedback library in both languages that a trainer can insert and edit. | S |
| FR-VER-13 | On approval, the system atomically: marks the task complete, writes a point transaction, updates verified hours, and checks badge conditions. If any step fails, none are saved. | M |
| FR-VER-14 | Revocation: an admin or coordinator can revoke an approval found to be fraudulent. Points, hours and badges tied to it are reversed with a logged reason. | M |

### Module 7: Digital opportunity passport and credentials

Tables: `digital_passports`, `earned_badges`, `badges`.

| ID | Requirement | Pri |
|---|---|---|
| FR-PAS-01 | Create one passport per learner at registration. | M |
| FR-PAS-02 | Passport shows verified hours, badges with dates, completed tasks, level and total points. | M |
| FR-PAS-03 | **Public verification page** reached by a share link (`public_share_token`) or QR code. It shows only what the learner has opted to show and states clearly which authority verified each item. | M |
| FR-PAS-04 | The learner controls visibility per item and can turn the public link off or regenerate it. Regenerating invalidates the old token. | M |
| FR-PAS-05 | Downloadable passport card (PDF and image) with a QR code, suitable for printing for a bank, employer or cooperative. | S |
| FR-PAS-06 | **Credential integrity**: each badge award carries a signed record (issuer, verifier, date, hash). A public endpoint confirms a badge is authentic and not revoked. This makes the claim "tamper-proof" honest rather than a slogan. | S |
| FR-PAS-07 | Badge levels (for example Foundation, Practitioner, Advanced) and expiry or renewal for skills that need recency. | C |
| FR-PAS-08 | Skills summary in plain language ("can keep a digital sales ledger") for people who read the passport but never saw the course. | S |
| FR-PAS-09 | Showcase section: the learner can pin up to three best evidence items (with masking applied) as proof of work. | C |
| FR-PAS-10 | Export to portable formats later (for example Open Badges) so credentials work outside Ikiraro. | C |

### Module 8: Merit points and eligibility engine

Tables: `point_transactions`.

| ID | Requirement | Pri |
|---|---|---|
| FR-PTS-01 | Points are an **append-only ledger** of transactions. A balance is always the sum of the ledger. No direct edits. | M |
| FR-PTS-02 | Transaction types: task approved, module completed, course completed, streak bonus, community contribution, manual adjustment, reversal. Each stores a reference to its cause. | M |
| FR-PTS-03 | Configurable point rules per task, module and course, changeable by admins with a version history. | S |
| FR-PTS-04 | Manual adjustments require a reason and a second approver. | M |
| FR-PTS-05 | Reversals are new negative entries, never deletions. | M |
| FR-PTS-06 | Weighting for effort and difficulty, so a hard task is worth more and a trivial one cannot be farmed. Caps per day and per task type. | S |
| FR-PTS-07 | Learner points statement: dated list of every transaction with its reason. | M |
| FR-PTS-08 | Anomaly detection: flag learners whose points rise unusually fast, or whose approvals come from a single reviewer. | S |
| FR-PTS-09 | Eligibility engine evaluates a learner against any program's criteria (points, badges, hours, attendance, district) and returns a pass or fail with the **reason for each criterion**. | M |

### Module 9: Hardware and equipment program

Tables: `hardware_inventory`, `hardware_grants`.

This is the most sensitive part of the system because it moves valuable physical assets. Treat it like a grant program, not a prize board.

| ID | Requirement | Pri |
|---|---|---|
| FR-HW-01 | Inventory register: item, category, serial number, condition, status (in stock, reserved, awarded, in repair, lost, retired), holding center, and donor. | M |
| FR-HW-02 | Each item or category carries its own eligibility criteria (`required_points`, `required_badges_count`, and extra rules such as a specific badge or minimum months of activity). Nothing is hard-coded. | M |
| FR-HW-03 | **Allocation rounds**: an admin or coordinator opens a round for a district with a set number of items, an application window and criteria. | M |
| FR-HW-04 | Learners who meet the criteria can apply, with a short statement of intended use. The eligibility engine checks them automatically. | M |
| FR-HW-05 | **Ranking and review**: eligible applicants are ranked by a transparent, documented formula, then reviewed by a committee for need, intended use and local balance. The final decision records who decided and why. | M |
| FR-HW-06 | Tie-breaking and fairness controls: district quotas, women and youth targets where the program sets them, and a rule against awarding more than one device per household in a round. | S |
| FR-HW-07 | **Public leaderboard (opt-in)**: shows ranks by an alias or initials and district, never full details, and only for learners who opted in. It shows progress toward thresholds, not a winner-takes-all list. | S |
| FR-HW-08 | Grant record: item, recipient, approving admin, committee decision reference, date (`hardware_grants`). | M |
| FR-HW-09 | **Handover workflow**: generate a handover form, collect the recipient's acknowledgment (signature or OTP confirmation), photograph the device and serial number, and record the witness. | M |
| FR-HW-10 | Device custody trail: every status change and location change is logged from donor to recipient. | M |
| FR-HW-11 | Conditions of award: learner agrees to keep practicing, share a short update, and return or transfer the device if abandoned. Stored with the grant. | S |
| FR-HW-12 | Recovery and reassignment: if a device is unused, lost or misused, the officer can start a recovery process and return it to inventory. | S |
| FR-HW-13 | Repair and warranty tracking. | C |
| FR-HW-14 | Donor allocation reporting: for each donated batch, show where each item went and the outcomes. | S |
| FR-HW-15 | Software and licence grants (for donated software), tracked the same way as devices but with seat counts and expiry. | C |
| FR-HW-16 | Controlled exceptions: in rare cases (disability support, disaster), an exception can be made only with two approvers and a written reason, and it appears in the public audit summary. | S |

### Module 10: Post-award follow-up and impact tracking

Most programs fail here. A device that is given and then ignored is the problem the project set out to solve.

| ID | Requirement | Pri |
|---|---|---|
| FR-IMP-01 | Scheduled follow-ups at 30, 90 and 180 days after award: short check-in by SMS or in-app asking if the device is in use and for what. | S |
| FR-IMP-02 | Usage evidence request: a short real-world task completed on the device, reviewed like any submission. | S |
| FR-IMP-03 | Outcome capture: income change, services accessed, jobs or customers gained, self-reported and optionally verified by a trainer. | S |
| FR-IMP-04 | Dormancy alert: if a recipient stops responding or practicing, notify the district coordinator. | S |
| FR-IMP-05 | Baseline and endline survey for each learner (digital confidence, tasks done digitally) to measure change. | S |
| FR-IMP-06 | Success stories: with consent, a learner can add a short story and photo that partners can use. | C |

### Module 11: Mentorship and opportunity matching

This delivers the "mentorship and referrals" part of the original mission.

| ID | Requirement | Pri |
|---|---|---|
| FR-MEN-01 | Mentor and partner onboarding: an admin verifies and approves them. | S |
| FR-MEN-02 | Learners opt in to be discoverable by mentors for chosen skills and districts. | S |
| FR-MEN-03 | Mentor requests and learner acceptance, with a limit on contacts per week. | S |
| FR-MEN-04 | Opportunity board: partners post jobs, apprenticeships, supply contracts and training. Learners see items matching their badges. | C |
| FR-MEN-05 | Referral flow: a trainer or coordinator can recommend a learner. The referral appears on the passport. | C |
| FR-MEN-06 | In-platform messaging between matched mentor and learner, with report and block options. No exchange of contact details until both agree. | C |
| FR-MEN-07 | Safeguarding: mentors who contact minors need extra checks. All messages are retained for review. | S |

### Module 12: Notifications and communication

| ID | Requirement | Pri |
|---|---|---|
| FR-NOT-01 | Channels: in-app, SMS and email. Choose the channel per event type and per user preference. | M |
| FR-NOT-02 | Events: OTP, submission received, review result, revision requested, badge earned, points added, session reminder, grant status, follow-up due. | M |
| FR-NOT-03 | Templates in Kinyarwanda and English, edited by admins without code changes. | S |
| FR-NOT-04 | SMS cost control: batch non-urgent messages, cap per user per day, track spend per center. | S |
| FR-NOT-05 | Center and district announcements. | S |
| FR-NOT-06 | Delivery status tracking and retry for failed messages. | S |
| FR-NOT-07 | Real-time in-app updates (queue changes, badge unlocked) over the live connection. | S |

### Module 13: Analytics, reporting and exports

| ID | Requirement | Pri |
|---|---|---|
| FR-ANA-01 | Operational dashboard per role: learner progress, trainer workload, center health, district comparison. | M |
| FR-ANA-02 | Funnel metrics: registered, enrolled, first submission, first approval, badge, hardware applicant, hardware recipient, still active at 90 days. | M |
| FR-ANA-03 | Quality metrics: review times, rework rate, rejection reasons, trainer score distribution. | S |
| FR-ANA-04 | Equity metrics: participation and award rates by district, gender (if collected with consent), age band and economic sector. | S |
| FR-ANA-05 | **Donor and auditor report pack**: one-click export with totals, allocation decisions, and outcomes, with personal data removed. | S |
| FR-ANA-06 | CSV and PDF export for any table, filtered by the viewer's scope. | S |
| FR-ANA-07 | Scheduled reports emailed to coordinators and partners. | C |
| FR-ANA-08 | Early-warning list: learners likely to drop out, centers with growing backlogs. | C |

### Module 14: Administration, audit and compliance

Tables: `system_audit_logs`.

| ID | Requirement | Pri |
|---|---|---|
| FR-ADM-01 | User management: create, deactivate, reset, merge, assign roles and scope. | M |
| FR-ADM-02 | **Audit log** for all sensitive actions: logins, role changes, decisions, point adjustments, revocations, hardware changes, exports. Stores actor, action, target, entity ID, IP address and metadata. Append-only, and not editable by any role. | M |
| FR-ADM-03 | Audit log search and filters with export. | S |
| FR-ADM-04 | System configuration: thresholds, SLA targets, file limits, point rules, feature flags. All changes are versioned and audited. | M |
| FR-ADM-05 | Data protection tools: consent records, data subject access export, correction, deletion and anonymization. | M |
| FR-ADM-06 | Retention policy settings, such as deleting evidence images after a set period while keeping the decision record. | S |
| FR-ADM-07 | Maker-checker: high-risk admin actions (bulk role change, point adjustment, grant exception) need a second admin. | S |
| FR-ADM-08 | System health page: queue sizes, failed notifications, storage use, error rates. | S |
| FR-ADM-09 | Backup and restore status, with a documented recovery test. | S |

### Module 15: Support, feedback and disputes

| ID | Requirement | Pri |
|---|---|---|
| FR-SUP-01 | In-app help: searchable guides, and short video or audio walkthroughs. | S |
| FR-SUP-02 | Report a problem (technical, content, conduct) with a screenshot, routed to the right owner. | S |
| FR-SUP-03 | Confidential channel to report trainer misconduct, bribery or favoritism, reviewed outside the reporter's center. | M |
| FR-SUP-04 | Ticket tracking with status, owner and response time. | C |
| FR-SUP-05 | Learner satisfaction pulse after key moments (first badge, after a review). | C |
| FR-SUP-06 | Trainer field guide in the app (printable), with tips on common problems. | S |

### Module 16: Integrations and public API

| ID | Requirement | Pri |
|---|---|---|
| FR-INT-01 | SMS gateway integration (OTP and notifications) with failover to a second provider. | M |
| FR-INT-02 | Media storage and delivery integration (Cloudinary or Convex storage) with automatic format and size optimization. | M |
| FR-INT-03 | Email service integration. | S |
| FR-INT-04 | **Public verification API**: look up a passport or badge by token and get an authenticity result. | S |
| FR-INT-05 | Webhooks so partners can be told when a credential or grant event occurs. | C |
| FR-INT-06 | Deep links to the services learners practice on (for example Irembo). The platform links out and never stores third-party credentials. | S |
| FR-INT-07 | Mobile money payment integration only if a later phase adds paid items. Out of scope for v1. | C |

### Module 17: Offline and synchronization

| ID | Requirement | Pri |
|---|---|---|
| FR-OFF-01 | Installable web app (PWA) with cached shell, course content and the learner's own data. | M |
| FR-OFF-02 | Offline actions are queued: draft submissions, attendance marks, progress updates. They sync automatically when the network returns. | M |
| FR-OFF-03 | Sync status is always visible ("3 items waiting to upload") and never silent. | M |
| FR-OFF-04 | Conflict handling: server decisions always win for reviews and points. Learner drafts are merged or the learner is asked. | M |
| FR-OFF-05 | Trainers can review cached submissions offline and sync decisions later, with the original review time preserved. | S |
| FR-OFF-06 | Per-device storage cap and cleanup. Encrypted local storage for personal data on shared devices. | S |
| FR-OFF-07 | Data-saver mode: images and video load only on request. | S |

---

## 5. Non-functional requirements

### Performance and scalability

- **NFR-PERF-01**: First contentful paint under 1.8 s and largest contentful paint under 2.5 s on a 3G profile, measured on a mid-range Android phone.
- **NFR-PERF-02**: Pages usable at 320 px width, with an initial JavaScript payload target under 200 KB for the learner flow.
- **NFR-PERF-03**: Reactive updates visible within 1 s on a typical rural connection under normal load.
- **NFR-PERF-04**: Support at least 5,000 registered learners and 1,000 concurrent connections at launch, with a documented path to 100,000.
- **NFR-PERF-05**: Image uploads compressed on the device so a typical photo is under 400 KB.

### Security

- **NFR-SEC-01**: Authorization is checked on the server for every operation. Never trust the client.
- **NFR-SEC-02**: Passwords hashed with a modern algorithm (Argon2id or bcrypt with a high cost). The `password_hash` column never leaves the server.
- **NFR-SEC-03**: TLS everywhere. Personal data encrypted at rest.
- **NFR-SEC-04**: Rate limiting and lockout on login, OTP and public verification endpoints.
- **NFR-SEC-05**: Input validation and output encoding to prevent injection and XSS. Uploaded files are type-checked and scanned.
- **NFR-SEC-06**: Public share tokens are long, random and revocable.
- **NFR-SEC-07**: Secrets stored in a managed secret store, never in the repository.
- **NFR-SEC-08**: Regular dependency scanning and a documented patch process.
- **NFR-SEC-09**: Evidence images are served through short-lived signed URLs, not public links.

### Privacy and data protection

- **NFR-PRV-01**: Follow Rwanda's personal data protection law (Law No. 058/2021). Have a qualified person confirm the exact obligations before launch, including cross-border storage rules.
- **NFR-PRV-02**: Collect only the data that is needed. Phone, name and location are necessary. Anything else is optional and explained.
- **NFR-PRV-03**: Public views never show phone numbers, exact village or evidence images unless the learner chose to share them.
- **NFR-PRV-04**: Role-scoped access: a trainer sees only their center. Aggregated reports hide small groups (for example fewer than 10) to prevent identification.
- **NFR-PRV-05**: A data breach response plan with notification steps.

### Reliability and recovery

- **NFR-REL-01**: 99.5% availability during operating hours (07:00 to 19:00 CAT).
- **NFR-REL-02**: Atomic multi-step writes for approval, points and badge awarding.
- **NFR-REL-03**: Automated daily backups of data and media, and a tested restore. Target recovery point 24 h and recovery time 8 h.
- **NFR-REL-04**: Idempotent operations so a retried upload or approval cannot double-award points.
- **NFR-REL-05**: Graceful degradation: if SMS or storage is down, the user sees a clear message and queued work is retained.

### Usability and accessibility

- **NFR-UX-01**: WCAG 2.1 AA, touch targets at least 48 px.
- **NFR-UX-02**: Reading level suitable for low literacy, with icons and audio alongside text.
- **NFR-UX-03**: A new learner completes registration and a first task with trainer help in under 15 minutes.
- **NFR-UX-04**: Field-tested System Usability Scale score of at least 75 (80 is the stretch target).
- **NFR-UX-05**: Fully usable in Kinyarwanda. No English-only dead ends.

### Observability and maintainability

- **NFR-OBS-01**: Central error tracking, structured logs and uptime monitoring with alerts.
- **NFR-OBS-02**: Performance monitoring on real devices in the field.
- **NFR-MNT-01**: Full TypeScript, automated tests (unit, integration, end to end for the core flows), a CI pipeline, and separate staging and production environments.
- **NFR-MNT-02**: Database migrations and seed data are scripted and reproducible.
- **NFR-MNT-03**: Feature flags to release features to pilot centers first.

---

## 6. Business rules (revised)

| ID | Rule |
|---|---|
| BR-01 | **Transparent allocation.** Hardware is awarded only through a documented formula plus a recorded committee review. No unlogged decision is allowed. |
| BR-02 | **Controlled exceptions.** Exceptions need two approvers and a written reason, and appear in the audit summary. (This replaces "manual overrides are prohibited", which is not workable in real programs.) |
| BR-03 | **Conflict of interest.** A trainer or committee member cannot review, rank or approve themselves, declared relatives, or anyone in their household. |
| BR-04 | **Immutability.** Verification decisions, point transactions and audit entries are never edited or deleted. Corrections create new records. |
| BR-05 | **Resubmission.** After "needs revision" a learner has up to three further attempts per task. After that the learner must meet a trainer, and the trainer records the outcome. |
| BR-06 | **Independence of review.** At least one in every N approvals (configurable) gets a second review. |
| BR-07 | **Consent first.** Nothing about a learner is public, ranked publicly or shared with a mentor without their opt-in. |
| BR-08 | **Fair limits.** One device per household per round. A recipient who has an active award cannot win another in the same program until follow-up is complete. |
| BR-09 | **Follow-up obligation.** Receiving hardware includes agreeing to follow-up check-ins. Unresponsive recipients trigger a review. |
| BR-10 | **Fraud consequence.** Proven fraud (fake evidence, collusion) leads to revocation of related credit and a documented sanction. Trainer fraud also leads to suspension pending review. |
| BR-11 | **Review deadline.** Pending submissions older than the SLA escalate automatically. |
| BR-12 | **Content integrity.** Content must be approved by a reviewer before it is published. Published content is retired, not deleted. |

---

## 7. Abuse, fraud and risk cases the system must handle

| Risk | Control |
|---|---|
| Learner submits someone else's work or an internet image | Duplicate and reuse detection, trainer in-person verification for key tasks, location check, random spot questions |
| Trainer approves friends or sells approvals | Conflict-of-interest block, second-review sampling, trainer quality score, anonymous misconduct channel |
| Points farming through trivial tasks | Weighting, daily caps, anomaly alerts |
| Fake accounts to win hardware | OTP verification, duplicate detection, one-per-household rule, committee review |
| Device given then resold | Serial number custody trail, handover acknowledgment, follow-up check-ins, recovery process |
| Public leaderboard shames or exposes people | Opt-in only, aliases, progress framing, district grouping |
| Admin abuse of power | Maker-checker, immutable audit log, scoped roles, donor and auditor read access |
| Shared-device account takeover | Short idle timeout, one-tap logout, session revocation |
| Poor network causing lost work | Offline queue, resumable uploads, visible sync status |
| Content out of date or wrong | Review before publish, versioning, learner and trainer feedback loop |
| Data breach of rural users' personal data | Encryption, role scoping, minimal data, breach response plan |

---

## 8. Data model gaps (compared with your current ERD)

Your ERD covers the core well. To support this specification, add or change the following.

**New tables**

| Table | Purpose |
|---|---|
| `enrollments` | Learner to course, start date, center, status |
| `module_progress` / `task_progress` | Track progress per learner |
| `consents` | Consent type, version, timestamp, granted or withdrawn |
| `sessions` and `session_attendance` | Center sessions and who attended |
| `center_staff` | Trainer and manager assignments per center |
| `notifications` and `notification_preferences` | Outbox, delivery status, user preferences |
| `rubric_criteria` and `verification_scores` | Structured scoring per criterion |
| `second_reviews` | Sampled re-reviews and disagreements |
| `appeals` | Appeals against rejection |
| `allocation_rounds`, `round_applications`, `committee_decisions` | Fair hardware program |
| `hardware_status_history` | Custody trail |
| `handover_records` | Acknowledgment, witness, photo |
| `follow_ups` and `outcome_surveys` | Post-award tracking and impact |
| `mentors`, `mentor_matches`, `opportunities`, `referrals` | Mentorship and opportunity board |
| `reports_misconduct` | Confidential reports |
| `content_versions` | Course version history |
| `config_settings` | Versioned configuration |
| `devices` (center device register) | Practice device booking |

**Changes to existing tables**

- `users`: add `date_of_birth` or `age_band`, `gender` (optional, consented), `village`, `guardian_contact`, `created_by_user_id` (assisted registration), `deleted_at`.
- `task_submissions`: add `content_hash`, `device_info`, `geo_lat` and `geo_lng` (optional), `reviewed_by`, `review_due_at`, `version_of_task`.
- `submission_verifications`: add `score_total`, `reason_code`, `is_revoked`, `revoked_by` and `revoked_reason`.
- `point_transactions`: add `rule_id`, `reversed_by_transaction_id`, `approved_by` (for manual adjustments).
- `hardware_inventory`: add `condition`, `donor`, `acquired_at`, `current_holder_user_id`.
- `hardware_grants`: add `round_id`, `decision_ref`, `handover_confirmed_at`, `status` (active, recovered, transferred).
- `badges`: add `rule_json` (unlock conditions), `level`.
- `digital_passports`: add `visibility_settings` and `share_token_rotated_at`.
- `system_audit_logs`: make append-only at the database level (no update or delete rights for the application role).

**Add indexes** on the review queue (center, status, due date), the ledger (learner, created time), and the public token.

---

## 9. Architecture decisions to settle before coding

1. **Database mismatch.** The ERD is relational (SQL types, foreign keys, VARCHAR ids), but the proposal names Convex, which is a document database. Decide now:
   - **Option A: PostgreSQL** (for example through a managed provider) with an API layer. Fits the ERD, supports strong constraints, reporting and auditing, and is the safer choice for an auditable allocation system.
   - **Option B: Convex.** Gives real-time updates and a fast start, but you must redesign the schema as documents and rebuild integrity rules in code.
   A hybrid is possible, with PostgreSQL as the source of truth and real-time updates delivered separately.
2. **File storage.** The SRS names both Convex storage and Cloudinary. Pick one primary store. Cloudinary is convenient for image optimization. Whichever you pick, use signed URLs for private evidence.
3. **Offline approach.** Use a service worker plus IndexedDB with an outbox pattern for queued actions.
4. **SMS provider.** Choose a provider with Rwandan coverage and local sender ID support. Plan for failover.
5. **Multi-tenancy of scope.** Implement scoped authorization (role plus geography or center) as a central policy layer, not scattered checks.
6. **Event log.** Emit domain events (SubmissionApproved, BadgeAwarded, GrantMade) so notifications, analytics and audit are driven consistently.
7. **Hosting and data residency.** Confirm where data may be stored under Rwandan rules and the donor's requirements.

---

## 10. Release roadmap

**Phase 1: Core trust loop (MVP pilot at 2 to 3 centers)**
Identity and roles (FR-IAM 01 to 05, 07, 08, 10, 12), geography and centers (FR-CEN 01, 03), content with lifecycle and rubrics (FR-CMS 01 to 04, 06, 08), learning delivery (FR-LRN 01 to 05), evidence submission (FR-SUB 01 to 05, 10, 11), verification (FR-VER 01 to 04, 06, 13, 14), passport (FR-PAS 01 to 04), points ledger (FR-PTS 01, 02, 04, 05, 07, 09), notifications (FR-NOT 01, 02), offline basics (FR-OFF 01 to 04), audit log (FR-ADM 01, 02, 04, 05), SMS gateway.

**Phase 2: Fairness and hardware**
Second-review sampling and trainer quality (FR-VER 05, 07, 08, 10), duplicate detection, hardware inventory, allocation rounds, committee review, handover and custody (FR-HW 01 to 12), opt-in leaderboard, analytics dashboards, sessions and attendance, center device register.

**Phase 3: Impact and ecosystem**
Follow-up and impact tracking (FR-IMP), mentorship and opportunities (FR-MEN), donor report pack, credential integrity and public verification API, content offline packs, maker-checker, support tooling.

**Phase 4: Scale and polish**
Pathways, peer help, group tasks, scheduled reports, early-warning analytics, open badge export, software licence grants.

---

## 11. Out of scope for now

- Native iOS and Android apps. The PWA covers this.
- Payment processing and mobile money.
- Automatic OCR or AI grading of handwritten ledgers. (It could assist trainers later, but a human verifies.)
- Replacing national platforms. Ikiraro links to Irembo and others and never stores their credentials.
- USSD access. It reaches feature-phone users and is a strong later addition, but it needs separate design.

---

## 12. What changed from your original specification and why

| Original idea | Change | Reason |
|---|---|---|
| Public leaderboard ranking learners by points | Opt-in, aliased, progress-oriented board, with the real decision made by a rule plus committee review | A pure points race is easy to game, favors people with better networks, and exposes personal data. Donors and communities will challenge it. |
| Fixed thresholds (3 badges, 100 points) | Thresholds set per item and per round | The ERD already stores requirements per item, and programs differ by device and district. |
| "Manual overrides are prohibited" | Controlled exceptions with two approvers and a public audit summary | A rule with no exception path gets broken quietly. A governed exception is more honest and more defensible. |
| "Tamper-proof passport" | Signed, verifiable credentials and revocation | Tamper-proof was a claim with no mechanism. This makes it real. |
| Trainer approves and the credential is final | Dual-review sampling, appeals, revocation, trainer quality scoring | A single unchecked reviewer is the biggest weakness in any verification system. |
| Hardware ends at "grant logged" | Handover, custody trail, follow-ups, recovery | The stated problem is devices that go unused. The system must follow the device. |
| 1,000 concurrent users only | Scale targets and growth path | An enterprise system needs a plan beyond the pilot. |
| Phone and email login only | Added OTP verification, assisted registration, guardian consent for minors | Rural, low-literacy and shared-device use needs it. |
| Role list of three | Twelve scoped roles | Real programs have coordinators, committees, donors and auditors. |
| Trainer review of "assigned district/center" only | Scoped access plus conflict-of-interest rules | Prevents favoritism and meets privacy expectations. |
| Out-of-scope list was short | Clear boundaries including USSD and AI grading as later options | Keeps the first release deliverable. |

---

## 13. Success measures

Track these from day one so the platform can prove its worth to funders.

- Learners who complete a first verified task within 14 days of registration.
- Task approval rate, rework rate, and median review time.
- Share of approvals confirmed by second review.
- Badges earned per 100 active learners, by district and gender.
- Share of hardware recipients still actively using the device at 90 and 180 days.
- Reported income or service-access improvement among recipients.
- Proportion of allocation decisions fully documented (target 100%).
- SUS score and field-test drop-off points.

---

## 14. Suggested next steps

1. Decide the database and storage questions in Section 9.
2. Update the ERD with the changes in Section 8.
3. Write user stories and acceptance tests for the Phase 1 list.
4. Build and field-test the learner to trainer approval loop at one center before adding anything else.
5. Draft the hardware allocation policy document with a real stakeholder, because the system encodes that policy.
