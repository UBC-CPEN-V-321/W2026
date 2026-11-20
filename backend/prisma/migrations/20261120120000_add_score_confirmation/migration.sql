-- AlterTable
ALTER TABLE "game_users" ADD COLUMN     "scoreConfirmedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "score_proposals" (
    "gameId" UUID NOT NULL,
    "proposedById" UUID NOT NULL,
    "rounds" JSONB NOT NULL,
    "proposedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "score_proposals_pkey" PRIMARY KEY ("gameId")
);

-- AddForeignKey
ALTER TABLE "score_proposals" ADD CONSTRAINT "score_proposals_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_proposals" ADD CONSTRAINT "score_proposals_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
