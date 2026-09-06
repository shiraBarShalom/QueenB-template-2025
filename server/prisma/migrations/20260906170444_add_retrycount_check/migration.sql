-- Defence-in-depth for invariant I14: retryCount is only ever 0, 1 or 2.
-- The scheduling service already guarantees this (only CANNOT_ATTEND changes it,
-- guarded by `retryCount < 2`), but a bad manual UPDATE or a future code path
-- that bypasses the service would otherwise be able to corrupt it. Prisma does
-- not model CHECK constraints, so this lives only in the migration; it does not
-- change the generated client.
ALTER TABLE "MentoringRequest"
  ADD CONSTRAINT "MentoringRequest_retryCount_range"
  CHECK ("retryCount" >= 0 AND "retryCount" <= 2);
