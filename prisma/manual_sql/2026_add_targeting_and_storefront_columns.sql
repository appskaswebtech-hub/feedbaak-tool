-- MySQL. Adds columns required by the targeting / storefront / branching update.
-- Additive only: every column is nullable or has a default, so existing live rows are untouched.
-- Run once on the live DB (take a backup first). Do NOT run `prisma migrate dev` or `db push` on live.

ALTER TABLE `Survey`
  ADD COLUMN `isActive`    BOOLEAN      NOT NULL DEFAULT true,
  ADD COLUMN `startsAt`    DATETIME(3)  NULL,
  ADD COLUMN `endsAt`      DATETIME(3)  NULL,
  ADD COLUMN `targetType`  VARCHAR(191) NOT NULL DEFAULT 'all',
  ADD COLUMN `targetValue` TEXT         NULL,
  ADD COLUMN `placement`   VARCHAR(191) NOT NULL DEFAULT 'thankyou',
  ADD COLUMN `pageTargets` TEXT         NULL,
  ADD COLUMN `design`      TEXT         NULL;

ALTER TABLE `Question`
  ADD COLUMN `questionType` VARCHAR(191) NULL,
  ADD COLUMN `branchRules`  TEXT         NULL;

ALTER TABLE `ApiProxyData`
  ADD COLUMN `source`  VARCHAR(191) NULL,
  ADD COLUMN `pageUrl` VARCHAR(191) NULL;
