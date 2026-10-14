-- Per-user access ticks (block / view / edit). Null means kind defaults.
ALTER TABLE "User" ADD COLUMN "access" JSONB;
