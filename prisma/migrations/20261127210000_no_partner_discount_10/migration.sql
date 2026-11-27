-- Coming events with no partner and no fixed price yet: members get 10% off (was 20%).
UPDATE "Event" SET "memberDiscountPct" = 10
WHERE "partnerId" IS NULL AND "lockedAt" IS NULL AND "startsAt" > now() AND "kind" <> 'FUSION' AND "status" <> 'CANCELLED';
