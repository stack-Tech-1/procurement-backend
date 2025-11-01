/*
  Warnings:

  - You are about to drop the column `financialContact` on the `Vendor` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `Vendor` table. All the data in the column will be lost.
  - You are about to drop the column `technicalContact` on the `Vendor` table. All the data in the column will be lost.

*/

-- 1. ADD NEW COLUMNS (temporarily nullable)
ALTER TABLE "Vendor"
ADD COLUMN "companyLegalName" TEXT,
ADD COLUMN "financialContactEmail" TEXT,
ADD COLUMN "financialContactName" TEXT,
ADD COLUMN "mainCategory" TEXT[],
ADD COLUMN "subCategory" TEXT,
ADD COLUMN "technicalContactEmail" TEXT,
ADD COLUMN "technicalContactName" TEXT;

-- 2. DATA MIGRATION: Transfer data from old columns to new columns (CRUCIAL STEP)

-- Transfer old 'name' to 'companyLegalName'
UPDATE "Vendor" SET "companyLegalName" = "name" WHERE "name" IS NOT NULL;

-- Transfer and Parse old 'technicalContact' data
-- ASSUMPTION: The old 'technicalContact' field stored the name or email, or a combination.
-- For safety, we transfer the entire old string into the new NAME field.
UPDATE "Vendor" SET "technicalContactName" = "technicalContact" WHERE "technicalContact" IS NOT NULL;

-- Transfer and Parse old 'financialContact' data
-- For safety, we transfer the entire old string into the new NAME field.
UPDATE "Vendor" SET "financialContactName" = "financialContact" WHERE "financialContact" IS NOT NULL;


-- 3. DROP OLD COLUMNS
ALTER TABLE "Vendor"
DROP COLUMN "financialContact",
DROP COLUMN "name",
DROP COLUMN "technicalContact";

-- 4. Alter VendorDocument table (NO DATA MIGRATION NEEDED, just adding new nullable fields)
ALTER TABLE "VendorDocument"
ADD COLUMN "gosiNumber" TEXT,
ADD COLUMN "isoType" TEXT,
ADD COLUMN "vatNumber" TEXT;
-- 5. MAKE NEW COLUMNS NOT NULL IF REQUIRED (optional, based on business rules)