-- Test data. Run after init.sql.

INSERT INTO users (email, password_hash, username, tech_stack, job_title, company, years_of_experience, is_admin)
VALUES
  ('admin@queensmatch.dev', '$2b$10$placeholderhashplaceholderhashplaceh', 'admin', NULL, NULL, NULL, NULL, TRUE),
  ('dana@example.com', '$2b$10$placeholderhashplaceholderhashplaceh', 'dana_dev', 'React, Node.js', 'Senior Software Engineer', 'TechCo', 8, FALSE),
  ('maya@example.com', '$2b$10$placeholderhashplaceholderhashplaceh', 'maya_codes', 'Python, Django', 'Backend Engineer', 'DataWorks', 5, FALSE),
  ('shira@example.com', '$2b$10$placeholderhashplaceholderhashplaceh', 'shira_j', 'JavaScript', 'Junior Developer', 'StartupXYZ', 1, FALSE);

INSERT INTO mentor_profiles (user_id, background, advises_on, max_meetings, meeting_duration_minutes)
VALUES
  (2, '8 years in backend & fullstack roles at various startups.', 'Mock interviews, career planning, TechCo interview prep', 4, 30),
  (3, '5 years specializing in Python backend systems.', 'Career transitions, system design basics', 3, 45);

INSERT INTO meeting_requests (mentee_id, mentor_id, status)
VALUES
  (4, 2, 'pending');
