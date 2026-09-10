-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: 127.0.0.1    Database: pharmate_local_dev
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `admins`
--

DROP TABLE IF EXISTS `admins`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `admins` (
  `id` char(36) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_admins_user` FOREIGN KEY (`id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `admins`
--

LOCK TABLES `admins` WRITE;
/*!40000 ALTER TABLE `admins` DISABLE KEYS */;
INSERT INTO `admins` VALUES ('f93413f8-619a-4216-ab83-f7ad85b88227','2026-09-08 20:58:00.280');
/*!40000 ALTER TABLE `admins` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `audit_events`
--

DROP TABLE IF EXISTS `audit_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `audit_events` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `actor_user_id` char(36) DEFAULT NULL,
  `actor_role` enum('patient','caregiver','pharmacist','admin','system') NOT NULL,
  `action` varchar(80) NOT NULL,
  `entity_type` varchar(80) NOT NULL,
  `entity_id` varchar(100) DEFAULT NULL,
  `patient_id` char(36) DEFAULT NULL,
  `metadata_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata_json`)),
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_audit_actor` (`actor_user_id`,`created_at`),
  KEY `idx_audit_patient` (`patient_id`,`created_at`),
  KEY `idx_audit_entity` (`entity_type`,`entity_id`,`created_at`),
  CONSTRAINT `fk_audit_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_audit_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audit_events`
--

LOCK TABLES `audit_events` WRITE;
/*!40000 ALTER TABLE `audit_events` DISABLE KEYS */;
INSERT INTO `audit_events` VALUES ('0d16e0f6-7f57-47db-ba60-8683e79348ec','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','patient','INQUIRY_CONSENT_WITHDRAWN','inquiry_consent',NULL,'b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','{\"policy_version\":\"2026-09-06\"}','2026-09-09 02:33:42.213'),('2cf9cc8e-cbd9-4e9e-bbae-e74b24c92bb0','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','patient','login_succeeded','session','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e',NULL,'{\"method\":\"password\"}','2026-09-09 00:49:35.969'),('3476bac3-58bd-4eaf-899c-773f168c56b0','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','patient','login_succeeded','session','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e',NULL,'{\"method\":\"password\"}','2026-09-09 01:58:43.152'),('4008fc67-71c9-4df4-8985-168d7910bdd4','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','patient','CAREGIVER_LINK_APPROVED','caregiver_link','96a84e8d-9314-404f-847b-3b24d5addaa2','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e',NULL,'2026-09-09 00:50:48.499'),('62963a82-de2c-4a45-848e-8b0ab45681be','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','patient','login_succeeded','session','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e',NULL,'{\"method\":\"password\"}','2026-09-08 20:59:14.175'),('64fddc4e-6eb0-41d8-b0c9-95f48cac38f9','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','patient','INQUIRY_CONSENT_ACCEPTED','inquiry_consent',NULL,'b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','{\"policy_version\":\"2026-09-06\"}','2026-09-09 02:36:13.531'),('7b19afa9-c054-4311-b9ab-73204261f577','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','patient','INQUIRY_CONSENT_ACCEPTED','inquiry_consent',NULL,'b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','{\"policy_version\":\"2026-09-06\"}','2026-09-09 02:33:40.324'),('84f1fb9d-c004-475f-9d3f-792938cbb70b','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','patient','login_succeeded','session','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e',NULL,'{\"method\":\"password\"}','2026-09-09 00:32:23.943'),('8ceaba9e-503c-4db7-8e3d-c2f867c50ca9','3c0c7623-bb5b-453c-8657-b85bd0443a55','caregiver','login_succeeded','session','3c0c7623-bb5b-453c-8657-b85bd0443a55',NULL,'{\"method\":\"password\"}','2026-09-09 00:47:47.702'),('96362035-db1b-4152-a67e-b46b7f559045','3c0c7623-bb5b-453c-8657-b85bd0443a55','caregiver','CAREGIVER_LINK_REQUESTED','caregiver_link','96a84e8d-9314-404f-847b-3b24d5addaa2','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','{\"relationship\":\"Mother\"}','2026-09-09 00:50:39.716'),('9a25ff6d-784c-4c21-afec-87c478dc4b49','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','patient','INQUIRY_CONSENT_ACCEPTED','inquiry_consent',NULL,'b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','{\"policy_version\":\"2026-09-06\"}','2026-09-09 02:13:00.348'),('ba73bca2-40bd-4505-a0ab-2a9945f5c5cf','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','patient','INQUIRY_CONSENT_WITHDRAWN','inquiry_consent',NULL,'b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','{\"policy_version\":\"2026-09-06\"}','2026-09-09 02:13:02.267'),('bca2edae-4a5c-4bba-8552-3ae8eb7f0253','3c0c7623-bb5b-453c-8657-b85bd0443a55','caregiver','login_succeeded','session','3c0c7623-bb5b-453c-8657-b85bd0443a55',NULL,'{\"method\":\"password\"}','2026-09-09 01:59:11.533'),('c23c05b4-e0af-4f58-86dc-46340d3a9fdc','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','patient','login_succeeded','session','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e',NULL,'{\"method\":\"password\"}','2026-09-08 21:00:57.121'),('fa7a4a1f-1596-4116-afb7-bc4477324dc2','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','patient','login_succeeded','session','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e',NULL,'{\"method\":\"password\"}','2026-09-09 02:27:08.472');
/*!40000 ALTER TABLE `audit_events` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `caregiver_alerts`
--

DROP TABLE IF EXISTS `caregiver_alerts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `caregiver_alerts` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `patient_id` char(36) NOT NULL,
  `schedule_id` char(36) DEFAULT NULL,
  `caregiver_id` char(36) DEFAULT NULL,
  `channel` enum('caregiver','pharmacist') NOT NULL,
  `alert_type` enum('missed_dose') NOT NULL DEFAULT 'missed_dose',
  `status` enum('unseen','seen','resolved') NOT NULL DEFAULT 'unseen',
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_alert_caregiver` (`caregiver_id`,`status`),
  KEY `idx_alert_channel` (`channel`,`status`),
  KEY `fk_alert_patient` (`patient_id`),
  KEY `fk_alert_schedule` (`schedule_id`),
  CONSTRAINT `fk_alert_caregiver` FOREIGN KEY (`caregiver_id`) REFERENCES `caregivers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_alert_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_alert_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `medication_schedules` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `caregiver_alerts`
--

LOCK TABLES `caregiver_alerts` WRITE;
/*!40000 ALTER TABLE `caregiver_alerts` DISABLE KEYS */;
/*!40000 ALTER TABLE `caregiver_alerts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `caregiver_link_audit`
--

DROP TABLE IF EXISTS `caregiver_link_audit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `caregiver_link_audit` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `link_id` char(36) NOT NULL,
  `caregiver_id` char(36) NOT NULL,
  `patient_id` char(36) NOT NULL,
  `event_type` enum('requested','approved','rejected','linked','relinked','revoked') NOT NULL,
  `actor_user_id` char(36) NOT NULL,
  `invite_id` char(36) DEFAULT NULL,
  `occurred_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_cla_link_time` (`link_id`,`occurred_at`),
  KEY `idx_cla_patient_time` (`patient_id`,`occurred_at`),
  KEY `fk_cla_caregiver` (`caregiver_id`),
  KEY `fk_cla_actor` (`actor_user_id`),
  KEY `fk_cla_invite` (`invite_id`),
  CONSTRAINT `fk_cla_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_cla_caregiver` FOREIGN KEY (`caregiver_id`) REFERENCES `caregivers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cla_invite` FOREIGN KEY (`invite_id`) REFERENCES `invite_codes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cla_link` FOREIGN KEY (`link_id`) REFERENCES `caregiver_patients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cla_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `caregiver_link_audit`
--

LOCK TABLES `caregiver_link_audit` WRITE;
/*!40000 ALTER TABLE `caregiver_link_audit` DISABLE KEYS */;
INSERT INTO `caregiver_link_audit` VALUES ('1906363f-cfdf-49f5-90ad-709ec7040847','96a84e8d-9314-404f-847b-3b24d5addaa2','3c0c7623-bb5b-453c-8657-b85bd0443a55','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','requested','3c0c7623-bb5b-453c-8657-b85bd0443a55','31ae2f1d-bde3-4331-bcc3-56e48a69ab90','2026-09-09 00:50:39.712'),('ec59d3d0-d58d-4a7e-835b-c8709928c4ff','96a84e8d-9314-404f-847b-3b24d5addaa2','3c0c7623-bb5b-453c-8657-b85bd0443a55','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','approved','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e',NULL,'2026-09-09 00:50:48.484');
/*!40000 ALTER TABLE `caregiver_link_audit` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `caregiver_patients`
--

DROP TABLE IF EXISTS `caregiver_patients`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `caregiver_patients` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `caregiver_id` char(36) NOT NULL,
  `patient_id` char(36) NOT NULL,
  `relationship` varchar(50) NOT NULL DEFAULT 'Caregiver',
  `can_manage_medications` tinyint(1) NOT NULL DEFAULT 0,
  `linked_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `status` enum('pending','active','rejected','revoked') NOT NULL DEFAULT 'active',
  `revoked_at` datetime(3) DEFAULT NULL,
  `revoked_by_patient_id` char(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_caregiver_patient` (`caregiver_id`,`patient_id`),
  KEY `idx_cp_active_patient` (`patient_id`,`status`),
  KEY `idx_cp_active_caregiver` (`caregiver_id`,`status`),
  KEY `fk_cp_revoked_by_patient` (`revoked_by_patient_id`),
  CONSTRAINT `fk_cp_caregiver` FOREIGN KEY (`caregiver_id`) REFERENCES `caregivers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cp_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cp_revoked_by_patient` FOREIGN KEY (`revoked_by_patient_id`) REFERENCES `patients` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `caregiver_patients`
--

LOCK TABLES `caregiver_patients` WRITE;
/*!40000 ALTER TABLE `caregiver_patients` DISABLE KEYS */;
INSERT INTO `caregiver_patients` VALUES ('96a84e8d-9314-404f-847b-3b24d5addaa2','3c0c7623-bb5b-453c-8657-b85bd0443a55','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','Mother',0,'2026-09-09 00:50:39.707','active',NULL,NULL);
/*!40000 ALTER TABLE `caregiver_patients` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `caregiver_profiles`
--

DROP TABLE IF EXISTS `caregiver_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `caregiver_profiles` (
  `caregiver_id` char(36) NOT NULL,
  `display_name_enc` text DEFAULT NULL,
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`caregiver_id`),
  CONSTRAINT `fk_caregiver_profile_user` FOREIGN KEY (`caregiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `caregiver_profiles`
--

LOCK TABLES `caregiver_profiles` WRITE;
/*!40000 ALTER TABLE `caregiver_profiles` DISABLE KEYS */;
/*!40000 ALTER TABLE `caregiver_profiles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `caregivers`
--

DROP TABLE IF EXISTS `caregivers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `caregivers` (
  `id` char(36) NOT NULL,
  `full_name` varchar(255) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_caregivers_user` FOREIGN KEY (`id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `caregivers`
--

LOCK TABLES `caregivers` WRITE;
/*!40000 ALTER TABLE `caregivers` DISABLE KEYS */;
INSERT INTO `caregivers` VALUES ('3c0c7623-bb5b-453c-8657-b85bd0443a55','Dev Caregiver','2026-09-08 20:58:00.272');
/*!40000 ALTER TABLE `caregivers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `clinical_rule_revisions`
--

DROP TABLE IF EXISTS `clinical_rule_revisions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `clinical_rule_revisions` (
  `id` char(36) NOT NULL,
  `drug_id` char(36) NOT NULL,
  `rule_version` int(10) unsigned NOT NULL,
  `action` enum('SUBMITTED','VERIFIED','REJECTED','RETIRED') NOT NULL,
  `before_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`before_data`)),
  `after_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`after_data`)),
  `consistency_result` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`consistency_result`)),
  `reason` varchar(500) DEFAULT NULL,
  `reviewed_by` char(36) NOT NULL,
  `reviewer_license_number` varchar(100) DEFAULT NULL,
  `reviewer_license_jurisdiction` varchar(100) DEFAULT NULL,
  `reviewer_license_expires_on` date DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_clinical_revision_drug` (`drug_id`,`rule_version`),
  KEY `fk_clinical_revision_pharmacist` (`reviewed_by`),
  CONSTRAINT `fk_clinical_revision_drug` FOREIGN KEY (`drug_id`) REFERENCES `drug_reference` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_clinical_revision_pharmacist` FOREIGN KEY (`reviewed_by`) REFERENCES `pharmacists` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `clinical_rule_revisions`
--

LOCK TABLES `clinical_rule_revisions` WRITE;
/*!40000 ALTER TABLE `clinical_rule_revisions` DISABLE KEYS */;
/*!40000 ALTER TABLE `clinical_rule_revisions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `counseling_appointments`
--

DROP TABLE IF EXISTS `counseling_appointments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `counseling_appointments` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `patient_id` char(36) NOT NULL,
  `branch_id` char(36) NOT NULL,
  `pharmacist_id` char(36) DEFAULT NULL,
  `topic` enum('POST_DISPENSING','MEDICATION_REVIEW','MISSED_DOSE','SIDE_EFFECT_CONCERN','OTHER') NOT NULL DEFAULT 'POST_DISPENSING',
  `modality` enum('VIDEO','AUDIO','PHONE') NOT NULL DEFAULT 'VIDEO',
  `scheduled_start_at` datetime(3) NOT NULL,
  `duration_minutes` smallint(5) unsigned NOT NULL DEFAULT 30,
  `timezone` varchar(80) NOT NULL DEFAULT 'Asia/Manila',
  `meeting_url` varchar(1000) DEFAULT NULL,
  `session_instructions` varchar(500) DEFAULT NULL,
  `status` enum('REQUESTED','CONFIRMED','COMPLETED','DECLINED','CANCELLED') NOT NULL DEFAULT 'REQUESTED',
  `decision_reason` varchar(500) DEFAULT NULL,
  `requested_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `confirmed_at` datetime(3) DEFAULT NULL,
  `completed_at` datetime(3) DEFAULT NULL,
  `cancelled_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_counseling_patient` (`patient_id`,`scheduled_start_at`),
  KEY `idx_counseling_pharmacist` (`pharmacist_id`,`scheduled_start_at`,`status`),
  KEY `idx_counseling_branch` (`branch_id`,`status`,`scheduled_start_at`),
  CONSTRAINT `fk_counseling_branch` FOREIGN KEY (`branch_id`) REFERENCES `pharmacy_branches` (`id`),
  CONSTRAINT `fk_counseling_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_counseling_pharmacist` FOREIGN KEY (`pharmacist_id`) REFERENCES `pharmacists` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `counseling_appointments`
--

LOCK TABLES `counseling_appointments` WRITE;
/*!40000 ALTER TABLE `counseling_appointments` DISABLE KEYS */;
/*!40000 ALTER TABLE `counseling_appointments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `counseling_summaries`
--

DROP TABLE IF EXISTS `counseling_summaries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `counseling_summaries` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `appointment_id` char(36) NOT NULL,
  `patient_id` char(36) NOT NULL,
  `pharmacist_id` char(36) NOT NULL,
  `template_version` varchar(40) NOT NULL DEFAULT 'COUNSELING_V1',
  `status` enum('DRAFT','PUBLISHED','RETRACTED') NOT NULL DEFAULT 'DRAFT',
  `summary_text` text NOT NULL,
  `source_snapshot_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`source_snapshot_json`)),
  `reviewer_license_number` varchar(100) DEFAULT NULL,
  `reviewer_license_jurisdiction` varchar(100) DEFAULT NULL,
  `reviewer_license_expires_on` date DEFAULT NULL,
  `generated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `published_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_counseling_summary_appointment` (`appointment_id`),
  KEY `idx_counseling_summary_patient` (`patient_id`,`status`,`published_at`),
  KEY `fk_counseling_summary_pharmacist` (`pharmacist_id`),
  CONSTRAINT `fk_counseling_summary_appointment` FOREIGN KEY (`appointment_id`) REFERENCES `counseling_appointments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_counseling_summary_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_counseling_summary_pharmacist` FOREIGN KEY (`pharmacist_id`) REFERENCES `pharmacists` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `counseling_summaries`
--

LOCK TABLES `counseling_summaries` WRITE;
/*!40000 ALTER TABLE `counseling_summaries` DISABLE KEYS */;
/*!40000 ALTER TABLE `counseling_summaries` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `counseling_summary_revisions`
--

DROP TABLE IF EXISTS `counseling_summary_revisions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `counseling_summary_revisions` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `summary_id` char(36) NOT NULL,
  `version` int(10) unsigned NOT NULL,
  `action` enum('GENERATED','EDITED','PUBLISHED','RETRACTED') NOT NULL,
  `summary_text` text NOT NULL,
  `actor_user_id` char(36) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_counseling_summary_version` (`summary_id`,`version`),
  KEY `fk_counseling_revision_actor` (`actor_user_id`),
  CONSTRAINT `fk_counseling_revision_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_counseling_revision_summary` FOREIGN KEY (`summary_id`) REFERENCES `counseling_summaries` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `counseling_summary_revisions`
--

LOCK TABLES `counseling_summary_revisions` WRITE;
/*!40000 ALTER TABLE `counseling_summary_revisions` DISABLE KEYS */;
/*!40000 ALTER TABLE `counseling_summary_revisions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `delivery_requests`
--

DROP TABLE IF EXISTS `delivery_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `delivery_requests` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `patient_id` char(36) NOT NULL,
  `placed_by_user_id` char(36) DEFAULT NULL,
  `caregiver_id` char(36) DEFAULT NULL,
  `medication_id` char(36) DEFAULT NULL,
  `drug_id` char(36) DEFAULT NULL,
  `quantity` int(10) unsigned NOT NULL DEFAULT 1,
  `branch_id` char(36) NOT NULL,
  `delivery_address_enc` text DEFAULT NULL,
  `status` enum('pending','processing','out_for_delivery','delivered','cancelled') NOT NULL DEFAULT 'pending',
  `notes` text DEFAULT NULL,
  `payment_method` enum('CASH_ON_PICKUP','COD','CARD','GCASH') NOT NULL DEFAULT 'COD',
  `payment_status` enum('PENDING','AUTHORIZED','PAID','FAILED','REFUNDED') NOT NULL DEFAULT 'PENDING',
  `requested_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `fk_del_patient` (`patient_id`),
  KEY `fk_del_medication` (`medication_id`),
  KEY `fk_del_branch` (`branch_id`),
  KEY `fk_delivery_drug` (`drug_id`),
  KEY `fk_delivery_placed_by` (`placed_by_user_id`),
  KEY `fk_delivery_caregiver` (`caregiver_id`),
  CONSTRAINT `fk_del_branch` FOREIGN KEY (`branch_id`) REFERENCES `pharmacy_branches` (`id`),
  CONSTRAINT `fk_del_medication` FOREIGN KEY (`medication_id`) REFERENCES `medications` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_del_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_delivery_caregiver` FOREIGN KEY (`caregiver_id`) REFERENCES `caregivers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_delivery_drug` FOREIGN KEY (`drug_id`) REFERENCES `drug_reference` (`id`),
  CONSTRAINT `fk_delivery_placed_by` FOREIGN KEY (`placed_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `delivery_requests`
--

LOCK TABLES `delivery_requests` WRITE;
/*!40000 ALTER TABLE `delivery_requests` DISABLE KEYS */;
/*!40000 ALTER TABLE `delivery_requests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `dose_log_corrections`
--

DROP TABLE IF EXISTS `dose_log_corrections`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `dose_log_corrections` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `dose_log_id` char(36) NOT NULL,
  `schedule_id` char(36) NOT NULL,
  `patient_id` char(36) NOT NULL,
  `previous_logged_at` datetime(3) NOT NULL,
  `corrected_logged_at` datetime(3) NOT NULL,
  `previous_status` enum('taken','taken_late') NOT NULL,
  `corrected_status` enum('taken','taken_late') NOT NULL,
  `reason` varchar(255) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_dose_correction_patient` (`patient_id`,`created_at`),
  KEY `idx_dose_correction_log` (`dose_log_id`),
  KEY `fk_dose_correction_schedule` (`schedule_id`),
  CONSTRAINT `fk_dose_correction_log` FOREIGN KEY (`dose_log_id`) REFERENCES `dose_logs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dose_correction_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dose_correction_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `medication_schedules` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dose_log_corrections`
--

LOCK TABLES `dose_log_corrections` WRITE;
/*!40000 ALTER TABLE `dose_log_corrections` DISABLE KEYS */;
/*!40000 ALTER TABLE `dose_log_corrections` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `dose_logs`
--

DROP TABLE IF EXISTS `dose_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `dose_logs` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `schedule_id` char(36) NOT NULL,
  `patient_id` char(36) NOT NULL,
  `logged_at` datetime(3) NOT NULL,
  `confirmation_method` enum('fcm','local','manual','ocr') NOT NULL,
  `status` enum('taken','taken_late','missed','snoozed','duplicate') NOT NULL,
  `notes` text DEFAULT NULL,
  `synced` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_log_patient` (`patient_id`,`logged_at`),
  KEY `idx_log_schedule` (`schedule_id`),
  CONSTRAINT `fk_log_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_log_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `medication_schedules` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dose_logs`
--

LOCK TABLES `dose_logs` WRITE;
/*!40000 ALTER TABLE `dose_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `dose_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `drug_interactions`
--

DROP TABLE IF EXISTS `drug_interactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `drug_interactions` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `drug_a_id` char(36) NOT NULL,
  `drug_b_id` char(36) NOT NULL,
  `min_gap_hours` decimal(5,2) DEFAULT NULL,
  `interaction_type` enum('SPACING','AVOID','MONITOR','NONE') NOT NULL DEFAULT 'SPACING',
  `severity` enum('none','low','moderate','high','contraindicated') NOT NULL DEFAULT 'moderate',
  `notes` text DEFAULT NULL,
  `verified_by` char(36) DEFAULT NULL,
  `verified_at` datetime(3) DEFAULT NULL,
  `is_provisional` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_interaction_pair` (`drug_a_id`,`drug_b_id`),
  KEY `fk_di_drug_b` (`drug_b_id`),
  KEY `fk_di_verified_by` (`verified_by`),
  CONSTRAINT `fk_di_drug_a` FOREIGN KEY (`drug_a_id`) REFERENCES `drug_reference` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_di_drug_b` FOREIGN KEY (`drug_b_id`) REFERENCES `drug_reference` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_di_verified_by` FOREIGN KEY (`verified_by`) REFERENCES `pharmacists` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `drug_interactions`
--

LOCK TABLES `drug_interactions` WRITE;
/*!40000 ALTER TABLE `drug_interactions` DISABLE KEYS */;
INSERT INTO `drug_interactions` VALUES ('eba8f9b9-ab84-11f1-87c9-b81ea4916ecc','c19443f3-82d4-4a26-a357-890f62ac861e','d4db6c70-01e6-4bb9-baee-d80cf129e912',1.00,'SPACING','low',NULL,'710f0ea6-2149-4138-aa4d-0d89bcc220e2','2026-09-08 20:58:00.000',0,'2026-09-08 20:58:00.294');
/*!40000 ALTER TABLE `drug_interactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `drug_reference`
--

DROP TABLE IF EXISTS `drug_reference`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `drug_reference` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `generic_name` varchar(255) NOT NULL,
  `brand_names_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`brand_names_json`)),
  `category` varchar(100) DEFAULT NULL,
  `therapeutic_category` varchar(150) DEFAULT NULL,
  `drug_class` varchar(150) DEFAULT NULL,
  `common_uses` text DEFAULT NULL,
  `short_description` text DEFAULT NULL,
  `common_strength` varchar(100) DEFAULT NULL,
  `dosage_form` varchar(100) DEFAULT NULL,
  `administration_route` varchar(50) DEFAULT NULL,
  `release_type` enum('IMMEDIATE_RELEASE','EXTENDED_RELEASE','DELAYED_RELEASE','NOT_APPLICABLE','UNKNOWN') DEFAULT NULL,
  `catalog_source` varchar(255) DEFAULT NULL,
  `catalog_status` enum('VERIFIED','INCOMPLETE','RETIRED') NOT NULL DEFAULT 'INCOMPLETE',
  `is_restricted` tinyint(1) NOT NULL DEFAULT 0,
  `rx_class` enum('OTC','RX') NOT NULL DEFAULT 'RX',
  `min_interval_hours` decimal(5,2) DEFAULT NULL,
  `max_daily_doses` tinyint(3) unsigned DEFAULT NULL,
  `default_units_per_dose` decimal(6,2) DEFAULT NULL,
  `is_prn_default` tinyint(1) NOT NULL DEFAULT 0,
  `default_interval_hours` decimal(5,2) DEFAULT NULL,
  `meal_anchor_code` enum('NONE','AC','PC','WITH_MEAL','HS') NOT NULL DEFAULT 'NONE',
  `meal_instruction` varchar(255) DEFAULT NULL,
  `food_rule` enum('WITH_MEAL','EMPTY_STOMACH','BEFORE_MEAL','AFTER_MEAL','BEDTIME','NONE') NOT NULL DEFAULT 'NONE',
  `clinical_rationale` varchar(500) DEFAULT NULL,
  `clinical_rule_status` enum('UNVERIFIED','IN_REVIEW','VERIFIED','REJECTED','RETIRED') NOT NULL DEFAULT 'UNVERIFIED',
  `administration_instruction` varchar(500) DEFAULT NULL,
  `guidance_do` text DEFAULT NULL,
  `guidance_dont` text DEFAULT NULL,
  `evidence_source_url` varchar(500) DEFAULT NULL,
  `clinical_source_name` varchar(255) DEFAULT NULL,
  `source_revision_date` date DEFAULT NULL,
  `evidence_reviewed_at` date DEFAULT NULL,
  `rule_version` int(10) unsigned NOT NULL DEFAULT 1,
  `clinical_rejection_reason` varchar(500) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `frequency_default` varchar(100) DEFAULT NULL,
  `supported_frequency_codes` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`supported_frequency_codes`)),
  `availability` tinyint(1) NOT NULL DEFAULT 1,
  `stock_quantity` int(10) unsigned NOT NULL DEFAULT 0,
  `verified_by` char(36) DEFAULT NULL,
  `verified_at` datetime(3) DEFAULT NULL,
  `is_provisional` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_drug_generic` (`generic_name`),
  KEY `fk_drug_verified_by` (`verified_by`),
  KEY `idx_drug_rx_category` (`rx_class`,`therapeutic_category`),
  KEY `idx_drug_automation_search` (`availability`,`clinical_rule_status`,`generic_name`),
  KEY `idx_drug_verification_queue` (`catalog_status`,`clinical_rule_status`,`availability`),
  CONSTRAINT `fk_drug_verified_by` FOREIGN KEY (`verified_by`) REFERENCES `pharmacists` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `drug_reference`
--

LOCK TABLES `drug_reference` WRITE;
/*!40000 ALTER TABLE `drug_reference` DISABLE KEYS */;
INSERT INTO `drug_reference` VALUES ('c19443f3-82d4-4a26-a357-890f62ac861e','Amoxicillin','[\"Amoxil\",\"Trimox\"]',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'INCOMPLETE',0,'RX',8.00,3,NULL,0,NULL,'NONE',NULL,'NONE',NULL,'UNVERIFIED',NULL,NULL,NULL,NULL,NULL,NULL,NULL,1,NULL,NULL,'TID',NULL,1,0,'710f0ea6-2149-4138-aa4d-0d89bcc220e2','2026-09-08 20:58:00.000',0,'2026-09-08 20:58:00.286'),('d4db6c70-01e6-4bb9-baee-d80cf129e912','Paracetamol','[\"Biogesic\",\"Tempra\"]',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'INCOMPLETE',0,'RX',4.00,6,NULL,0,NULL,'NONE',NULL,'NONE',NULL,'UNVERIFIED',NULL,NULL,NULL,NULL,NULL,NULL,NULL,1,NULL,NULL,'q4h',NULL,1,0,'710f0ea6-2149-4138-aa4d-0d89bcc220e2','2026-09-08 20:58:00.000',0,'2026-09-08 20:58:00.286');
/*!40000 ALTER TABLE `drug_reference` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inquiry_consent_events`
--

DROP TABLE IF EXISTS `inquiry_consent_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `inquiry_consent_events` (
  `id` char(36) NOT NULL,
  `patient_id` char(36) NOT NULL,
  `actor_user_id` char(36) NOT NULL,
  `action` enum('ACCEPTED','WITHDRAWN') NOT NULL,
  `policy_version` varchar(40) NOT NULL,
  `occurred_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_inquiry_consent_patient` (`patient_id`,`occurred_at`),
  KEY `fk_inquiry_consent_actor` (`actor_user_id`),
  CONSTRAINT `fk_inquiry_consent_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_inquiry_consent_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inquiry_consent_events`
--

LOCK TABLES `inquiry_consent_events` WRITE;
/*!40000 ALTER TABLE `inquiry_consent_events` DISABLE KEYS */;
INSERT INTO `inquiry_consent_events` VALUES ('7672a13c-c50e-4379-a733-aa84a88d0e60','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','ACCEPTED','2026-09-06','2026-09-09 02:36:13.530'),('7e3bb5fa-39b5-4c6c-8596-e7f7aaf9517a','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','ACCEPTED','2026-09-06','2026-09-09 02:13:00.339'),('7f6bedf6-9250-4b51-8edc-372a31b41227','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','WITHDRAWN','2026-09-06','2026-09-09 02:13:02.267'),('88bb1200-c9ec-4f12-ab54-ac136379a752','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','ACCEPTED','2026-09-06','2026-09-09 02:33:40.321'),('8ee0161d-99f0-4c51-9805-7c90c8d0f7d0','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','WITHDRAWN','2026-09-06','2026-09-09 02:33:42.212');
/*!40000 ALTER TABLE `inquiry_consent_events` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inquiry_messages`
--

DROP TABLE IF EXISTS `inquiry_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `inquiry_messages` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `thread_id` char(36) NOT NULL,
  `sender_role` enum('patient','pharmacist') NOT NULL,
  `message` text NOT NULL,
  `sent_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_msg_thread` (`thread_id`),
  CONSTRAINT `fk_msg_thread` FOREIGN KEY (`thread_id`) REFERENCES `inquiry_threads` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inquiry_messages`
--

LOCK TABLES `inquiry_messages` WRITE;
/*!40000 ALTER TABLE `inquiry_messages` DISABLE KEYS */;
/*!40000 ALTER TABLE `inquiry_messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inquiry_threads`
--

DROP TABLE IF EXISTS `inquiry_threads`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `inquiry_threads` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `patient_id` char(36) NOT NULL,
  `pharmacist_id` char(36) DEFAULT NULL,
  `branch_id` char(36) DEFAULT NULL,
  `requested_pharmacist_id` char(36) DEFAULT NULL,
  `status` enum('open','closed') NOT NULL DEFAULT 'open',
  `priority` enum('normal','high') NOT NULL DEFAULT 'normal',
  `subject` varchar(255) DEFAULT NULL,
  `medication_draft_key` varchar(120) DEFAULT NULL,
  `opened_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `closed_at` datetime(3) DEFAULT NULL,
  `consent_policy_version` varchar(40) DEFAULT NULL,
  `consent_accepted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_thread_patient` (`patient_id`),
  KEY `idx_thread_pharmacist` (`pharmacist_id`),
  KEY `fk_thread_branch` (`branch_id`),
  KEY `idx_thread_requested_pharmacist` (`requested_pharmacist_id`),
  KEY `idx_inquiry_medication_draft` (`patient_id`,`medication_draft_key`),
  CONSTRAINT `fk_thread_branch` FOREIGN KEY (`branch_id`) REFERENCES `pharmacy_branches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_thread_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_thread_pharmacist` FOREIGN KEY (`pharmacist_id`) REFERENCES `pharmacists` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_thread_requested_pharmacist` FOREIGN KEY (`requested_pharmacist_id`) REFERENCES `pharmacists` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inquiry_threads`
--

LOCK TABLES `inquiry_threads` WRITE;
/*!40000 ALTER TABLE `inquiry_threads` DISABLE KEYS */;
/*!40000 ALTER TABLE `inquiry_threads` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `invite_codes`
--

DROP TABLE IF EXISTS `invite_codes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `invite_codes` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `patient_id` char(36) NOT NULL,
  `code` varchar(64) DEFAULT NULL,
  `token_hash` char(64) DEFAULT NULL,
  `expires_at` datetime(3) NOT NULL,
  `used` tinyint(1) NOT NULL DEFAULT 0,
  `used_at` datetime(3) DEFAULT NULL,
  `used_by_caregiver_id` char(36) DEFAULT NULL,
  `revoked_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_invite_code` (`code`),
  UNIQUE KEY `uq_invite_token_hash` (`token_hash`),
  KEY `idx_invite_patient_active` (`patient_id`,`used`,`revoked_at`,`expires_at`),
  KEY `fk_invite_used_by_caregiver` (`used_by_caregiver_id`),
  CONSTRAINT `fk_invite_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_invite_used_by_caregiver` FOREIGN KEY (`used_by_caregiver_id`) REFERENCES `caregivers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invite_codes`
--

LOCK TABLES `invite_codes` WRITE;
/*!40000 ALTER TABLE `invite_codes` DISABLE KEYS */;
INSERT INTO `invite_codes` VALUES ('31ae2f1d-bde3-4331-bcc3-56e48a69ab90','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e',NULL,'8cc34c1061a73044faeafafbb21bc25db87213fb555e1cf2105645905baece91','2026-09-09 01:05:31.894',1,'2026-09-09 00:50:39.705','3c0c7623-bb5b-453c-8657-b85bd0443a55',NULL,'2026-09-09 00:50:31.902'),('f3da2f33-aad8-4b78-96db-603b0c830faa','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e',NULL,'23302138efdc20a555027fc1b0511a1e2e5ac8b572133ae0172a1f57fdc0ca93','2026-09-08 21:17:47.201',0,NULL,NULL,'2026-09-09 00:50:31.899','2026-09-08 21:02:47.214');
/*!40000 ALTER TABLE `invite_codes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Temporary table structure for view `medication_automation_coverage`
--

DROP TABLE IF EXISTS `medication_automation_coverage`;
/*!50001 DROP VIEW IF EXISTS `medication_automation_coverage`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8;
/*!50001 CREATE VIEW `medication_automation_coverage` AS SELECT
 1 AS `drug_id`,
  1 AS `generic_name`,
  1 AS `common_strength`,
  1 AS `dosage_form`,
  1 AS `rx_class`,
  1 AS `clinical_rule_status`,
  1 AS `rule_version`,
  1 AS `rule_kind`,
  1 AS `base_automation_status`,
  1 AS `safety_status`,
  1 AS `safety_rule_version`,
  1 AS `effective_automation_status`,
  1 AS `effective_block_reason` */;
SET character_set_client = @saved_cs_client;

--
-- Temporary table structure for view `medication_catalog`
--

DROP TABLE IF EXISTS `medication_catalog`;
/*!50001 DROP VIEW IF EXISTS `medication_catalog`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8;
/*!50001 CREATE VIEW `medication_catalog` AS SELECT
 1 AS `id`,
  1 AS `generic_name`,
  1 AS `brand_name`,
  1 AS `dosage_form`,
  1 AS `default_strength`,
  1 AS `standard_frequency`,
  1 AS `food_rule`,
  1 AS `min_interval_hours`,
  1 AS `clinical_rationale`,
  1 AS `clinical_rule_status`,
  1 AS `availability` */;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `medication_history`
--

DROP TABLE IF EXISTS `medication_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `medication_history` (
  `id` char(36) NOT NULL,
  `medication_id` char(36) NOT NULL,
  `patient_id` char(36) NOT NULL,
  `actor_id` char(36) NOT NULL,
  `actor_role` enum('patient','pharmacist','admin','system') NOT NULL,
  `event_type` enum('updated','stopped','cancelled') NOT NULL,
  `before_info` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`before_info`)),
  `after_info` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`after_info`)),
  `event_time` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_med_history_patient` (`patient_id`,`event_time`,`id`),
  KEY `idx_med_history_medication` (`medication_id`,`event_time`),
  KEY `fk_med_history_actor` (`actor_id`),
  CONSTRAINT `fk_med_history_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_med_history_medication` FOREIGN KEY (`medication_id`) REFERENCES `medications` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_med_history_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `medication_history`
--

LOCK TABLES `medication_history` WRITE;
/*!40000 ALTER TABLE `medication_history` DISABLE KEYS */;
/*!40000 ALTER TABLE `medication_history` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Temporary table structure for view `medication_rule_coverage`
--

DROP TABLE IF EXISTS `medication_rule_coverage`;
/*!50001 DROP VIEW IF EXISTS `medication_rule_coverage`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8;
/*!50001 CREATE VIEW `medication_rule_coverage` AS SELECT
 1 AS `drug_id`,
  1 AS `generic_name`,
  1 AS `common_strength`,
  1 AS `dosage_form`,
  1 AS `rx_class`,
  1 AS `rule_kind`,
  1 AS `automation_status`,
  1 AS `automation_block_reason`,
  1 AS `schedule_rule_status`,
  1 AS `source_name`,
  1 AS `source_url`,
  1 AS `rule_version`,
  1 AS `assessed_at` */;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `medication_rule_variants`
--

DROP TABLE IF EXISTS `medication_rule_variants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `medication_rule_variants` (
  `id` char(36) NOT NULL,
  `drug_id` char(36) NOT NULL,
  `strength` varchar(100) DEFAULT NULL,
  `dosage_form` varchar(100) DEFAULT NULL,
  `administration_route` varchar(50) DEFAULT NULL,
  `release_type` enum('IMMEDIATE_RELEASE','EXTENDED_RELEASE','DELAYED_RELEASE','NOT_APPLICABLE','UNKNOWN') DEFAULT NULL,
  `supported_frequency_codes` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`supported_frequency_codes`)),
  `frequency_code` varchar(100) DEFAULT NULL,
  `daily_dose_count` tinyint(3) unsigned DEFAULT NULL,
  `min_interval_hours` decimal(5,2) DEFAULT NULL,
  `max_daily_doses` tinyint(3) unsigned DEFAULT NULL,
  `food_rule` varchar(30) DEFAULT NULL,
  `bedtime_required` tinyint(1) NOT NULL DEFAULT 0,
  `administration_instruction` text DEFAULT NULL,
  `clinical_rationale` text DEFAULT NULL,
  `guidance_do` text DEFAULT NULL,
  `guidance_dont` text DEFAULT NULL,
  `source_name` varchar(255) DEFAULT NULL,
  `source_url` varchar(1000) DEFAULT NULL,
  `source_revision_date` date DEFAULT NULL,
  `evidence_reviewed_at` date DEFAULT NULL,
  `reviewed_by` char(36) DEFAULT NULL,
  `verified_at` datetime(3) DEFAULT NULL,
  `schedule_rule_status` enum('UNVERIFIED','IN_REVIEW','VERIFIED','REJECTED','RETIRED') NOT NULL DEFAULT 'UNVERIFIED',
  `rule_kind` enum('FIXED_DAILY','FIXED_INTERVAL','MEAL_ANCHORED','BEDTIME','PRN','PATIENT_SPECIFIC','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
  `automation_status` enum('READY_VERIFIED','READY_REFERENCE','NEEDS_EVIDENCE','NEEDS_DIRECTIONS','MANUAL_ONLY') NOT NULL DEFAULT 'NEEDS_EVIDENCE',
  `automation_block_reason` varchar(500) DEFAULT NULL,
  `assessed_at` datetime(3) DEFAULT NULL,
  `rule_version` int(10) unsigned NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_medication_rule_variant` (`drug_id`,`strength`,`dosage_form`),
  KEY `fk_medication_rule_variant_reviewer` (`reviewed_by`),
  CONSTRAINT `fk_medication_rule_variant_drug` FOREIGN KEY (`drug_id`) REFERENCES `drug_reference` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_medication_rule_variant_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `pharmacists` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `medication_rule_variants`
--

LOCK TABLES `medication_rule_variants` WRITE;
/*!40000 ALTER TABLE `medication_rule_variants` DISABLE KEYS */;
INSERT INTO `medication_rule_variants` VALUES ('eba9f2c5-ab84-11f1-87c9-b81ea4916ecc','c19443f3-82d4-4a26-a357-890f62ac861e',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'UNVERIFIED','UNKNOWN','NEEDS_EVIDENCE',NULL,NULL,1,'2026-09-08 20:58:00.299','2026-09-08 20:58:00.299'),('eba9f4da-ab84-11f1-87c9-b81ea4916ecc','d4db6c70-01e6-4bb9-baee-d80cf129e912',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'UNVERIFIED','UNKNOWN','NEEDS_EVIDENCE',NULL,NULL,1,'2026-09-08 20:58:00.299','2026-09-08 20:58:00.299');
/*!40000 ALTER TABLE `medication_rule_variants` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `medication_safety_rules`
--

DROP TABLE IF EXISTS `medication_safety_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `medication_safety_rules` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `drug_id` char(36) NOT NULL,
  `population_key` varchar(120) NOT NULL DEFAULT 'ADULT',
  `allergy_terms_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`allergy_terms_json`)),
  `condition_rules_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`condition_rules_json`)),
  `minimum_age_years` decimal(5,2) DEFAULT NULL,
  `maximum_age_years` decimal(5,2) DEFAULT NULL,
  `minimum_weight_kg` decimal(6,2) DEFAULT NULL,
  `maximum_weight_kg` decimal(6,2) DEFAULT NULL,
  `age_reviewed` tinyint(1) NOT NULL DEFAULT 0,
  `weight_reviewed` tinyint(1) NOT NULL DEFAULT 0,
  `allergies_reviewed` tinyint(1) NOT NULL DEFAULT 0,
  `conditions_reviewed` tinyint(1) NOT NULL DEFAULT 0,
  `interactions_reviewed` tinyint(1) NOT NULL DEFAULT 0,
  `pregnancy_action` enum('ALLOW','REVIEW','BLOCK') DEFAULT NULL,
  `breastfeeding_action` enum('ALLOW','REVIEW','BLOCK') DEFAULT NULL,
  `kidney_action` enum('ALLOW','REVIEW','BLOCK') DEFAULT NULL,
  `liver_action` enum('ALLOW','REVIEW','BLOCK') DEFAULT NULL,
  `source_name` varchar(255) DEFAULT NULL,
  `source_url` varchar(1000) DEFAULT NULL,
  `source_revision_date` date DEFAULT NULL,
  `evidence_notes` text DEFAULT NULL,
  `safety_status` enum('DRAFT','IN_REVIEW','VERIFIED','REJECTED','RETIRED') NOT NULL DEFAULT 'DRAFT',
  `rule_version` int(10) unsigned NOT NULL DEFAULT 1,
  `prepared_by_user_id` char(36) DEFAULT NULL,
  `submitted_at` datetime(3) DEFAULT NULL,
  `verified_by` char(36) DEFAULT NULL,
  `verified_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_medication_safety_population` (`drug_id`,`population_key`),
  KEY `idx_medication_safety_status` (`safety_status`),
  KEY `fk_medication_safety_prepared_by` (`prepared_by_user_id`),
  KEY `fk_medication_safety_verified_by` (`verified_by`),
  CONSTRAINT `fk_medication_safety_drug` FOREIGN KEY (`drug_id`) REFERENCES `drug_reference` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_medication_safety_prepared_by` FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_medication_safety_verified_by` FOREIGN KEY (`verified_by`) REFERENCES `pharmacists` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `medication_safety_rules`
--

LOCK TABLES `medication_safety_rules` WRITE;
/*!40000 ALTER TABLE `medication_safety_rules` DISABLE KEYS */;
/*!40000 ALTER TABLE `medication_safety_rules` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `medication_schedule_audit`
--

DROP TABLE IF EXISTS `medication_schedule_audit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `medication_schedule_audit` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `medication_id` char(36) NOT NULL,
  `patient_id` char(36) NOT NULL,
  `actor_id` char(36) NOT NULL,
  `actor_role` enum('patient','caregiver','pharmacist','admin','system') NOT NULL,
  `before_info` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`before_info`)),
  `after_info` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`after_info`)),
  `changed_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_schedule_audit_patient` (`patient_id`,`changed_at`),
  KEY `fk_schedule_audit_medication` (`medication_id`),
  KEY `fk_schedule_audit_actor` (`actor_id`),
  CONSTRAINT `fk_schedule_audit_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_schedule_audit_medication` FOREIGN KEY (`medication_id`) REFERENCES `medications` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_schedule_audit_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `medication_schedule_audit`
--

LOCK TABLES `medication_schedule_audit` WRITE;
/*!40000 ALTER TABLE `medication_schedule_audit` DISABLE KEYS */;
/*!40000 ALTER TABLE `medication_schedule_audit` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `medication_schedules`
--

DROP TABLE IF EXISTS `medication_schedules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `medication_schedules` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `medication_id` char(36) NOT NULL,
  `patient_id` char(36) NOT NULL,
  `scheduled_time` datetime(3) NOT NULL,
  `generated_reason` varchar(500) NOT NULL,
  `schedule_source` enum('SUGGESTED','REFERENCE','MANUAL') NOT NULL DEFAULT 'SUGGESTED',
  `clinical_rule_version` int(10) unsigned DEFAULT NULL,
  `evidence_source_url` varchar(1000) DEFAULT NULL,
  `review_requirement` enum('STANDARD_REVIEW','PRESCRIPTION_MATCH_CONFIRMED','LABEL_MATCH_CONFIRMED','PRESCRIPTION_DIRECTIONS') NOT NULL DEFAULT 'STANDARD_REVIEW',
  `is_confirmed` tinyint(1) NOT NULL DEFAULT 0,
  `is_prn_slot` tinyint(1) NOT NULL DEFAULT 0,
  `schedule_version` smallint(5) unsigned NOT NULL DEFAULT 1,
  `status` enum('scheduled','taken','taken_late','missed','snoozed','skipped') NOT NULL DEFAULT 'scheduled',
  `reminder_sent_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_medication_dose_version` (`medication_id`,`scheduled_time`,`schedule_version`),
  KEY `idx_sched_patient` (`patient_id`,`scheduled_time`),
  KEY `idx_sched_med` (`medication_id`),
  KEY `idx_sched_reminder` (`status`,`reminder_sent_at`,`scheduled_time`),
  KEY `idx_schedule_clinical_rule_version` (`medication_id`,`clinical_rule_version`),
  CONSTRAINT `fk_sched_medication` FOREIGN KEY (`medication_id`) REFERENCES `medications` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sched_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `medication_schedules`
--

LOCK TABLES `medication_schedules` WRITE;
/*!40000 ALTER TABLE `medication_schedules` DISABLE KEYS */;
/*!40000 ALTER TABLE `medication_schedules` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `medications`
--

DROP TABLE IF EXISTS `medications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `medications` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `patient_id` char(36) NOT NULL,
  `drug_id` char(36) DEFAULT NULL,
  `drug_name_raw` varchar(255) NOT NULL,
  `brand_name_snapshot` varchar(255) DEFAULT NULL,
  `strength_value` decimal(10,3) DEFAULT NULL,
  `strength_unit` varchar(20) DEFAULT NULL,
  `dosage_form_snapshot` varchar(80) DEFAULT NULL,
  `release_type_snapshot` varchar(80) DEFAULT NULL,
  `source` enum('RX_VALIDATED','OTC_SELF') NOT NULL,
  `is_prn` tinyint(1) NOT NULL DEFAULT 0,
  `frequency` varchar(255) DEFAULT NULL,
  `frequency_code` varchar(100) DEFAULT NULL,
  `schedule_type` enum('SPECIFIC_TIMES','EVERY_N_HOURS','ONCE_DAILY','TWICE_DAILY','THREE_TIMES_DAILY','SPECIFIC_DAYS','WEEKLY','AS_NEEDED') DEFAULT NULL,
  `schedule_times` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`schedule_times`)),
  `interval_hours` smallint(5) unsigned DEFAULT NULL,
  `interval_start_time` time DEFAULT NULL,
  `schedule_days` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`schedule_days`)),
  `schedule_status` enum('DRAFT','NEEDS_REVIEW','PENDING_APPROVAL','APPROVED','REJECTED','MODIFIED') NOT NULL DEFAULT 'APPROVED',
  `schedule_updated_by` char(36) DEFAULT NULL,
  `schedule_updated_at` datetime(3) DEFAULT NULL,
  `schedule_approved_by` char(36) DEFAULT NULL,
  `schedule_approved_at` datetime(3) DEFAULT NULL,
  `max_daily_doses_snapshot` tinyint(3) unsigned DEFAULT NULL,
  `min_interval_hours_snapshot` decimal(5,2) DEFAULT NULL,
  `dose_limit_basis` enum('CLINICAL_RULE','REFERENCE_LABEL','PATIENT_LABEL','PRESCRIPTION_DIRECTIONS') DEFAULT NULL,
  `dosage_instruction` text DEFAULT NULL,
  `label_direction` varchar(500) DEFAULT NULL,
  `purpose` varchar(255) DEFAULT NULL,
  `food_instruction` varchar(255) DEFAULT NULL,
  `timing_note` varchar(500) DEFAULT NULL,
  `quantity_on_hand` decimal(10,2) DEFAULT NULL,
  `quantity_unit` varchar(50) DEFAULT NULL,
  `refill_reminders_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `entry_method` enum('MANUAL','OCR') NOT NULL DEFAULT 'MANUAL',
  `ocr_confidence` decimal(5,4) DEFAULT NULL,
  `patient_confirmed` tinyint(1) NOT NULL DEFAULT 0,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `status` enum('pending_validation','pending_drug','active','completed','cancelled') NOT NULL DEFAULT 'pending_validation',
  `pharmacist_id` char(36) DEFAULT NULL,
  `validated_at` datetime(3) DEFAULT NULL,
  `prescription_photo_id` char(36) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_med_patient` (`patient_id`),
  KEY `idx_med_drug` (`drug_id`),
  KEY `fk_med_pharmacist` (`pharmacist_id`),
  KEY `idx_medication_patient_active_drug` (`patient_id`,`status`,`drug_id`),
  KEY `fk_med_schedule_updated_by` (`schedule_updated_by`),
  KEY `fk_med_schedule_approved_by` (`schedule_approved_by`),
  CONSTRAINT `fk_med_drug` FOREIGN KEY (`drug_id`) REFERENCES `drug_reference` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_med_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_med_pharmacist` FOREIGN KEY (`pharmacist_id`) REFERENCES `pharmacists` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_med_schedule_approved_by` FOREIGN KEY (`schedule_approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_med_schedule_updated_by` FOREIGN KEY (`schedule_updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `medications`
--

LOCK TABLES `medications` WRITE;
/*!40000 ALTER TABLE `medications` DISABLE KEYS */;
/*!40000 ALTER TABLE `medications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ocr_scan_evaluations`
--

DROP TABLE IF EXISTS `ocr_scan_evaluations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ocr_scan_evaluations` (
  `id` char(36) NOT NULL,
  `patient_id` char(36) NOT NULL,
  `purpose` enum('MEDICINE_LABEL','PRESCRIPTION') NOT NULL DEFAULT 'MEDICINE_LABEL',
  `engine` varchar(80) NOT NULL DEFAULT 'GOOGLE_ML_KIT_TEXT_RECOGNITION_V2',
  `engine_version` varchar(40) NOT NULL,
  `sample_country` char(2) NOT NULL DEFAULT 'PH',
  `sample_code` varchar(80) DEFAULT NULL,
  `device_platform` varchar(40) NOT NULL,
  `device_model` varchar(120) DEFAULT NULL,
  `app_version` varchar(40) DEFAULT NULL,
  `offline_mode` tinyint(1) NOT NULL DEFAULT 0,
  `processing_ms` int(10) unsigned DEFAULT NULL,
  `image_quality` enum('GOOD','BLURRY','INCOMPLETE','LOW_LIGHT','TOO_SMALL','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
  `image_quality_score` decimal(5,4) DEFAULT NULL,
  `field_confidence` decimal(5,4) DEFAULT NULL,
  `confidence_threshold` decimal(5,4) NOT NULL DEFAULT 0.7500,
  `outcome` enum('ACCEPTED','MANUAL_REVIEW','RECAPTURE_REQUIRED','UNAVAILABLE') NOT NULL,
  `detected_name` varchar(255) DEFAULT NULL,
  `detected_strength` varchar(100) DEFAULT NULL,
  `detected_formulation` varchar(100) DEFAULT NULL,
  `confirmed_name` varchar(255) DEFAULT NULL,
  `confirmed_strength` varchar(100) DEFAULT NULL,
  `confirmed_formulation` varchar(100) DEFAULT NULL,
  `name_accuracy_pct` decimal(5,2) DEFAULT NULL,
  `strength_accuracy_pct` decimal(5,2) DEFAULT NULL,
  `formulation_accuracy_pct` decimal(5,2) DEFAULT NULL,
  `field_accuracy_pct` decimal(5,2) DEFAULT NULL,
  `manual_correction_used` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_ocr_evaluation_created` (`created_at`),
  KEY `idx_ocr_evaluation_quality` (`image_quality`,`outcome`),
  KEY `idx_ocr_evaluation_device` (`device_platform`,`device_model`),
  KEY `fk_ocr_evaluation_patient` (`patient_id`),
  CONSTRAINT `fk_ocr_evaluation_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ocr_scan_evaluations`
--

LOCK TABLES `ocr_scan_evaluations` WRITE;
/*!40000 ALTER TABLE `ocr_scan_evaluations` DISABLE KEYS */;
/*!40000 ALTER TABLE `ocr_scan_evaluations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `order_prescriptions`
--

DROP TABLE IF EXISTS `order_prescriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `order_prescriptions` (
  `id` char(36) NOT NULL,
  `order_kind` enum('refill','delivery') NOT NULL,
  `order_id` char(36) NOT NULL,
  `patient_id` char(36) NOT NULL,
  `stored_filename` varchar(255) NOT NULL,
  `status` enum('pending','approved','rejected','needs_resubmission') NOT NULL DEFAULT 'pending',
  `reviewed_by` char(36) DEFAULT NULL,
  `reviewed_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_order_prescription` (`order_kind`,`order_id`),
  KEY `idx_order_rx_review` (`status`,`created_at`),
  KEY `fk_order_rx_patient` (`patient_id`),
  KEY `fk_order_rx_reviewer` (`reviewed_by`),
  CONSTRAINT `fk_order_rx_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_order_rx_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `pharmacists` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `order_prescriptions`
--

LOCK TABLES `order_prescriptions` WRITE;
/*!40000 ALTER TABLE `order_prescriptions` DISABLE KEYS */;
/*!40000 ALTER TABLE `order_prescriptions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `order_status_history`
--

DROP TABLE IF EXISTS `order_status_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `order_status_history` (
  `id` char(36) NOT NULL,
  `order_kind` enum('refill','delivery') NOT NULL,
  `order_id` char(36) NOT NULL,
  `from_status` varchar(32) DEFAULT NULL,
  `to_status` varchar(32) NOT NULL,
  `changed_by` char(36) DEFAULT NULL,
  `changed_by_role` varchar(24) NOT NULL,
  `changed_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_order_history` (`order_kind`,`order_id`,`changed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `order_status_history`
--

LOCK TABLES `order_status_history` WRITE;
/*!40000 ALTER TABLE `order_status_history` DISABLE KEYS */;
/*!40000 ALTER TABLE `order_status_history` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `otc_label_evidence`
--

DROP TABLE IF EXISTS `otc_label_evidence`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `otc_label_evidence` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `drug_id` char(36) NOT NULL,
  `product_name` varchar(255) DEFAULT NULL,
  `registration_number` varchar(120) DEFAULT NULL,
  `manufacturer` varchar(255) DEFAULT NULL,
  `population_key` varchar(120) NOT NULL DEFAULT 'ADULT',
  `indication_key` varchar(160) DEFAULT NULL,
  `label_strength` varchar(100) DEFAULT NULL,
  `label_dosage_form` varchar(100) DEFAULT NULL,
  `directions_text` text DEFAULT NULL,
  `schedule_type` enum('FIXED_DAILY','FIXED_INTERVAL','MEAL_ANCHORED','BEDTIME','SHORT_COURSE','PRN_TRACKER') DEFAULT NULL,
  `frequency_code` varchar(100) DEFAULT NULL,
  `units_per_dose` decimal(6,2) DEFAULT NULL,
  `min_interval_hours` decimal(5,2) DEFAULT NULL,
  `max_daily_doses` tinyint(3) unsigned DEFAULT NULL,
  `duration_days` smallint(5) unsigned DEFAULT NULL,
  `food_rule` varchar(30) DEFAULT NULL,
  `minimum_age` smallint(5) unsigned DEFAULT NULL,
  `maximum_age` smallint(5) unsigned DEFAULT NULL,
  `source_authority` varchar(120) DEFAULT NULL,
  `source_url` varchar(1000) DEFAULT NULL,
  `source_revision_date` date DEFAULT NULL,
  `evidence_status` enum('MISSING','COLLECTED','REVIEWED','READY','REJECTED','RETIRED') NOT NULL DEFAULT 'MISSING',
  `evidence_version` int(10) unsigned NOT NULL DEFAULT 1,
  `prepared_by_user_id` char(36) DEFAULT NULL,
  `submitted_at` datetime(3) DEFAULT NULL,
  `evidence_notes` varchar(500) DEFAULT NULL,
  `reviewed_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_otc_evidence_variant` (`drug_id`,`population_key`,`indication_key`),
  KEY `idx_otc_evidence_status` (`evidence_status`),
  KEY `fk_otc_evidence_prepared_by` (`prepared_by_user_id`),
  CONSTRAINT `fk_otc_evidence_drug` FOREIGN KEY (`drug_id`) REFERENCES `drug_reference` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_otc_evidence_prepared_by` FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `otc_label_evidence`
--

LOCK TABLES `otc_label_evidence` WRITE;
/*!40000 ALTER TABLE `otc_label_evidence` DISABLE KEYS */;
/*!40000 ALTER TABLE `otc_label_evidence` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Temporary table structure for view `otc_rule_evidence_queue`
--

DROP TABLE IF EXISTS `otc_rule_evidence_queue`;
/*!50001 DROP VIEW IF EXISTS `otc_rule_evidence_queue`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8;
/*!50001 CREATE VIEW `otc_rule_evidence_queue` AS SELECT
 1 AS `drug_id`,
  1 AS `generic_name`,
  1 AS `common_strength`,
  1 AS `dosage_form`,
  1 AS `evidence_id`,
  1 AS `product_name`,
  1 AS `registration_number`,
  1 AS `population_key`,
  1 AS `indication_key`,
  1 AS `schedule_type`,
  1 AS `evidence_status`,
  1 AS `source_authority`,
  1 AS `source_url`,
  1 AS `source_revision_date`,
  1 AS `evidence_notes`,
  1 AS `automation_status`,
  1 AS `automation_block_reason` */;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `otp_codes`
--

DROP TABLE IF EXISTS `otp_codes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `otp_codes` (
  `id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `purpose` enum('PASSWORD_RESET','EMAIL_VERIFICATION') NOT NULL,
  `otp_hash` char(64) NOT NULL,
  `expires_at` datetime(3) NOT NULL,
  `attempts` tinyint(3) unsigned NOT NULL DEFAULT 0,
  `used_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_otp_current` (`user_id`,`purpose`,`used_at`,`created_at`),
  CONSTRAINT `fk_otp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `otp_codes`
--

LOCK TABLES `otp_codes` WRITE;
/*!40000 ALTER TABLE `otp_codes` DISABLE KEYS */;
/*!40000 ALTER TABLE `otp_codes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `password_reset_pins`
--

DROP TABLE IF EXISTS `password_reset_pins`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `password_reset_pins` (
  `id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `pin_hash` varchar(255) NOT NULL,
  `expires_at` datetime(3) NOT NULL,
  `attempts` tinyint(3) unsigned NOT NULL DEFAULT 0,
  `used` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_reset_pin_user_current` (`user_id`,`used`,`created_at`),
  CONSTRAINT `fk_password_reset_pin_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `password_reset_pins`
--

LOCK TABLES `password_reset_pins` WRITE;
/*!40000 ALTER TABLE `password_reset_pins` DISABLE KEYS */;
/*!40000 ALTER TABLE `password_reset_pins` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `password_reset_tokens`
--

DROP TABLE IF EXISTS `password_reset_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `password_reset_tokens` (
  `id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime(3) NOT NULL,
  `used_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_password_reset_token_hash` (`token_hash`),
  KEY `idx_password_reset_user_current` (`user_id`,`used_at`,`created_at`),
  CONSTRAINT `fk_password_reset_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `password_reset_tokens`
--

LOCK TABLES `password_reset_tokens` WRITE;
/*!40000 ALTER TABLE `password_reset_tokens` DISABLE KEYS */;
/*!40000 ALTER TABLE `password_reset_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `password_resets`
--

DROP TABLE IF EXISTS `password_resets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `password_resets` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` char(36) NOT NULL,
  `pin_hash` varchar(255) NOT NULL,
  `expires_at` datetime(3) NOT NULL,
  `attempts` tinyint(3) unsigned NOT NULL DEFAULT 0,
  `is_used` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_password_resets_user_current` (`user_id`,`is_used`,`created_at`),
  CONSTRAINT `fk_password_resets_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `password_resets`
--

LOCK TABLES `password_resets` WRITE;
/*!40000 ALTER TABLE `password_resets` DISABLE KEYS */;
/*!40000 ALTER TABLE `password_resets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `patient_anchors`
--

DROP TABLE IF EXISTS `patient_anchors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `patient_anchors` (
  `patient_id` char(36) NOT NULL,
  `wake_anchor` time NOT NULL DEFAULT '08:00:00',
  `sleep_anchor` time NOT NULL DEFAULT '22:00:00',
  `breakfast_anchor` time NOT NULL DEFAULT '07:30:00',
  `lunch_anchor` time NOT NULL DEFAULT '12:00:00',
  `dinner_anchor` time NOT NULL DEFAULT '19:00:00',
  `profile_completed` tinyint(1) NOT NULL DEFAULT 0,
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`patient_id`),
  CONSTRAINT `fk_anchors_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `patient_anchors`
--

LOCK TABLES `patient_anchors` WRITE;
/*!40000 ALTER TABLE `patient_anchors` DISABLE KEYS */;
INSERT INTO `patient_anchors` VALUES ('b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','08:00:00','22:00:00','07:30:00','12:00:00','19:00:00',1,'2026-09-08 21:01:26.689');
/*!40000 ALTER TABLE `patient_anchors` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `patient_notifications`
--

DROP TABLE IF EXISTS `patient_notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `patient_notifications` (
  `id` char(36) NOT NULL,
  `patient_id` char(36) NOT NULL,
  `type` enum('dose_reminder','dose_missed','schedule_confirmed','schedule_changed','prescription_approved','prescription_rejected','prescription_needs_clearer','streak_warning','streak_reset','reward_earned','caregiver_update','appointment_update','counseling_summary_ready') NOT NULL,
  `title` varchar(120) NOT NULL,
  `message` varchar(500) NOT NULL,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
  `event_key` varchar(255) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `read_at` datetime(3) DEFAULT NULL,
  `push_sent_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_patient_notification_event` (`event_key`),
  KEY `idx_notification_patient_created` (`patient_id`,`created_at`,`id`),
  KEY `idx_notification_patient_unread` (`patient_id`,`read_at`,`created_at`),
  KEY `idx_notification_pending_push` (`patient_id`,`type`,`push_sent_at`),
  CONSTRAINT `fk_notification_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `patient_notifications`
--

LOCK TABLES `patient_notifications` WRITE;
/*!40000 ALTER TABLE `patient_notifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `patient_notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `patient_preferences`
--

DROP TABLE IF EXISTS `patient_preferences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `patient_preferences` (
  `patient_id` char(36) NOT NULL,
  `reminders_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `voice_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `voice_detail` enum('private','medicine_name') NOT NULL DEFAULT 'private',
  `vibration_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `reminder_lead_minutes` tinyint(3) unsigned NOT NULL DEFAULT 0,
  `caregiver_missed_alerts_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `lock_screen_detail` enum('private','medicine_name') NOT NULL DEFAULT 'private',
  `timezone` varchar(64) NOT NULL DEFAULT 'Asia/Manila',
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`patient_id`),
  CONSTRAINT `fk_preferences_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_preferences_lead` CHECK (`reminder_lead_minutes` between 0 and 60)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `patient_preferences`
--

LOCK TABLES `patient_preferences` WRITE;
/*!40000 ALTER TABLE `patient_preferences` DISABLE KEYS */;
INSERT INTO `patient_preferences` VALUES ('b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e',1,1,'private',1,0,1,'private','Asia/Manila','2026-09-08 20:58:00.255','2026-09-08 20:58:00.255');
/*!40000 ALTER TABLE `patient_preferences` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `patient_safety_profiles`
--

DROP TABLE IF EXISTS `patient_safety_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `patient_safety_profiles` (
  `patient_id` char(36) NOT NULL,
  `date_of_birth` date DEFAULT NULL,
  `weight_kg` decimal(5,2) DEFAULT NULL,
  `allergies_enc` text DEFAULT NULL,
  `conditions_enc` text DEFAULT NULL,
  `current_medicines_enc` text DEFAULT NULL,
  `kidney_status` enum('YES','NO','UNSURE','UNANSWERED') NOT NULL DEFAULT 'UNANSWERED',
  `liver_status` enum('YES','NO','UNSURE','UNANSWERED') NOT NULL DEFAULT 'UNANSWERED',
  `pregnancy_status` enum('PREGNANT','BREASTFEEDING','NEITHER','NOT_APPLICABLE','UNSURE','UNANSWERED') NOT NULL DEFAULT 'UNANSWERED',
  `caregiver_alerts` tinyint(1) NOT NULL DEFAULT 0,
  `profile_completed` tinyint(1) NOT NULL DEFAULT 0,
  `consented_at` datetime(3) DEFAULT NULL,
  `completed_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`patient_id`),
  CONSTRAINT `fk_safety_profile_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `patient_safety_profiles`
--

LOCK TABLES `patient_safety_profiles` WRITE;
/*!40000 ALTER TABLE `patient_safety_profiles` DISABLE KEYS */;
INSERT INTO `patient_safety_profiles` VALUES ('b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e',NULL,NULL,NULL,NULL,'MLeT+5dibQYzGGPg:CYWpqpJKH/+IScm7HUGXDg==:SA==','UNANSWERED','UNANSWERED','UNSURE',0,1,'2026-09-08 21:01:26.664','2026-09-09 02:36:08.747','2026-09-09 02:36:08.747');
/*!40000 ALTER TABLE `patient_safety_profiles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `patient_streak_days`
--

DROP TABLE IF EXISTS `patient_streak_days`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `patient_streak_days` (
  `patient_id` char(36) NOT NULL,
  `dose_date` date NOT NULL,
  `result` enum('complete','broken') NOT NULL,
  `scheduled_count` int(10) unsigned NOT NULL,
  `taken_count` int(10) unsigned NOT NULL,
  `streak_after` int(10) unsigned NOT NULL,
  `tokens_awarded` int(10) unsigned NOT NULL DEFAULT 0,
  `processed_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`patient_id`,`dose_date`),
  KEY `idx_streak_day_result` (`dose_date`,`result`),
  CONSTRAINT `fk_streak_day_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `patient_streak_days`
--

LOCK TABLES `patient_streak_days` WRITE;
/*!40000 ALTER TABLE `patient_streak_days` DISABLE KEYS */;
/*!40000 ALTER TABLE `patient_streak_days` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `patient_streaks`
--

DROP TABLE IF EXISTS `patient_streaks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `patient_streaks` (
  `patient_id` char(36) NOT NULL,
  `current_days` int(10) unsigned NOT NULL DEFAULT 0,
  `priority_tokens` int(10) unsigned NOT NULL DEFAULT 0,
  `last_completed_date` date DEFAULT NULL,
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`patient_id`),
  CONSTRAINT `fk_streak_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `patient_streaks`
--

LOCK TABLES `patient_streaks` WRITE;
/*!40000 ALTER TABLE `patient_streaks` DISABLE KEYS */;
INSERT INTO `patient_streaks` VALUES ('b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e',0,0,NULL,'2026-09-08 21:00:57.498');
/*!40000 ALTER TABLE `patient_streaks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `patients`
--

DROP TABLE IF EXISTS `patients`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `patients` (
  `id` char(36) NOT NULL,
  `patient_code` varchar(9) NOT NULL,
  `full_name_enc` text DEFAULT NULL,
  `contact_num_enc` text DEFAULT NULL,
  `address_enc` text DEFAULT NULL,
  `medical_condition_enc` text DEFAULT NULL,
  `priority_flag` tinyint(1) NOT NULL DEFAULT 0,
  `fcm_token` text DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `inquiry_consent_policy_version` varchar(40) DEFAULT NULL,
  `inquiry_consent_accepted_at` datetime(3) DEFAULT NULL,
  `inquiry_consent_revoked_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_patient_code` (`patient_code`),
  CONSTRAINT `fk_patients_user` FOREIGN KEY (`id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `patients`
--

LOCK TABLES `patients` WRITE;
/*!40000 ALTER TABLE `patients` DISABLE KEYS */;
INSERT INTO `patients` VALUES ('b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','PM-DEV001','ZcFzFNpex+40rhwV:oUZ7/vieWmPBvQPoNRmmSQ==:wcD02aVrUldszkzGIwQ=',NULL,NULL,'OPk0pGiKn135Ctab:x2vsJtC2AoaiySWt7C6xzQ==:QSYQewqbmsIUte4E',1,NULL,'2026-09-08 20:58:00.247','2026-09-06','2026-09-09 02:36:13.527',NULL);
/*!40000 ALTER TABLE `patients` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pending_drug_requests`
--

DROP TABLE IF EXISTS `pending_drug_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pending_drug_requests` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `patient_id` char(36) NOT NULL,
  `medication_id` char(36) DEFAULT NULL,
  `drug_name_raw` varchar(255) NOT NULL,
  `frequency_raw` varchar(255) DEFAULT NULL,
  `status` enum('pending','curated','rejected') NOT NULL DEFAULT 'pending',
  `resolved_at` datetime(3) DEFAULT NULL,
  `requested_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `fk_pdr_patient` (`patient_id`),
  KEY `fk_pdr_medication` (`medication_id`),
  CONSTRAINT `fk_pdr_medication` FOREIGN KEY (`medication_id`) REFERENCES `medications` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pdr_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pending_drug_requests`
--

LOCK TABLES `pending_drug_requests` WRITE;
/*!40000 ALTER TABLE `pending_drug_requests` DISABLE KEYS */;
/*!40000 ALTER TABLE `pending_drug_requests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ph_fda_drug_products`
--

DROP TABLE IF EXISTS `ph_fda_drug_products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ph_fda_drug_products` (
  `registration_number` varchar(100) NOT NULL,
  `generic_name` varchar(500) NOT NULL,
  `brand_name` varchar(255) DEFAULT NULL,
  `dosage_strength` varchar(255) DEFAULT NULL,
  `dosage_form` varchar(255) DEFAULT NULL,
  `pharmacologic_category` varchar(255) DEFAULT NULL,
  `application_type` varchar(255) DEFAULT NULL,
  `issuance_date` date DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `regulatory_class` enum('OTC','PENDING_PHARMACIST') NOT NULL,
  `source_url` varchar(500) NOT NULL DEFAULT 'https://verification.fda.gov.ph/',
  `imported_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`registration_number`),
  KEY `idx_ph_fda_generic` (`generic_name`(191)),
  KEY `idx_ph_fda_class` (`regulatory_class`,`expiry_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ph_fda_drug_products`
--

LOCK TABLES `ph_fda_drug_products` WRITE;
/*!40000 ALTER TABLE `ph_fda_drug_products` DISABLE KEYS */;
/*!40000 ALTER TABLE `ph_fda_drug_products` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pharmacists`
--

DROP TABLE IF EXISTS `pharmacists`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pharmacists` (
  `id` char(36) NOT NULL,
  `full_name` varchar(255) NOT NULL,
  `license_number` varchar(100) DEFAULT NULL,
  `license_jurisdiction` varchar(100) DEFAULT NULL,
  `license_status` enum('PENDING','VERIFIED','SUSPENDED','EXPIRED') NOT NULL DEFAULT 'PENDING',
  `license_expires_on` date DEFAULT NULL,
  `license_evidence_url` varchar(1000) DEFAULT NULL,
  `license_verified_at` datetime(3) DEFAULT NULL,
  `license_verified_by` char(36) DEFAULT NULL,
  `branch_id` char(36) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `fk_pharmacists_branch` (`branch_id`),
  KEY `fk_pharmacist_license_verified_by` (`license_verified_by`),
  CONSTRAINT `fk_pharmacist_license_verified_by` FOREIGN KEY (`license_verified_by`) REFERENCES `admins` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pharmacists_branch` FOREIGN KEY (`branch_id`) REFERENCES `pharmacy_branches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pharmacists_user` FOREIGN KEY (`id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pharmacists`
--

LOCK TABLES `pharmacists` WRITE;
/*!40000 ALTER TABLE `pharmacists` DISABLE KEYS */;
INSERT INTO `pharmacists` VALUES ('710f0ea6-2149-4138-aa4d-0d89bcc220e2','Dev Pharmacist','PH-DEV-001',NULL,'PENDING',NULL,NULL,NULL,NULL,'9c42f176-aae6-4d33-ab33-22feaa7627cb','2026-09-08 20:58:00.262');
/*!40000 ALTER TABLE `pharmacists` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pharmacy_branches`
--

DROP TABLE IF EXISTS `pharmacy_branches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pharmacy_branches` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `name` varchar(255) NOT NULL,
  `address` text NOT NULL,
  `hours_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`hours_json`)),
  `services_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`services_json`)),
  `delivery_coverage` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pharmacy_branches`
--

LOCK TABLES `pharmacy_branches` WRITE;
/*!40000 ALTER TABLE `pharmacy_branches` DISABLE KEYS */;
INSERT INTO `pharmacy_branches` VALUES ('9c42f176-aae6-4d33-ab33-22feaa7627cb','PharMate Dev Branch','123 Dev St, Manila',NULL,NULL,'Metro Manila',1,'2026-09-08 20:58:00.234');
/*!40000 ALTER TABLE `pharmacy_branches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `portal_notifications`
--

DROP TABLE IF EXISTS `portal_notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `portal_notifications` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `user_id` char(36) NOT NULL,
  `type` varchar(50) NOT NULL,
  `title` varchar(150) NOT NULL,
  `body` text NOT NULL,
  `action_path` varchar(255) DEFAULT NULL,
  `event_key` varchar(191) DEFAULT NULL,
  `read_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_portal_notification_event` (`user_id`,`event_key`),
  KEY `idx_portal_notification_unread` (`user_id`,`read_at`,`created_at`),
  CONSTRAINT `fk_portal_notification_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `portal_notifications`
--

LOCK TABLES `portal_notifications` WRITE;
/*!40000 ALTER TABLE `portal_notifications` DISABLE KEYS */;
INSERT INTO `portal_notifications` VALUES ('23fceb17-abc1-4781-93f5-3e2ce7d69a5e','3c0c7623-bb5b-453c-8657-b85bd0443a55','CAREGIVER_LINK_UPDATED','Caregiver access approved','The patient approved your caregiver connection.','/caregiver/home','caregiver-link-decision:96a84e8d-9314-404f-847b-3b24d5addaa2:active',NULL,'2026-09-09 00:50:48.509'),('eeee63c4-e30e-485d-9b1f-115c137b5bad','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','CAREGIVER_LINK_UPDATED','Caregiver link request','A caregiver used your invitation code. Review and approve or reject the request.','/patient/profile','caregiver-link-request:96a84e8d-9314-404f-847b-3b24d5addaa2',NULL,'2026-09-09 00:50:39.727');
/*!40000 ALTER TABLE `portal_notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `prescription_photos`
--

DROP TABLE IF EXISTS `prescription_photos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `prescription_photos` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `medication_id` char(36) NOT NULL,
  `redacted_path` varchar(500) DEFAULT NULL,
  `ocr_text` longtext DEFAULT NULL,
  `ocr_confidence` decimal(5,2) DEFAULT NULL,
  `schedule_draft_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`schedule_draft_json`)),
  `review_stage` enum('prescription','schedule','complete') NOT NULL DEFAULT 'prescription',
  `status` enum('pending','approved','rejected','needs_clearer') NOT NULL DEFAULT 'pending',
  `decision_reason` text DEFAULT NULL,
  `pharmacist_id` char(36) DEFAULT NULL,
  `reviewer_license_number` varchar(100) DEFAULT NULL,
  `reviewer_license_jurisdiction` varchar(100) DEFAULT NULL,
  `claimed_by` char(36) DEFAULT NULL,
  `claim_expires_at` datetime(3) DEFAULT NULL,
  `decision_at` datetime(3) DEFAULT NULL,
  `purge_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `fk_photo_medication` (`medication_id`),
  KEY `fk_photo_pharmacist` (`pharmacist_id`),
  KEY `idx_photo_pending_claim` (`status`,`claim_expires_at`),
  KEY `fk_photo_claimed_by` (`claimed_by`),
  KEY `idx_photo_review_stage` (`status`,`review_stage`),
  CONSTRAINT `fk_photo_claimed_by` FOREIGN KEY (`claimed_by`) REFERENCES `pharmacists` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_photo_medication` FOREIGN KEY (`medication_id`) REFERENCES `medications` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_photo_pharmacist` FOREIGN KEY (`pharmacist_id`) REFERENCES `pharmacists` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `prescription_photos`
--

LOCK TABLES `prescription_photos` WRITE;
/*!40000 ALTER TABLE `prescription_photos` DISABLE KEYS */;
/*!40000 ALTER TABLE `prescription_photos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `prescription_validation_audit`
--

DROP TABLE IF EXISTS `prescription_validation_audit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `prescription_validation_audit` (
  `id` char(36) NOT NULL,
  `prescription_id` char(36) NOT NULL,
  `medication_id` char(36) NOT NULL,
  `pharmacist_id` char(36) NOT NULL,
  `event_type` enum('claimed','released','claim_expired','reclaimed','prescription_approved','schedule_approved','approved','rejected','needs_clearer') NOT NULL,
  `reason` varchar(500) DEFAULT NULL,
  `event_time` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_validation_audit_photo` (`prescription_id`,`event_time`,`id`),
  KEY `fk_validation_audit_medication` (`medication_id`),
  KEY `fk_validation_audit_pharmacist` (`pharmacist_id`),
  CONSTRAINT `fk_validation_audit_medication` FOREIGN KEY (`medication_id`) REFERENCES `medications` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_validation_audit_pharmacist` FOREIGN KEY (`pharmacist_id`) REFERENCES `pharmacists` (`id`),
  CONSTRAINT `fk_validation_audit_photo` FOREIGN KEY (`prescription_id`) REFERENCES `prescription_photos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `prescription_validation_audit`
--

LOCK TABLES `prescription_validation_audit` WRITE;
/*!40000 ALTER TABLE `prescription_validation_audit` DISABLE KEYS */;
/*!40000 ALTER TABLE `prescription_validation_audit` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `refill_requests`
--

DROP TABLE IF EXISTS `refill_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `refill_requests` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `patient_id` char(36) NOT NULL,
  `placed_by_user_id` char(36) DEFAULT NULL,
  `caregiver_id` char(36) DEFAULT NULL,
  `medication_id` char(36) DEFAULT NULL,
  `drug_id` char(36) DEFAULT NULL,
  `quantity` int(10) unsigned NOT NULL DEFAULT 1,
  `branch_id` char(36) NOT NULL,
  `status` enum('pending','processing','ready','cancelled') NOT NULL DEFAULT 'pending',
  `notes` text DEFAULT NULL,
  `payment_method` enum('CASH_ON_PICKUP','COD','CARD','GCASH') NOT NULL DEFAULT 'CASH_ON_PICKUP',
  `payment_status` enum('PENDING','AUTHORIZED','PAID','FAILED','REFUNDED') NOT NULL DEFAULT 'PENDING',
  `requested_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `fk_refill_patient` (`patient_id`),
  KEY `fk_refill_medication` (`medication_id`),
  KEY `fk_refill_branch` (`branch_id`),
  KEY `fk_refill_drug` (`drug_id`),
  KEY `fk_refill_placed_by` (`placed_by_user_id`),
  KEY `fk_refill_caregiver` (`caregiver_id`),
  CONSTRAINT `fk_refill_branch` FOREIGN KEY (`branch_id`) REFERENCES `pharmacy_branches` (`id`),
  CONSTRAINT `fk_refill_caregiver` FOREIGN KEY (`caregiver_id`) REFERENCES `caregivers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_refill_drug` FOREIGN KEY (`drug_id`) REFERENCES `drug_reference` (`id`),
  CONSTRAINT `fk_refill_medication` FOREIGN KEY (`medication_id`) REFERENCES `medications` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_refill_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_refill_placed_by` FOREIGN KEY (`placed_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `refill_requests`
--

LOCK TABLES `refill_requests` WRITE;
/*!40000 ALTER TABLE `refill_requests` DISABLE KEYS */;
/*!40000 ALTER TABLE `refill_requests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `refresh_tokens`
--

DROP TABLE IF EXISTS `refresh_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `refresh_tokens` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `user_id` char(36) NOT NULL,
  `token_hash` varchar(255) NOT NULL,
  `expires_at` datetime(3) NOT NULL,
  `revoked` tinyint(1) NOT NULL DEFAULT 0,
  `revoked_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_refresh_user` (`user_id`),
  KEY `idx_refresh_hash` (`token_hash`(64)),
  CONSTRAINT `fk_refresh_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `refresh_tokens`
--

LOCK TABLES `refresh_tokens` WRITE;
/*!40000 ALTER TABLE `refresh_tokens` DISABLE KEYS */;
INSERT INTO `refresh_tokens` VALUES ('0de5fa37-1cee-4080-b4bc-262db8215fa8','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','8a4dfa09eed59dacdb0df011a3d13fc20c5c63cf78a80744abb4141969033012','2026-10-09 02:43:35.052',0,NULL,'2026-09-09 02:43:35.053'),('1439f7a6-96a6-4455-a108-28483e987f5d','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','ff4fcf6efda9609325b9d0820a056f08b7a0eac2853dcee00680dc82e67dd6b4','2026-10-09 01:35:19.037',0,NULL,'2026-09-09 01:35:19.039'),('16416556-512a-456b-903e-e7e9d1818e21','3c0c7623-bb5b-453c-8657-b85bd0443a55','a19b0f0a004db8d4deadac839efca5bdd07cfcf92281e02e15ccefc8be46cc43','2026-10-09 01:30:26.272',0,NULL,'2026-09-09 01:30:26.273'),('2659052e-fb32-474b-9786-5550babfeb0d','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','d188ed62287fed9dc84cd4bad20634fb58fe880b0a021c8fd6a56aec568cb3b8','2026-10-09 00:47:29.226',1,'2026-09-09 00:47:32.987','2026-09-09 00:47:29.227'),('2759c131-7d7a-4460-a826-a97c8ff74545','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','c031fbd12000c2192e7d15afde82219bbb0b1a80d5318185d76af181c487d922','2026-10-09 01:04:43.062',1,'2026-09-09 01:19:43.158','2026-09-09 01:04:43.064'),('3e6ac816-20b2-4aac-91bc-9bde2a5975c5','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','58e4668693514bd9f6822b674e0879014675f25784ec863b08ce892a9d87c325','2026-10-09 02:27:08.463',1,'2026-09-09 02:43:35.038','2026-09-09 02:27:08.465'),('48cd5624-361b-4155-afb9-b8a623a0d55a','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','693785a55824c5df0ed31e5ed44571ab59951b0c09afb055db23e98ef8e96bbf','2026-10-09 01:19:43.163',1,'2026-09-09 01:35:19.021','2026-09-09 01:19:43.165'),('5fa57152-d95b-4bac-88bd-86b2da6d2d90','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','004f3c82a22a9c47c57d02b444b9424450a5e20585b8126674ad01d1cdfe903c','2026-10-09 00:32:23.916',1,'2026-09-09 00:47:29.204','2026-09-09 00:32:23.929'),('6fe6251a-096e-4155-9c10-d4f6668bfe76','3c0c7623-bb5b-453c-8657-b85bd0443a55','42d5e41d0090c9f92200f67de0a9e4a36fcf9d34caf02f0b8333bd1de22cba51','2026-10-09 01:59:11.516',1,'2026-09-09 02:17:30.126','2026-09-09 01:59:11.517'),('723e9d59-48f1-4852-b437-4799df96867b','3c0c7623-bb5b-453c-8657-b85bd0443a55','6061423901ad06b60bc8308fa185edec076c1b9a3fc18fbf62f8b0a33de2da7e','2026-10-09 02:17:30.130',0,NULL,'2026-09-09 02:17:30.131'),('818ddc67-f425-4a01-9cf0-015f7d4ee1da','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','3c3d2b97bb2f9508c96b486362b9360009154a6a5d9c301020d4bf036d258dcc','2026-10-09 00:49:35.965',1,'2026-09-09 01:04:43.056','2026-09-09 00:49:35.966'),('94067860-cf0a-4fbb-ad5c-8d6e6d69755c','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','081d3d370eaa0f68eacf782fd4d14107369c3bbb13a773a3abac6a24b1dad5ad','2026-10-09 02:13:43.503',0,NULL,'2026-09-09 02:13:43.505'),('9b252515-26d8-45df-8c99-e1bd721d71df','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','8426faf48da2d479ac4a0b62af9f17b05ac5d86665347036cf3b3d0d0f077de0','2026-10-08 20:59:14.156',0,NULL,'2026-09-08 20:59:14.164'),('a511b2e4-b379-4ed2-a88c-3150b91a7652','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','4ad263caef89a325aa95b31a993e2783bd893727e1229d4fa541c5681ac589d1','2026-10-08 21:00:57.116',1,'2026-09-08 21:02:48.564','2026-09-08 21:00:57.118'),('be2dfb7d-6b8b-458c-9afe-b8aaeb37ee46','3c0c7623-bb5b-453c-8657-b85bd0443a55','19110f09e88b9aa6f421772469b763e9d46e5d4b653827ab215cb9ba2b0a0146','2026-10-09 01:08:17.368',1,'2026-09-09 01:30:26.255','2026-09-09 01:08:17.369'),('e194154c-f4db-4c97-92ef-c71f18433590','3c0c7623-bb5b-453c-8657-b85bd0443a55','4522275309c5df53d916645cf76389b330de4bf0228c3e19e6c7ddf24c692472','2026-10-09 00:47:47.697',1,'2026-09-09 01:08:17.361','2026-09-09 00:47:47.698'),('ede565c5-76cd-4dba-8ffe-944741e53776','b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','96a01d6a988b712cee3586d9f705949ad06025f1873b0fe3433f52def0bb81e1','2026-10-09 01:58:43.142',1,'2026-09-09 02:13:43.475','2026-09-09 01:58:43.146');
/*!40000 ALTER TABLE `refresh_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `restricted_substances`
--

DROP TABLE IF EXISTS `restricted_substances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `restricted_substances` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `generic_name` varchar(255) NOT NULL,
  `category` varchar(100) DEFAULT NULL,
  `reason` text DEFAULT NULL,
  `is_provisional` tinyint(1) NOT NULL DEFAULT 1,
  `verified_by` char(36) DEFAULT NULL,
  `verified_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_restricted_generic` (`generic_name`),
  KEY `fk_restricted_verified_by` (`verified_by`),
  CONSTRAINT `fk_restricted_verified_by` FOREIGN KEY (`verified_by`) REFERENCES `pharmacists` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `restricted_substances`
--

LOCK TABLES `restricted_substances` WRITE;
/*!40000 ALTER TABLE `restricted_substances` DISABLE KEYS */;
/*!40000 ALTER TABLE `restricted_substances` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `rule_governance_revisions`
--

DROP TABLE IF EXISTS `rule_governance_revisions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `rule_governance_revisions` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `drug_id` char(36) NOT NULL,
  `rule_version` int(10) unsigned NOT NULL,
  `action` enum('DRAFT_SAVED','SUBMITTED','RETURNED','RETIRED') NOT NULL,
  `before_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`before_data`)),
  `after_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`after_data`)),
  `validation_result` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`validation_result`)),
  `reason` varchar(500) DEFAULT NULL,
  `actor_user_id` char(36) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_rule_governance_revision` (`drug_id`,`rule_version`,`created_at`),
  KEY `fk_rule_governance_actor` (`actor_user_id`),
  CONSTRAINT `fk_rule_governance_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_rule_governance_drug` FOREIGN KEY (`drug_id`) REFERENCES `drug_reference` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rule_governance_revisions`
--

LOCK TABLES `rule_governance_revisions` WRITE;
/*!40000 ALTER TABLE `rule_governance_revisions` DISABLE KEYS */;
/*!40000 ALTER TABLE `rule_governance_revisions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `schema_migrations`
--

DROP TABLE IF EXISTS `schema_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `schema_migrations` (
  `filename` varchar(255) NOT NULL,
  `applied_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`filename`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `schema_migrations`
--

LOCK TABLES `schema_migrations` WRITE;
/*!40000 ALTER TABLE `schema_migrations` DISABLE KEYS */;
INSERT INTO `schema_migrations` VALUES ('001_initial_schema.sql','2026-09-08 20:57:52.339'),('002_sprint3_curation.sql','2026-09-08 20:57:52.642'),('003_sprint7_alerts.sql','2026-09-08 20:57:52.691'),('004_sprint8_inquiry.sql','2026-09-08 20:57:52.750'),('005_priority_flag.sql','2026-09-08 20:57:52.815'),('006_rx_class.sql','2026-09-08 20:57:52.836'),('007_backfill_med_drug_id.sql','2026-09-08 20:57:52.847'),('008_reminders.sql','2026-09-08 20:57:52.886'),('009_correct_paracetamol_otc.sql','2026-09-08 20:57:52.891'),('009_secure_caregiver_links.sql','2026-09-08 20:57:53.112'),('010_patient_preferences.sql','2026-09-08 20:57:53.131'),('011_user_session_version.sql','2026-09-08 20:57:53.146'),('012_password_reset_tokens.sql','2026-09-08 20:57:53.185'),('013_patient_notifications.sql','2026-09-08 20:57:53.237'),('014_patient_medication_history.sql','2026-09-08 20:57:53.311'),('015_prescription_validation_claims.sql','2026-09-08 20:57:53.458'),('016_prescription_schedule_review.sql','2026-09-08 20:57:53.624'),('017_ph_fda_registry.sql','2026-09-08 20:57:53.667'),('018_inquiry_pharmacist_validation.sql','2026-09-08 20:57:53.752'),('019_caregiver_profiles.sql','2026-09-08 20:57:53.773'),('020_medicine_catalog_metadata.sql','2026-09-08 20:57:53.807'),('021_unified_portal_pairing.sql','2026-09-08 20:57:53.897'),('022_admin_medicine_inventory.sql','2026-09-08 20:57:53.914'),('023_caregiver_medication_permissions.sql','2026-09-08 20:57:53.927'),('024_auth_security.sql','2026-09-08 20:57:54.039'),('025_password_resets.sql','2026-09-08 20:57:54.079'),('026_streak_lifecycle.sql','2026-09-08 20:57:54.183'),('027_schedule_guidance.sql','2026-09-08 20:57:54.208'),('028_automated_clinical_scheduler.sql','2026-09-08 20:57:54.243'),('029_portal_integration.sql','2026-09-08 20:57:54.363'),('030_caregiver_approval.sql','2026-09-08 20:57:54.529'),('031_standardized_medication_intake.sql','2026-09-08 20:57:54.558'),('032_clinical_rule_verification.sql','2026-09-08 20:57:54.751'),('033_remove_unsubstantiated_verified_rules.sql','2026-09-08 20:57:54.757'),('034_complete_clinical_rule_records.sql','2026-09-08 20:57:54.932'),('035_dose_log_corrections.sql','2026-09-08 20:57:54.980'),('036_schedule_source.sql','2026-09-08 20:57:55.001'),('037_medication_wizard_metadata.sql','2026-09-08 20:57:55.020'),('038_suggested_schedule_provenance.sql','2026-09-08 20:57:55.051'),('039_reference_schedule_review.sql','2026-09-08 20:57:55.123'),('040_patient_scheduling_profile.sql','2026-09-08 20:57:55.142'),('041_curated_otc_reference_rules.sql','2026-09-08 20:57:55.164'),('042_full_rule_database_coverage.sql','2026-09-08 20:57:55.219'),('043_otc_label_evidence_registry.sql','2026-09-08 20:57:55.275'),('044_patient_safety_profile.sql','2026-09-08 20:57:55.299'),('045_rule_safety_and_governance.sql','2026-09-08 20:57:55.595'),('046_licensed_clinical_review.sql','2026-09-08 20:57:55.726'),('047_ocr_counseling_appointments.sql','2026-09-08 20:57:55.907'),('048_inquiry_privacy_consent.sql','2026-09-08 20:57:55.995'),('049_rule_frequency_capacity.sql','2026-09-08 20:57:56.014'),('050_shared_medication_schedule.sql','2026-09-08 20:57:56.155'),('051_inquiry_medication_draft_context.sql','2026-09-08 20:57:56.211'),('052_order_tracking_and_payment.sql','2026-09-08 20:57:56.285'),('053_staff_mfa.sql','2026-09-08 20:57:56.314'),('054_email_otp.sql','2026-09-08 20:57:56.440'),('055_catalog_orders.sql','2026-09-08 20:57:56.778');
/*!40000 ALTER TABLE `schema_migrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sus_responses`
--

DROP TABLE IF EXISTS `sus_responses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sus_responses` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `user_id` char(36) NOT NULL,
  `role` enum('patient','pharmacist','caregiver','admin') NOT NULL,
  `responses_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`responses_json`)),
  `submitted_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sus_responses`
--

LOCK TABLES `sus_responses` WRITE;
/*!40000 ALTER TABLE `sus_responses` DISABLE KEYS */;
/*!40000 ALTER TABLE `sus_responses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tam_responses`
--

DROP TABLE IF EXISTS `tam_responses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tam_responses` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `user_id` char(36) NOT NULL,
  `role` enum('patient','pharmacist','caregiver','admin') NOT NULL,
  `responses_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`responses_json`)),
  `submitted_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tam_responses`
--

LOCK TABLES `tam_responses` WRITE;
/*!40000 ALTER TABLE `tam_responses` DISABLE KEYS */;
/*!40000 ALTER TABLE `tam_responses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` char(36) NOT NULL DEFAULT uuid(),
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `google_id` varchar(255) DEFAULT NULL,
  `role` enum('patient','pharmacist','caregiver','admin') NOT NULL,
  `is_verified` tinyint(1) NOT NULL DEFAULT 0,
  `email_verified_at` datetime(3) DEFAULT NULL,
  `failed_login_attempts` int(10) unsigned NOT NULL DEFAULT 0,
  `account_locked_until` datetime(3) DEFAULT NULL,
  `mfa_secret_enc` text DEFAULT NULL,
  `mfa_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `mfa_last_counter` bigint(20) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `session_version` int(10) unsigned NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  UNIQUE KEY `uq_users_google_id` (`google_id`),
  KEY `idx_users_lockout` (`account_locked_until`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES ('3c0c7623-bb5b-453c-8657-b85bd0443a55','caregiver@dev.pharmate','$2a$12$MMBoyPvSYvuqwRCJUU2Hjei3UM06h4/q3r4pgEd4YlWqK8/aZKkV.',NULL,'caregiver',1,'2026-09-08 20:58:50.758',0,NULL,NULL,0,NULL,1,0,'2026-09-08 20:58:00.215','2026-09-08 20:58:50.758'),('710f0ea6-2149-4138-aa4d-0d89bcc220e2','pharmacist@dev.pharmate','$2a$12$MMBoyPvSYvuqwRCJUU2Hjei3UM06h4/q3r4pgEd4YlWqK8/aZKkV.',NULL,'pharmacist',1,'2026-09-08 20:58:50.758',0,NULL,NULL,0,NULL,1,0,'2026-09-08 20:58:00.211','2026-09-08 20:58:50.758'),('b05b36c8-62f0-4e6a-9a21-43ce2cd2ca3e','patient@dev.pharmate','$2a$12$MMBoyPvSYvuqwRCJUU2Hjei3UM06h4/q3r4pgEd4YlWqK8/aZKkV.',NULL,'patient',1,'2026-09-08 20:58:50.758',0,NULL,NULL,0,NULL,1,0,'2026-09-08 20:58:00.203','2026-09-08 20:58:50.758'),('f93413f8-619a-4216-ab83-f7ad85b88227','admin@dev.pharmate','$2a$12$MMBoyPvSYvuqwRCJUU2Hjei3UM06h4/q3r4pgEd4YlWqK8/aZKkV.',NULL,'admin',1,'2026-09-08 20:58:50.758',0,NULL,NULL,0,NULL,1,0,'2026-09-08 20:58:00.220','2026-09-08 20:58:50.758');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'pharmate_local_dev'
--

--
-- Final view structure for view `medication_automation_coverage`
--

/*!50001 DROP VIEW IF EXISTS `medication_automation_coverage`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_general_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `medication_automation_coverage` AS select `drug`.`id` AS `drug_id`,`drug`.`generic_name` AS `generic_name`,`drug`.`common_strength` AS `common_strength`,`drug`.`dosage_form` AS `dosage_form`,`drug`.`rx_class` AS `rx_class`,`drug`.`clinical_rule_status` AS `clinical_rule_status`,`drug`.`rule_version` AS `rule_version`,`variant`.`rule_kind` AS `rule_kind`,`variant`.`automation_status` AS `base_automation_status`,`safety`.`safety_status` AS `safety_status`,`safety`.`rule_version` AS `safety_rule_version`,case when `drug`.`rx_class` = 'RX' then 'PATIENT_SPECIFIC_DIRECTIONS' when `drug`.`is_restricted` = 1 or ucase(coalesce(`drug`.`administration_route`,'')) = 'INJECTION' then 'MANUAL_ONLY' when `variant`.`automation_status` = 'MANUAL_ONLY' then 'MANUAL_ONLY' when `safety`.`id` is null or `safety`.`safety_status` <> 'VERIFIED' then 'NEEDS_SAFETY_REVIEW' when `variant`.`automation_status` = 'READY_VERIFIED' then 'READY_VERIFIED' when `variant`.`automation_status` = 'READY_REFERENCE' then 'READY_REFERENCE' else 'NEEDS_EVIDENCE' end AS `effective_automation_status`,case when `drug`.`rx_class` = 'RX' then 'An approved patient prescription is required.' when `drug`.`is_restricted` = 1 or ucase(coalesce(`drug`.`administration_route`,'')) = 'INJECTION' then 'Restricted medicines and injections require clinician-provided directions.' when `variant`.`automation_status` = 'MANUAL_ONLY' then `variant`.`automation_block_reason` when `safety`.`id` is null or `safety`.`safety_status` <> 'VERIFIED' then 'Every patient-safety domain must be reviewed by a pharmacist.' else `variant`.`automation_block_reason` end AS `effective_block_reason` from ((`drug_reference` `drug` left join `medication_rule_variants` `variant` on(`variant`.`drug_id` = `drug`.`id`)) left join `medication_safety_rules` `safety` on(`safety`.`drug_id` = `drug`.`id` and `safety`.`population_key` = 'ADULT')) where `drug`.`availability` = 1 */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `medication_catalog`
--

/*!50001 DROP VIEW IF EXISTS `medication_catalog`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_general_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `medication_catalog` AS select `drug_reference`.`id` AS `id`,`drug_reference`.`generic_name` AS `generic_name`,json_unquote(json_extract(`drug_reference`.`brand_names_json`,'$[0]')) AS `brand_name`,`drug_reference`.`dosage_form` AS `dosage_form`,`drug_reference`.`common_strength` AS `default_strength`,`drug_reference`.`frequency_default` AS `standard_frequency`,`drug_reference`.`food_rule` AS `food_rule`,coalesce(`drug_reference`.`min_interval_hours`,`drug_reference`.`default_interval_hours`,0) AS `min_interval_hours`,`drug_reference`.`clinical_rationale` AS `clinical_rationale`,`drug_reference`.`clinical_rule_status` AS `clinical_rule_status`,`drug_reference`.`availability` AS `availability` from `drug_reference` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `medication_rule_coverage`
--

/*!50001 DROP VIEW IF EXISTS `medication_rule_coverage`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_general_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `medication_rule_coverage` AS select `drug`.`id` AS `drug_id`,`drug`.`generic_name` AS `generic_name`,`drug`.`common_strength` AS `common_strength`,`drug`.`dosage_form` AS `dosage_form`,`drug`.`rx_class` AS `rx_class`,coalesce(`variant`.`rule_kind`,case when `drug`.`is_prn_default` = 1 then 'PRN' when `drug`.`rx_class` = 'RX' then 'PATIENT_SPECIFIC' else 'UNKNOWN' end) AS `rule_kind`,coalesce(`variant`.`automation_status`,case when `drug`.`is_restricted` = 1 or ucase(coalesce(`drug`.`administration_route`,'')) = 'INJECTION' then 'MANUAL_ONLY' when `drug`.`rx_class` = 'RX' then 'NEEDS_DIRECTIONS' else 'NEEDS_EVIDENCE' end) AS `automation_status`,coalesce(`variant`.`automation_block_reason`,'A structured rule record must be completed in Rule Governance.') AS `automation_block_reason`,coalesce(`variant`.`schedule_rule_status`,'UNVERIFIED') AS `schedule_rule_status`,`variant`.`source_name` AS `source_name`,`variant`.`source_url` AS `source_url`,`variant`.`rule_version` AS `rule_version`,`variant`.`assessed_at` AS `assessed_at` from (`drug_reference` `drug` left join `medication_rule_variants` `variant` on(`variant`.`drug_id` = `drug`.`id`)) where `drug`.`availability` = 1 */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `otc_rule_evidence_queue`
--

/*!50001 DROP VIEW IF EXISTS `otc_rule_evidence_queue`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_general_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `otc_rule_evidence_queue` AS select `drug`.`id` AS `drug_id`,`drug`.`generic_name` AS `generic_name`,`drug`.`common_strength` AS `common_strength`,`drug`.`dosage_form` AS `dosage_form`,`evidence`.`id` AS `evidence_id`,`evidence`.`product_name` AS `product_name`,`evidence`.`registration_number` AS `registration_number`,`evidence`.`population_key` AS `population_key`,`evidence`.`indication_key` AS `indication_key`,`evidence`.`schedule_type` AS `schedule_type`,`evidence`.`evidence_status` AS `evidence_status`,`evidence`.`source_authority` AS `source_authority`,`evidence`.`source_url` AS `source_url`,`evidence`.`source_revision_date` AS `source_revision_date`,`evidence`.`evidence_notes` AS `evidence_notes`,`coverage`.`automation_status` AS `automation_status`,`coverage`.`automation_block_reason` AS `automation_block_reason` from ((`drug_reference` `drug` join `medication_rule_coverage` `coverage` on(`coverage`.`drug_id` = `drug`.`id`)) join `otc_label_evidence` `evidence` on(`evidence`.`drug_id` = `drug`.`id`)) where `drug`.`availability` = 1 and `drug`.`rx_class` = 'OTC' */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-09  2:52:45
