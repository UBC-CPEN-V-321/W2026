-- AlterEnum
-- On its own migration: Postgres can't use a new enum value in the transaction that adds it
ALTER TYPE "GameStatus" ADD VALUE 'IN_PROGRESS' AFTER 'BOOKED';
