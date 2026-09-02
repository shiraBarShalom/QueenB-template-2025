# Paragon / Match Queens — Current Architecture Summary

## 1. Main System Areas

The current application architecture is divided into four main flows:

1. Authentication and onboarding
2. Mentor / mentee discovery and meeting coordination
3. Post-match meeting management
4. Admin / community manager flow

---

## 2. Authentication & Onboarding

### Entry Screens
- Welcome screen
- Registration screen
- Login screen
- Google login option

### Registration
Required:
- Email
- Username
- Password

Optional professional information:
- Programming languages
- Role / job
- Years of experience
- Profile picture
- LinkedIn

### Mentor Decision
After registration, the user can choose:
- Become a mentor
- Skip mentor setup for now

If the user becomes a mentor, she fills:
- Mentoring topics
- Number of meetings she is willing to provide
- Meeting duration

After onboarding, the user reaches the main discovery/home screen.

### User Type Routing
After login:
- Regular user → mentor discovery / meeting flow
- Admin → admin dashboard

---

## 3. Mentor / Mentee Flow

### Mentor Discovery
The regular user can:
- Browse mentors
- Search mentors
- Filter by topic, experience, language, or field
- Open a mentor profile

### Mentor Profile
Shows:
- Mentor name
- Professional background
- Years of experience
- Technologies/topics
- About section

Main action:
- Request / schedule a mentoring meeting

### Meeting Request
The mentee sends a request to a mentor.

The mentor can:
- Reject the request
- Accept and propose available time slots

If rejected:
- The mentee returns to mentor discovery.

If accepted:
- The mentor selects available slots.

### Slot Selection
The mentee receives the proposed slots.

The mentee can:
- Select one available slot
- Request additional slots if none are suitable

If a slot is selected:
- The meeting is confirmed.

If no slot fits:
- The mentor can provide one additional set of slots.

If no slot works after the second attempt:
- The request is closed.

---

## 4. Post-Match Meeting Management

The user has a "My Meetings" screen with:
- Upcoming meetings
- Past meetings
- Cancelled meetings

A confirmed meeting can be rescheduled if one side cannot attend.

The system may send:
- WhatsApp reminders before the meeting
- Attendance confirmation requests

After the scheduled time, the system asks whether the meeting occurred.

If yes:
- Both sides can submit feedback
- A thank-you message is sent to the mentor

If no:
- The users can decide whether to reschedule

---

## 5. Admin Architecture

### Meetings Dashboard
Shows all meetings with:
- Date
- Mentor
- Mentee
- Status

Supports filtering by status.

### Global Meetings Calendar
Displays scheduled meetings in calendar format.

Meeting colors represent different statuses.

### User Management
Displays all mentors and mentees.

The admin can open a user profile and see:
- User information
- Number of mentoring meetings
- Number of meetings as mentee
- Completed meetings
- Cancelled meetings

### Admin Alerts
The system can notify the admin about cases such as:
- Meetings that did not occur
- Missing feedback
- Mentors reaching a high number of completed meetings

---

## 6. High-Level Architecture

```text
Authentication
      |
      v
User / Admin Routing
      |
      +----------------------+
      |                      |
      v                      v
Regular User              Admin
      |                      |
      v                      v
Mentor Discovery      Meetings Dashboard
      |                Global Calendar
      v                User Management
Mentor Profile         Admin Alerts
      |
      v
Meeting Request
      |
      v
Mentor Decision
      |
      v
Proposed Slots
      |
      v
Mentee Selects Slot
      |
      v
Scheduled Meeting
      |
      v
Meeting Management
      |
      v
Feedback / Reschedule
```

---

## 7. Important MVP Note

The current MVP does not require an automatic matching algorithm.

The mentee manually browses mentors and selects whom she wants to contact.

The core end-to-end flow is:

```text
Register/Login
→ Browse Mentors
→ Open Mentor Profile
→ Send Meeting Request
→ Mentor Proposes Slots
→ Mentee Selects Slot
→ Meeting Scheduled
→ Meeting Managed
→ Feedback
```

This file describes the current architecture and user flow.

Use it as context when reviewing or implementing the project.

Do not introduce additional complexity unless it is required by the current MVP.
