/*
  Warnings:

  - You are about to drop the column `vendorId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `address` on the `Vendor` table. All the data in the column will be lost.
  - You are about to drop the column `contactName` on the `Vendor` table. All the data in the column will be lost.
  - You are about to drop the column `country` on the `Vendor` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[vendorId]` on the table `Vendor` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[crNumber]` on the table `Vendor` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId]` on the table `Vendor` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[name]` on the table `VendorCategory` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `Vendor` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vendorType` to the `Vendor` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `docType` on the `VendorDocument` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "VendorDocumentType" AS ENUM ('COMMERCIAL_REGISTRATION', 'ZAKAT_CERTIFICATE', 'ISO_CERTIFICATE', 'SASO_SABER_CERTIFICATE', 'HSE_PLAN', 'WARRANTY_CERTIFICATE', 'QUALITY_PLAN', 'ORGANIZATION_CHART', 'TECHNICAL_FILE', 'FINANCIAL_FILE', 'VAT_CERTIFICATE', 'GOSI_CERTIFICATE', 'BANK_LETTER', 'INSURANCE_CERTIFICATE', 'INDUSTRY_LICENSE', 'VENDOR_CODE_OF_CONDUCT', 'COMPANY_PROFILE');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE');

-- AlterEnum
ALTER TYPE "VendorStatus" ADD VALUE 'NEEDS_RENEWAL';

-- DropForeignKey
ALTER TABLE "public"."User" DROP CONSTRAINT "User_vendorId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "vendorId",
ADD COLUMN     "accessCode" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Vendor" DROP COLUMN "address",
DROP COLUMN "contactName",
DROP COLUMN "country",
ADD COLUMN     "addressCity" TEXT,
ADD COLUMN     "addressCountry" TEXT,
ADD COLUMN     "addressRegion" TEXT,
ADD COLUMN     "addressStreet" TEXT,
ADD COLUMN     "businessType" TEXT,
ADD COLUMN     "chamberClass" TEXT,
ADD COLUMN     "chamberRegion" TEXT,
ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "crNumber" TEXT,
ADD COLUMN     "csiSpecializationId" INTEGER,
ADD COLUMN     "financialContact" TEXT,
ADD COLUMN     "gosiEmployeeCount" INTEGER,
ADD COLUMN     "kreStatus" TEXT NOT NULL DEFAULT 'New',
ADD COLUMN     "lastEvaluatorId" INTEGER,
ADD COLUMN     "licenseNumber" TEXT,
ADD COLUMN     "primaryContactName" TEXT,
ADD COLUMN     "primaryContactTitle" TEXT,
ADD COLUMN     "productsAndServices" TEXT[],
ADD COLUMN     "reviewNotes" TEXT,
ADD COLUMN     "reviewStatus" TEXT,
ADD COLUMN     "score" DOUBLE PRECISION,
ADD COLUMN     "technicalContact" TEXT,
ADD COLUMN     "userId" INTEGER NOT NULL,
ADD COLUMN     "vendorId" TEXT,
ADD COLUMN     "vendorType" TEXT NOT NULL,
ADD COLUMN     "website" TEXT,
ADD COLUMN     "yearsInBusiness" INTEGER;

-- AlterTable
ALTER TABLE "VendorDocument" ADD COLUMN     "documentNumber" TEXT,
ADD COLUMN     "isValid" BOOLEAN NOT NULL DEFAULT true,
DROP COLUMN "docType",
ADD COLUMN     "docType" "VendorDocumentType" NOT NULL;

-- CreateTable
CREATE TABLE "VendorProjectExperience" (
    "id" SERIAL NOT NULL,
    "vendorId" INTEGER NOT NULL,
    "projectName" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "contractValue" DOUBLE PRECISION NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "scopeDescription" TEXT,
    "referenceContact" TEXT,
    "completionFile" TEXT,

    CONSTRAINT "VendorProjectExperience_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_vendorId_key" ON "Vendor"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_crNumber_key" ON "Vendor"("crNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_userId_key" ON "Vendor"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorCategory_name_key" ON "VendorCategory"("name");

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorProjectExperience" ADD CONSTRAINT "VendorProjectExperience_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
