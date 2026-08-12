CREATE TABLE admin_users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(180) NOT NULL,
  password_hash VARCHAR(180) NOT NULL,
  password_salt VARCHAR(80) NOT NULL,
  role ENUM('owner', 'finance', 'support', 'viewer') NOT NULL DEFAULT 'viewer',
  mfa_secret TEXT NULL,
  mfa_enabled TINYINT(1) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY admin_users_email_unique (email),
  KEY admin_users_active_role_idx (active, role)
);

CREATE TABLE admin_audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_user_id BIGINT UNSIGNED NULL,
  request_id CHAR(36) NOT NULL,
  action VARCHAR(20) NOT NULL,
  resource VARCHAR(255) NOT NULL,
  status_code SMALLINT UNSIGNED NOT NULL,
  ip_hash CHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY admin_audit_admin_created_idx (admin_user_id, created_at),
  KEY admin_audit_request_idx (request_id),
  CONSTRAINT admin_audit_admin_fk FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE SET NULL
);
