# MATCH QUEENS — MVP Project Context

## 1. Project Goal
MATCH QUEENS is a web application for connecting mentees with mentors in the community and managing the mentoring-meeting process.

The current goal is **a minimal working MVP**, not the final product.
Keep the architecture simple, clear, maintainable, and easy to extend later.

Source requirements define user accounts/authentication, a mentor list, meeting coordination, feedback, notifications, and an admin view. fileciteturn1file0L20-L48

---

## 2. User Types
There are two application access types:

- **USER** — regular user
- **ADMIN** — community manager

A regular user can act as:
- **Mentee** — requests a meeting with a mentor.
- **Mentor** — has an additional mentor profile and can receive meeting requests.

A mentor is still a regular `USER`; mentor-specific data is stored separately in `mentor_profiles`.

---

## 3. MVP User Flow

### Authentication
1. User registers / logs in.
2. Required registration data:
   - email
   - password
   - username
3. Optional profile data:
   - programming languages
   - tech stack
   - job/company
   - years of experience
   - profile picture
   - GitHub
   - LinkedIn

### Mentor
A user may choose to become a mentor and provide:
- background
- advice topics
- maximum number of mentoring meetings
- meeting duration

The mentor can edit these details later. fileciteturn1file0L26-L30

### Mentee → Meeting Request
1. Mentee sees the list of mentors.
2. Mentee selects a mentor.
3. Mentee sends a meeting request.
4. Request status starts as `PENDING_MENTOR`.

The MVP does **not** automatically recommend or match mentors. The mentee chooses a mentor manually.

### Mentor Response
The mentor receives the request and can:
- propose available time slots, or
- reject/cancel the request.

After slots are proposed:
`PENDING_MENTOR → PENDING_MENTEE`

### Mentee Selects Time
The mentee sees the proposed slots and selects one.

After selection:
`PENDING_MENTEE → SCHEDULED`

Only one proposed slot should be selected for a meeting request.

### After the Meeting
The meeting can become:
- `OCCURRED`
- `NOT_OCCURRED`
- `CANCELLED`

Feedback can be stored for the meeting.

The original requirements also describe reminders, attendance confirmation, rescheduling, repeated feedback reminders, and thank-you messages. These should be treated as later/secondary functionality unless explicitly selected for the current MVP. fileciteturn1file0L38-L48

---

## 4. Admin
The original requirements include:
- viewing all meetings and their statuses
- filtering meetings
- viewing meetings in a calendar
- viewing meeting details
- viewing all users and user details
- admin alerts for exceptional situations fileciteturn1file0L50-L64

For the first MVP, implement only the minimum admin functionality agreed by the team. Do not expand the admin area automatically.

---

## 5. Current Database Model

### `users`
Stores every registered user.

Main fields:
- `id`
- `email`
- `password_hash`
- `username`
- `role`
- `programming_languages`
- `tech_stack`
- `job_company`
- `years_of_experience`
- `profile_picture_url`
- `github_link`
- `linkedin_link`
- `created_at`

### `mentor_profiles`
Stores information that exists only for mentors.

Relationship:
`users 1 → 0..1 mentor_profiles`

Main fields:
- `id`
- `user_id`
- `background`
- `advice_topics`
- `max_meetings`
- `meeting_duration_mins`
- `updated_at`

There is currently **no `mentee_profiles` table**, because the MVP has no mentee-specific profile data that needs separate storage.

### `meeting_requests`
Represents the meeting process between one mentee and one mentor.

Main fields:
- `id`
- `mentee_id` → `users.id`
- `mentor_id` → `users.id`
- `status`
- `created_at`
- `updated_at`

This record persists while the meeting moves through its statuses.

### `proposed_slots`
Stores the times proposed for a specific meeting request.

Relationship:
`meeting_requests 1 → many proposed_slots`

Main fields:
- `id`
- `meeting_request_id`
- `start_time`
- `end_time`
- `is_selected`

### `feedbacks`
Stores feedback associated with a meeting request.

Main fields:
- `id`
- `meeting_request_id`
- `submitted_by_user_id`
- `content`
- `created_at`

### `notifications_log`
Stores a log of notifications sent to users.

Main fields:
- `id`
- `user_id`
- `notification_type`
- `sent_at`

---

## 6. Meeting Statuses

```text
PENDING_MENTOR
PENDING_MENTEE
SCHEDULED
OCCURRED
NOT_OCCURRED
CANCELLED
```

Basic flow:

```text
PENDING_MENTOR
      ↓
PENDING_MENTEE
      ↓
SCHEDULED
      ↓
OCCURRED / NOT_OCCURRED

CANCELLED can terminate the process when relevant.
```

---

## 7. MVP Boundaries

For now, do **not** add complexity unless it is required for the basic flow.

Not part of the current MVP unless the team explicitly decides otherwise:
- automatic mentor recommendation/matching algorithm
- AI features
- complex availability/calendar system
- chat
- advanced notification infrastructure
- advanced analytics
- unnecessary tables or design patterns
- premature optimization

Prefer the simplest implementation that supports the end-to-end flow.

---

## 8. Architecture Principle

Before implementing a feature, identify:

1. What user action starts it?
2. What screen/component handles it?
3. What API request is required?
4. What backend logic is required?
5. What DB data is read or changed?
6. What is the success result?
7. What are the important failure/edge cases?

Avoid building features whose responsibility or data flow is unclear.

---

## 9. Instructions for Cursor / Grill Me

When reviewing this project:

- Treat this file as the current MVP context.
- Do not invent requirements.
- Do not redesign the project into an enterprise-scale architecture.
- Challenge unclear assumptions, missing edge cases, inconsistent data flow, and unnecessary complexity.
- Focus on issues that can actually break the MVP or make team development difficult.
- Distinguish between:
  - **MUST FIX for MVP**
  - **GOOD TO IMPROVE**
  - **LATER / NOT NEEDED NOW**
- If suggesting a new table, endpoint, layer, dependency, or abstraction, explain why the existing design cannot support the requirement without it.
- Prefer small, concrete changes over broad rewrites.
- When reviewing code, verify that frontend → API → backend → DB behavior matches the flow described above.

## 10. Current Priority

The priority is:

**Get one simple end-to-end flow working correctly:**

`register/login → view mentors → request meeting → mentor proposes slots → mentee selects slot → meeting becomes scheduled`

Everything else is secondary until this flow works.
