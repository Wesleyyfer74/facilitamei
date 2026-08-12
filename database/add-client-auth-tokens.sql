CREATE TABLE IF NOT EXISTS client_auth_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  purpose ENUM('setup', 'recovery') NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY client_auth_tokens_hash_unique (token_hash),
  KEY client_auth_tokens_user_purpose_idx (user_id, purpose),
  KEY client_auth_tokens_expires_idx (expires_at),
  CONSTRAINT client_auth_tokens_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
