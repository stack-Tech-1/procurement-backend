import { z } from 'zod';

// Utility to check if a date is in the future
export const futureDate = z.string().refine((val) => {
  if (!val) return true; // Allow null/empty for optional fields

  // Parse the input date as a plain date (ignoring timezones)
  const inputDate = new Date(val);
  if (isNaN(inputDate.getTime())) {
    return false; // Invalid date format
  }

  // Get today's date as a plain date (ignoring timezones)
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Set today's time to midnight for comparison

  return inputDate.getTime() > today.getTime(); // Compare timestamps
}, { message: "Expiry date must be in the future." });

// --- 1. Project Experience Schema (for the array) ---
export const ProjectExperienceSchema = z.object({
  projectName: z.string().min(3, "Project Name is required."),
  clientName: z.string().min(3, "Client Name is required."),
  contractValue: z.number().min(0, "Value must be a positive number."),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  scopeDescription: z.string().optional(),
  referenceContact: z.string().optional(),
  completionFile: z.any() // File object is complex, validate size/type in form
});

// --- 2. Document Entry Schema (for each document) ---
export const DocumentEntrySchema = z.object({
  file: z.any().refine((file) => file !== undefined, "File upload is mandatory."),
  number: z.string().optional(),
  expiry: futureDate.optional(),
});

// --- 3. Main Qualification Form Schema ---
export const VendorQualificationSchema = z.object({
  // Section A: Company Information
  name: z.string().min(5, "Company legal name is mandatory and should be descriptive."),
  crNumber: z.string().min(5, "CR Number is mandatory."),
  vendorType: z.string().min(1, "Vendor Type is mandatory."),
  businessType: z.string().optional(), // Added this missing field
  yearsInBusiness: z.string().refine((val) => !isNaN(parseInt(val)) && parseInt(val) > 0, "Years in business is mandatory and must be a number."),
  gosiEmployeeCount: z.string().refine((val) => !isNaN(parseInt(val)) && parseInt(val) >= 0, "GOSI Employee count is mandatory and must be a number."),
  productsAndServices: z
    .union([
      z.string().min(1, "Products and Services are mandatory."), // Allow string input
      z.array(z.string().min(1, "Service name cannot be empty.")).min(1, "Products and Services are mandatory.") // Allow array input
    ])
    .transform((val) => {
      console.log("🛠 Transforming productsAndServices:", val); // Log the transformation
      return typeof val === "string" ? val.split(",").map((s) => s.trim()) : val;
    }),
  
  // Section B: Contact Information - FIXED FIELD NAMES
  primaryContactName: z.string().min(3, "Primary contact name is mandatory."),
  primaryContactTitle: z.string().min(3, "Primary contact title is mandatory."),
  contactPerson: z.string().min(3, "Contact person is mandatory."),
  contactPhone: z.string().regex(/^(\+966|00966)?\s?5\d{8}$/, "Invalid Saudi phone format (+966 5xxxxxxxxx)."),
  contactEmail: z.string().email("Invalid email address.").min(5, "Email is mandatory."),
  website: z.string().url("Please enter a valid URL").optional().or(z.literal('')), // ADDED THIS FIELD
  technicalContact: z.string().optional(), // ADDED THIS FIELD
  financialContact: z.string().optional(), // ADDED THIS FIELD
  addressStreet: z.string().min(5, "Street address is mandatory."),
  addressCity: z.string().min(2, "City is mandatory."),
  addressCountry: z.string().min(2, "Country is mandatory."),

  // Section C/D: Overview fields
  //statusKRE: z.string().min(1, "KRE Status is mandatory."),

  // --- Dynamic Data Schemas ---
  projectExperience: z.array(ProjectExperienceSchema).optional(),
  documentData: z.record(z.string(), z.any()).optional()
});

// Mandatory Documents to check existence for
export const MANDATORY_DOCS = [
    "COMMERCIAL_REGISTRATION",
    "ZAKAT_CERTIFICATE", 
    "ISO_CERTIFICATE",
    "VAT_CERTIFICATE",
    "GOSI_CERTIFICATE",
    "BANK_LETTER",
    "COMPANY_PROFILE"
];