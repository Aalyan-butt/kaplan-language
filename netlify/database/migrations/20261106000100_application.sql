-- Application schema only. Never put user records or passwords in migrations.
CREATE TABLE IF NOT EXISTS "Users" (
  _row_id BIGSERIAL PRIMARY KEY,
  "user_id" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL DEFAULT '',
  "name" TEXT NOT NULL DEFAULT '',
  "role" TEXT NOT NULL DEFAULT '',
  "password_hash" TEXT NOT NULL DEFAULT '',
  "password_salt" TEXT NOT NULL DEFAULT '',
  "password_version" TEXT NOT NULL DEFAULT '',
  "must_change_password" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT '',
  "attempts_allowed" TEXT NOT NULL DEFAULT '',
  "attempts_used" TEXT NOT NULL DEFAULT '',
  "failed_login_count" TEXT NOT NULL DEFAULT '',
  "locked_until" TEXT NOT NULL DEFAULT '',
  "created_at" TEXT NOT NULL DEFAULT '',
  "created_by" TEXT NOT NULL DEFAULT '',
  "last_login_at" TEXT NOT NULL DEFAULT '',
  "updated_at" TEXT NOT NULL DEFAULT '',
  UNIQUE ("user_id")
);
CREATE TABLE IF NOT EXISTS "Sessions" (
  _row_id BIGSERIAL PRIMARY KEY,
  "session_id" TEXT NOT NULL DEFAULT '',
  "user_id" TEXT NOT NULL DEFAULT '',
  "token_hash" TEXT NOT NULL DEFAULT '',
  "csrf_nonce" TEXT NOT NULL DEFAULT '',
  "created_at" TEXT NOT NULL DEFAULT '',
  "last_activity_at" TEXT NOT NULL DEFAULT '',
  "expires_at" TEXT NOT NULL DEFAULT '',
  "revoked_at" TEXT NOT NULL DEFAULT '',
  "user_agent" TEXT NOT NULL DEFAULT '',
  UNIQUE ("session_id"),
  UNIQUE ("token_hash")
);
CREATE TABLE IF NOT EXISTS "Results" (
  _row_id BIGSERIAL PRIMARY KEY,
  "submission_id" TEXT NOT NULL DEFAULT '',
  "user_id" TEXT NOT NULL DEFAULT '',
  "name" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL DEFAULT '',
  "started_at" TEXT NOT NULL DEFAULT '',
  "submitted_at" TEXT NOT NULL DEFAULT '',
  "time_seconds" TEXT NOT NULL DEFAULT '',
  "paste_flag" TEXT NOT NULL DEFAULT '',
  "paste_events" TEXT NOT NULL DEFAULT '',
  "writing_answer" TEXT NOT NULL DEFAULT '',
  "speaking_transcript_1" TEXT NOT NULL DEFAULT '',
  "speaking_transcript_2" TEXT NOT NULL DEFAULT '',
  "speaking_transcript_3" TEXT NOT NULL DEFAULT '',
  "word_count" TEXT NOT NULL DEFAULT '',
  "sentence_count" TEXT NOT NULL DEFAULT '',
  "average_sentence_length" TEXT NOT NULL DEFAULT '',
  "unique_word_ratio" TEXT NOT NULL DEFAULT '',
  "grammar_score" TEXT NOT NULL DEFAULT '',
  "spelling_punctuation_score" TEXT NOT NULL DEFAULT '',
  "vocabulary_score" TEXT NOT NULL DEFAULT '',
  "task_length_score" TEXT NOT NULL DEFAULT '',
  "total_score" TEXT NOT NULL DEFAULT '',
  "suggested_level" TEXT NOT NULL DEFAULT '',
  "formula_version" TEXT NOT NULL DEFAULT '',
  "error_count" TEXT NOT NULL DEFAULT '',
  "errors_per_100_words" TEXT NOT NULL DEFAULT '',
  "topic_flag" TEXT NOT NULL DEFAULT '',
  "check_status" TEXT NOT NULL DEFAULT '',
  "report_status" TEXT NOT NULL DEFAULT '',
  "doc_url" TEXT NOT NULL DEFAULT '',
  "audio_folder_url" TEXT NOT NULL DEFAULT '',
  "audio_1_url" TEXT NOT NULL DEFAULT '',
  "audio_2_url" TEXT NOT NULL DEFAULT '',
  "audio_3_url" TEXT NOT NULL DEFAULT '',
  "teacher_level" TEXT NOT NULL DEFAULT '',
  "fluency_score" TEXT NOT NULL DEFAULT '',
  "pronunciation_score" TEXT NOT NULL DEFAULT '',
  "speaking_length_score" TEXT NOT NULL DEFAULT '',
  "speaking_relevance_score" TEXT NOT NULL DEFAULT '',
  "teacher_notes" TEXT NOT NULL DEFAULT '',
  "override_by" TEXT NOT NULL DEFAULT '',
  "override_at" TEXT NOT NULL DEFAULT '',
  "speaking_auto_score" TEXT NOT NULL DEFAULT '',
  "speaking_audio_feedback" TEXT NOT NULL DEFAULT '',
  "speaking_metrics_json" TEXT NOT NULL DEFAULT '',
  "report_json" TEXT NOT NULL DEFAULT '',
  "audio_1_play" TEXT NOT NULL DEFAULT '',
  "audio_2_play" TEXT NOT NULL DEFAULT '',
  "audio_3_play" TEXT NOT NULL DEFAULT '',
  UNIQUE ("submission_id")
);
CREATE TABLE IF NOT EXISTS "Errors" (
  _row_id BIGSERIAL PRIMARY KEY,
  "error_id" TEXT NOT NULL DEFAULT '',
  "submission_id" TEXT NOT NULL DEFAULT '',
  "user_id" TEXT NOT NULL DEFAULT '',
  "student_email" TEXT NOT NULL DEFAULT '',
  "answer_section" TEXT NOT NULL DEFAULT '',
  "category" TEXT NOT NULL DEFAULT '',
  "original_text" TEXT NOT NULL DEFAULT '',
  "start_position" TEXT NOT NULL DEFAULT '',
  "end_position" TEXT NOT NULL DEFAULT '',
  "suggested_correction" TEXT NOT NULL DEFAULT '',
  "explanation" TEXT NOT NULL DEFAULT '',
  "rule_id" TEXT NOT NULL DEFAULT '',
  "checker_version" TEXT NOT NULL DEFAULT '',
  UNIQUE ("error_id")
);
CREATE TABLE IF NOT EXISTS "Settings" (
  _row_id BIGSERIAL PRIMARY KEY,
  "key" TEXT NOT NULL DEFAULT '',
  "value" TEXT NOT NULL DEFAULT '',
  "value_type" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "updated_at" TEXT NOT NULL DEFAULT '',
  "updated_by" TEXT NOT NULL DEFAULT '',
  UNIQUE ("key")
);
CREATE TABLE IF NOT EXISTS "Lessons" (
  _row_id BIGSERIAL PRIMARY KEY,
  "lesson_id" TEXT NOT NULL DEFAULT '',
  "category" TEXT NOT NULL DEFAULT '',
  "title" TEXT NOT NULL DEFAULT '',
  "rule" TEXT NOT NULL DEFAULT '',
  "correct_examples" TEXT NOT NULL DEFAULT '',
  "common_mistake" TEXT NOT NULL DEFAULT '',
  "display_order" TEXT NOT NULL DEFAULT '',
  "enabled" TEXT NOT NULL DEFAULT '',
  UNIQUE ("lesson_id")
);
CREATE TABLE IF NOT EXISTS "Audit" (
  _row_id BIGSERIAL PRIMARY KEY,
  "timestamp" TEXT NOT NULL DEFAULT '',
  "actor_user_id" TEXT NOT NULL DEFAULT '',
  "actor_email" TEXT NOT NULL DEFAULT '',
  "action" TEXT NOT NULL DEFAULT '',
  "target_user_id" TEXT NOT NULL DEFAULT '',
  "target_email" TEXT NOT NULL DEFAULT '',
  "success" TEXT NOT NULL DEFAULT '',
  "details" TEXT NOT NULL DEFAULT '',
  "request_id" TEXT NOT NULL DEFAULT '',
  "user_agent" TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS "Jobs" (
  _row_id BIGSERIAL PRIMARY KEY,
  "job_id" TEXT NOT NULL DEFAULT '',
  "submission_id" TEXT NOT NULL DEFAULT '',
  "job_type" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT '',
  "attempt_count" TEXT NOT NULL DEFAULT '',
  "next_attempt_at" TEXT NOT NULL DEFAULT '',
  "last_error" TEXT NOT NULL DEFAULT '',
  "created_at" TEXT NOT NULL DEFAULT '',
  "updated_at" TEXT NOT NULL DEFAULT '',
  UNIQUE ("job_id")
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON "Users" (LOWER(email));
CREATE TABLE IF NOT EXISTS "AudioChunks" (
 user_id TEXT NOT NULL, submission_id TEXT NOT NULL, answer_number INTEGER NOT NULL,
 chunk_index INTEGER NOT NULL, chunk_total INTEGER NOT NULL, content BYTEA NOT NULL,
 PRIMARY KEY(user_id, submission_id, answer_number, chunk_index)
);
CREATE TABLE IF NOT EXISTS "Recordings" (
 submission_id TEXT NOT NULL, answer_number INTEGER NOT NULL, content BYTEA NOT NULL,
 PRIMARY KEY(submission_id, answer_number)
);
