-- Kaplan MySQL schema. Additive: existing records are never deleted.
CREATE DATABASE IF NOT EXISTS kaplan CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE kaplan;

CREATE TABLE IF NOT EXISTS `Users` (
  `_row_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` VARCHAR(255) NOT NULL DEFAULT '',
  `email` VARCHAR(255) NOT NULL DEFAULT '',
  `name` LONGTEXT NOT NULL,
  `role` LONGTEXT NOT NULL,
  `password_hash` LONGTEXT NOT NULL,
  `password_salt` LONGTEXT NOT NULL,
  `password_version` LONGTEXT NOT NULL,
  `must_change_password` LONGTEXT NOT NULL,
  `status` LONGTEXT NOT NULL,
  `attempts_allowed` LONGTEXT NOT NULL,
  `attempts_used` LONGTEXT NOT NULL,
  `failed_login_count` LONGTEXT NOT NULL,
  `locked_until` LONGTEXT NOT NULL,
  `created_at` LONGTEXT NOT NULL,
  `created_by` LONGTEXT NOT NULL,
  `last_login_at` LONGTEXT NOT NULL,
  `updated_at` LONGTEXT NOT NULL,
  UNIQUE KEY `uq_user_id` (`user_id`),
  UNIQUE KEY `uq_email` (`email`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `Sessions` (
  `_row_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `session_id` VARCHAR(255) NOT NULL DEFAULT '',
  `user_id` VARCHAR(255) NOT NULL DEFAULT '',
  `token_hash` VARCHAR(255) NOT NULL DEFAULT '',
  `csrf_nonce` LONGTEXT NOT NULL,
  `created_at` LONGTEXT NOT NULL,
  `last_activity_at` LONGTEXT NOT NULL,
  `expires_at` LONGTEXT NOT NULL,
  `revoked_at` LONGTEXT NOT NULL,
  `user_agent` LONGTEXT NOT NULL,
  UNIQUE KEY `uq_session_id` (`session_id`),
  UNIQUE KEY `uq_token_hash` (`token_hash`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `Results` (
  `_row_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `submission_id` VARCHAR(255) NOT NULL DEFAULT '',
  `user_id` VARCHAR(255) NOT NULL DEFAULT '',
  `name` LONGTEXT NOT NULL,
  `email` VARCHAR(255) NOT NULL DEFAULT '',
  `started_at` LONGTEXT NOT NULL,
  `submitted_at` LONGTEXT NOT NULL,
  `time_seconds` LONGTEXT NOT NULL,
  `paste_flag` LONGTEXT NOT NULL,
  `paste_events` LONGTEXT NOT NULL,
  `writing_answer` LONGTEXT NOT NULL,
  `speaking_transcript_1` LONGTEXT NOT NULL,
  `speaking_transcript_2` LONGTEXT NOT NULL,
  `speaking_transcript_3` LONGTEXT NOT NULL,
  `word_count` LONGTEXT NOT NULL,
  `sentence_count` LONGTEXT NOT NULL,
  `average_sentence_length` LONGTEXT NOT NULL,
  `unique_word_ratio` LONGTEXT NOT NULL,
  `grammar_score` LONGTEXT NOT NULL,
  `spelling_punctuation_score` LONGTEXT NOT NULL,
  `vocabulary_score` LONGTEXT NOT NULL,
  `task_length_score` LONGTEXT NOT NULL,
  `total_score` LONGTEXT NOT NULL,
  `suggested_level` LONGTEXT NOT NULL,
  `formula_version` LONGTEXT NOT NULL,
  `error_count` LONGTEXT NOT NULL,
  `errors_per_100_words` LONGTEXT NOT NULL,
  `topic_flag` LONGTEXT NOT NULL,
  `check_status` LONGTEXT NOT NULL,
  `report_status` LONGTEXT NOT NULL,
  `doc_url` LONGTEXT NOT NULL,
  `audio_folder_url` LONGTEXT NOT NULL,
  `audio_1_url` LONGTEXT NOT NULL,
  `audio_2_url` LONGTEXT NOT NULL,
  `audio_3_url` LONGTEXT NOT NULL,
  `teacher_level` LONGTEXT NOT NULL,
  `fluency_score` LONGTEXT NOT NULL,
  `pronunciation_score` LONGTEXT NOT NULL,
  `speaking_length_score` LONGTEXT NOT NULL,
  `speaking_relevance_score` LONGTEXT NOT NULL,
  `teacher_notes` LONGTEXT NOT NULL,
  `override_by` LONGTEXT NOT NULL,
  `override_at` LONGTEXT NOT NULL,
  `speaking_auto_score` LONGTEXT NOT NULL,
  `speaking_audio_feedback` LONGTEXT NOT NULL,
  `speaking_metrics_json` LONGTEXT NOT NULL,
  `report_json` LONGTEXT NOT NULL,
  `audio_1_play` LONGTEXT NOT NULL,
  `audio_2_play` LONGTEXT NOT NULL,
  `audio_3_play` LONGTEXT NOT NULL,
  UNIQUE KEY `uq_submission_id` (`submission_id`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `Errors` (
  `_row_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `error_id` VARCHAR(255) NOT NULL DEFAULT '',
  `submission_id` VARCHAR(255) NOT NULL DEFAULT '',
  `user_id` VARCHAR(255) NOT NULL DEFAULT '',
  `student_email` LONGTEXT NOT NULL,
  `answer_section` LONGTEXT NOT NULL,
  `category` LONGTEXT NOT NULL,
  `original_text` LONGTEXT NOT NULL,
  `start_position` LONGTEXT NOT NULL,
  `end_position` LONGTEXT NOT NULL,
  `suggested_correction` LONGTEXT NOT NULL,
  `explanation` LONGTEXT NOT NULL,
  `rule_id` LONGTEXT NOT NULL,
  `checker_version` LONGTEXT NOT NULL,
  UNIQUE KEY `uq_error_id` (`error_id`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `Settings` (
  `_row_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(255) NOT NULL DEFAULT '',
  `value` LONGTEXT NOT NULL,
  `value_type` LONGTEXT NOT NULL,
  `description` LONGTEXT NOT NULL,
  `updated_at` LONGTEXT NOT NULL,
  `updated_by` LONGTEXT NOT NULL,
  UNIQUE KEY `uq_key` (`key`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `Lessons` (
  `_row_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `lesson_id` VARCHAR(255) NOT NULL DEFAULT '',
  `category` LONGTEXT NOT NULL,
  `title` LONGTEXT NOT NULL,
  `rule` LONGTEXT NOT NULL,
  `correct_examples` LONGTEXT NOT NULL,
  `common_mistake` LONGTEXT NOT NULL,
  `display_order` LONGTEXT NOT NULL,
  `enabled` LONGTEXT NOT NULL,
  UNIQUE KEY `uq_lesson_id` (`lesson_id`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `Audit` (
  `_row_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `timestamp` LONGTEXT NOT NULL,
  `actor_user_id` LONGTEXT NOT NULL,
  `actor_email` LONGTEXT NOT NULL,
  `action` LONGTEXT NOT NULL,
  `target_user_id` LONGTEXT NOT NULL,
  `target_email` LONGTEXT NOT NULL,
  `success` LONGTEXT NOT NULL,
  `details` LONGTEXT NOT NULL,
  `request_id` LONGTEXT NOT NULL,
  `user_agent` LONGTEXT NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `Jobs` (
  `_row_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `job_id` VARCHAR(255) NOT NULL DEFAULT '',
  `submission_id` VARCHAR(255) NOT NULL DEFAULT '',
  `job_type` LONGTEXT NOT NULL,
  `status` LONGTEXT NOT NULL,
  `attempt_count` LONGTEXT NOT NULL,
  `next_attempt_at` LONGTEXT NOT NULL,
  `last_error` LONGTEXT NOT NULL,
  `created_at` LONGTEXT NOT NULL,
  `updated_at` LONGTEXT NOT NULL,
  UNIQUE KEY `uq_job_id` (`job_id`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS AudioChunks (
 user_id VARCHAR(255) NOT NULL, submission_id VARCHAR(255) NOT NULL,
 answer_number INT NOT NULL, chunk_index INT NOT NULL, chunk_total INT NOT NULL,
 content MEDIUMBLOB NOT NULL,
 PRIMARY KEY (user_id, submission_id, answer_number, chunk_index)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS Recordings (
 submission_id VARCHAR(255) NOT NULL, answer_number INT NOT NULL,
 content MEDIUMBLOB NOT NULL, PRIMARY KEY (submission_id, answer_number)
) ENGINE=InnoDB;
