-- A second database for the test suite. Tests run against MariaDB and not
-- against SQLite, because the collision check builds on row locks
-- (SELECT ... FOR UPDATE), which SQLite does not have.
CREATE DATABASE IF NOT EXISTS reservation_test
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON reservation_test.* TO 'reservation'@'%';
FLUSH PRIVILEGES;
