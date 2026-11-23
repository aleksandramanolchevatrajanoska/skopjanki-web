-- A member can host at most one plan per calendar week (Mon-Sun, Europe/Skopje).
-- Rejected plans are deleted, which frees the week again.
CREATE UNIQUE INDEX "Event_member_plan_one_per_week"
  ON "Event" ("createdById", "weekKey")
  WHERE "kind" = 'MEMBER_PLAN' AND "status" IN ('PENDING', 'APPROVED');
