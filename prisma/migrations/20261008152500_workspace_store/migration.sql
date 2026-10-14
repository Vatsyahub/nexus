-- CreateTable
CREATE TABLE "WorkspaceStore" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceStore_pkey" PRIMARY KEY ("id")
);
