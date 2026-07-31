-- Zweite Datenbank für die Testsuite. Tests laufen gegen MariaDB und nicht gegen
-- SQLite, weil die Kollisionsprüfung auf Zeilensperren (SELECT ... FOR UPDATE)
-- aufbaut, die SQLite nicht kennt.
CREATE DATABASE IF NOT EXISTS reservation_test
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON reservation_test.* TO 'reservation'@'%';
FLUSH PRIVILEGES;
