-- CreateTable
CREATE TABLE "SpokenLanguage" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "SpokenLanguage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_SpokenLanguageToUser" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_SpokenLanguageToUser_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpokenLanguage_name_key" ON "SpokenLanguage"("name");

-- CreateIndex
CREATE INDEX "_SpokenLanguageToUser_B_index" ON "_SpokenLanguageToUser"("B");

-- AddForeignKey
ALTER TABLE "_SpokenLanguageToUser" ADD CONSTRAINT "_SpokenLanguageToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "SpokenLanguage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SpokenLanguageToUser" ADD CONSTRAINT "_SpokenLanguageToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
