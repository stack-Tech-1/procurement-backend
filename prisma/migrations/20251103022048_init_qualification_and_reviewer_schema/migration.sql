/*
  Warnings:

  - You are about to drop the column `csiSpecializationId` on the `Vendor` table. All the data in the column will be lost.
  - You are about to drop the column `lastEvaluatorId` on the `Vendor` table. All the data in the column will be lost.
  - You are about to drop the column `mainCategory` on the `Vendor` table. All the data in the column will be lost.
  - You are about to drop the column `score` on the `Vendor` table. All the data in the column will be lost.
  - You are about to drop the column `subCategory` on the `Vendor` table. All the data in the column will be lost.
  - You are about to drop the `VendorCategory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_VendorToVendorCategory` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[employeeId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "public"."_VendorToVendorCategory" DROP CONSTRAINT "_VendorToVendorCategory_A_fkey";

-- DropForeignKey
ALTER TABLE "public"."_VendorToVendorCategory" DROP CONSTRAINT "_VendorToVendorCategory_B_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "department" TEXT,
ADD COLUMN     "employeeId" TEXT,
ADD COLUMN     "jobTitle" TEXT;

-- AlterTable
ALTER TABLE "Vendor" DROP COLUMN "csiSpecializationId",
DROP COLUMN "lastEvaluatorId",
DROP COLUMN "mainCategory",
DROP COLUMN "score",
DROP COLUMN "subCategory",
ADD COLUMN     "assignedReviewerId" INTEGER,
ADD COLUMN     "chamberExpiryDate" TIMESTAMP(3),
ADD COLUMN     "isQualified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastReviewedById" INTEGER,
ADD COLUMN     "nextReviewDate" TIMESTAMP(3),
ADD COLUMN     "ownershipType" TEXT,
ADD COLUMN     "qualificationScore" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "vatNumber" TEXT,
ADD COLUMN     "vendorClass" TEXT DEFAULT 'D';

-- DropTable
DROP TABLE "public"."VendorCategory";

-- DropTable
DROP TABLE "public"."_VendorToVendorCategory";

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "csiCode" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorToCategory" (
    "id" SERIAL NOT NULL,
    "vendorId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,

    CONSTRAINT "VendorToCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_csiCode_key" ON "Category"("csiCode");

-- CreateIndex
CREATE UNIQUE INDEX "VendorToCategory_vendorId_categoryId_key" ON "VendorToCategory"("vendorId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_assignedReviewerId_fkey" FOREIGN KEY ("assignedReviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_lastReviewedById_fkey" FOREIGN KEY ("lastReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorToCategory" ADD CONSTRAINT "VendorToCategory_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorToCategory" ADD CONSTRAINT "VendorToCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
