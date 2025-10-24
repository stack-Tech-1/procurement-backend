// components/VendorQualificationForm.jsx or page.js (if it's the page itself)

"use client";
import { useState, useEffect } from "react"; 
import { z } from 'zod';
import { Building2, FileText, CheckCircle, Send, Plus, Trash2, Calendar, Hash, Upload } from "lucide-react";
import ProjectExperienceTable from "../components/ProjectExperienceTable.js";
import { VendorQualificationSchema, DocumentEntrySchema, MANDATORY_DOCS } from '@/lib/validation/vendorQualificationSchema.js'; 
//import { useForm } from 'react-hook-form'; 
import { useRouter } from 'next/navigation'; 

// --- DOCUMENT CHECKLIST CONFIGURATION (Matches your ENUM and Requirements) ---
const DOCUMENT_CHECKLIST = [
  { label: "Commercial Registration (CR)", dbKey: "COMMERCIAL_REGISTRATION", hasExpiry: true, hasNumber: true, isMandatory: true },
  { label: "Zakat Certificate", dbKey: "ZAKAT_CERTIFICATE", hasExpiry: true, hasNumber: false, isMandatory: true },
  { label: "ISO Certificate", dbKey: "ISO_CERTIFICATE", hasExpiry: true, hasNumber: true, isMandatory: true },
  { label: "VAT Certificate", dbKey: "VAT_CERTIFICATE", hasExpiry: false, hasNumber: true, isMandatory: true },
  { label: "GOSI Certificate", dbKey: "GOSI_CERTIFICATE", hasExpiry: true, hasNumber: true, isMandatory: true },
  { label: "Bank Letter/IBAN", dbKey: "BANK_LETTER", hasExpiry: false, hasNumber: false, isMandatory: true },
  { label: "Company Profile (PDF)", dbKey: "COMPANY_PROFILE", hasExpiry: false, hasNumber: false, isMandatory: true },
  { label: "HSE Plan (Contractors)", dbKey: "HSE_PLAN", hasExpiry: false, hasNumber: false, isMandatory: false, condition: "For contractors" },
  { label: "Quality Plan", dbKey: "QUALITY_PLAN", hasExpiry: false, hasNumber: false, isMandatory: true },
];

// --- Helper Components (Kept your design, slightly enhanced) ---

const FormInput = ({ label, name, type = "text", placeholder, colSpan = 1, required = false, children, value, onChange, error, disabled, }) => (
  <div className={`flex flex-col space-y-1 md:col-span-${colSpan}`}>
    <label htmlFor={name} className={`text-sm font-medium text-gray-600 ${required ? 'after:content-["*"] after:ml-1 after:text-red-500' : ''}`}>
      {label}
    </label>
    {type === "select" ? (
      <select
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        className="w-full border border-gray-300 p-3 rounded-xl focus:ring-blue-500 focus:border-blue-500 transition duration-150 shadow-sm appearance-none bg-white cursor-pointer"         
      >
        {children}
      </select>
    ) : (
      <input
        id={name}
        type={type}
        name={name}
        value={type !== "file" ? value : undefined}
        placeholder={placeholder}
        onChange={onChange}
        className="w-full border border-gray-300 p-3 rounded-xl focus:ring-blue-500 focus:border-blue-500 transition duration-150 shadow-sm"
        disabled={disabled}
      />
    )}
    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
  </div>
);

const SectionHeader = ({ title, icon: Icon }) => (
  <div className="flex items-center space-x-3 pb-2 border-b-2 border-blue-100 mb-6">
    {Icon && <Icon className="w-6 h-6 text-blue-600" />}
    <h2 className="text-xl font-extrabold text-gray-800 tracking-tight">
      {title}
    </h2>
  </div>
);

// --- Document Row Component (Handles the complex document data) ---
// --- Document Row Component (Fixed version) ---
const DocumentRow = ({ doc, onChange, file, expiryDate, docNumber, isEditable }) => {
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Create a synthetic event that matches what handleChange expects
      const syntheticEvent = {
        target: {
          name: `${doc.dbKey}_file`,
          type: 'file',
          files: [file]
        }
      };
      onChange(syntheticEvent);
    }
  };

  const handleInputChange = (e) => {
    onChange(e);
  };

  return (
    <div key={doc.dbKey} className={`grid grid-cols-12 gap-4 items-end p-4 rounded-lg transition duration-150 ${doc.isMandatory ? 'bg-white border border-red-100' : 'bg-gray-50'}`}>
      {/* Document Name */}
      <div className="col-span-12 md:col-span-4 flex flex-col justify-end">
        <label className={`text-sm font-bold text-gray-700 ${doc.isMandatory ? 'after:content-["*"] after:ml-1 after:text-red-500' : ''}`}>
          {doc.label} {doc.condition && <span className="text-xs text-blue-500">({doc.condition})</span>}
        </label>
        <p className="text-xs text-gray-500">
          {/* 🔑 Display existing URL if available */}
                    Status: {file?.url ? <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Existing File</a> : (file ? `Uploaded: ${file.name}` : "Missing")} 
          {expiryDate && `, Expires: ${expiryDate}`}
        </p>
      </div>

      {/* File Upload Input - FIXED */}
      <div className="col-span-12 sm:col-span-4 md:col-span-3">
        <label htmlFor={`${doc.dbKey}-file`} className="flex items-center justify-center space-x-2 w-full p-2 border border-dashed rounded-lg cursor-pointer bg-white hover:bg-blue-50 transition">
          <Upload className="w-4 h-4 text-blue-500" />
          <span className="text-xs text-blue-600 truncate">
            {file ? file.name : 'Select File (PDF only)'}
          </span>
        </label>
        <input
          id={`${doc.dbKey}-file`}
          type="file"
          name={`${doc.dbKey}_file`}
          accept=".pdf"
          className="hidden"
          onChange={handleFileChange}
          disabled={!isEditable}
        />
      </div>

      {/* Expiry Date Input */}
      {doc.hasExpiry && (
        <div className="col-span-6 sm:col-span-4 md:col-span-2">
          <FormInput 
            label="Expiry Date" 
            name={`${doc.dbKey}_expiry`} 
            type="date"
            value={expiryDate || ''}
            onChange={handleInputChange} 
          />
        </div>
      )}

      {/* Document Number Input */}
      {doc.hasNumber && (
        <div className="col-span-6 sm:col-span-4 md:col-span-2">
          <FormInput 
            label="Doc. Number" 
            name={`${doc.dbKey}_number`} 
            type="text"
            value={docNumber || ''}
            onChange={handleInputChange} 
            disabled={!isEditable}
          />
        </div>
      )}
    </div>
  );
};


// ====================================================================
// --- MAIN COMPONENT: VendorQualificationForm ---
// ====================================================================
export default function VendorQualificationForm({ initialData, isEditable = true, onSuccess }) {
  const [formData, setFormData] = useState({});
  const [documentData, setDocumentData] = useState({});
  const [errors, setErrors] = useState({});
  const [projectExperience, setProjectExperience] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState(null);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  
  const router = useRouter();


// 2. 🔑 ADD useEffect TO POPULATE STATE FROM initialData
  useEffect(() => {
        if (initialData) {
            // A. Populate formData (Map API object to flat form state)
            setFormData(prev => ({
                ...prev,
                name: initialData.name || '',
                crNumber: initialData.crNumber || '',
                vendorType: initialData.vendorType || '',
                businessType: initialData.businessType || '',
                yearsInBusiness: initialData.yearsInBusiness || '',
                gosiEmployeeCount: initialData.gosiEmployeeCount || '',
                productsAndServices: initialData.productsAndServices || '',
                primaryContactName: initialData.primaryContactName || '',
                primaryContactTitle: initialData.primaryContactTitle || '',
                contactPerson: initialData.contactPerson || '',
                contactPhone: initialData.contactPhone || '',
                contactEmail: initialData.contactEmail || '',
                website: initialData.website || '',
                technicalContact: initialData.technicalContact || '',
                financialContact: initialData.financialContact || '',
                addressStreet: initialData.addressStreet || '',
                addressCity: initialData.addressCity || '',
                addressCountry: initialData.addressCountry || '',
                // ... (Map all other simple fields)
            }));
    // B. Populate projectExperience
            setProjectExperience(initialData.projectExperience || []);

            // C. Populate documentData (The tricky mapping from array of documents to an object state)
            const mappedDocs = (initialData.documents || []).reduce((acc, doc) => {
                acc[doc.docType] = {
                    // Pseudo-file object to show existing file name/URL
                    file: doc.url ? { name: doc.url.split('/').pop(), url: doc.url } : null,
                    expiry: doc.expiryDate ? doc.expiryDate.split('T')[0] : '', // Format date
                    number: doc.documentNumber || '',
                    existingUrl: doc.url, // Keep a reference to the existing URL
                };
                return acc;
            }, {});
            setDocumentData(mappedDocs);
        }
      }, [initialData]);




  const handleChange = (e) => {
    const { name, value, type, files } = e.target;
    
    
    if (name.includes("_")) {
        const docKey = name.replace("_file", "").replace("_expiry", "").replace("_number", "");
        let docField;
        if (name.endsWith("_file")) docField = "file";
        else if (name.endsWith("_expiry")) docField = "expiry";
        else if (name.endsWith("_number")) docField = "number";
        
        
      setDocumentData(prev => ({
        ...prev,
        [docKey]: {
          ...prev[docKey],
          [docField]: type === "file" ? files[0] : value,
        }
      }));
    } else {
      // Handle standard form fields
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);
    setSubmissionError(null);
    setSubmissionSuccess(false);

    const token = localStorage.getItem("authToken");
    if (!token) {
        console.error("No token found. Please log in.");
        setSubmissionError("No token found. Please log in.");
        setIsSubmitting(false);
        return;
    }

    console.log("🔑 Token being sent:", token);



    // --- 🔑 START: Zod Validation Step ---
    // 1. Map your state data to match the Zod schema's expected structure
    const dataToValidate = {
        // Main Form Fields from formData (assuming state keys match Zod schema names)
        ...formData,
        
        // Documents: Zod expects the key-value object, NOT the mapped array metadata
        documentData: documentData, 
        
        // Projects: Zod expects the array
        projectExperience: projectExperience,
        
        // You may need to map state keys that don't perfectly match Zod (e.g., if Zod uses 'crNumber' but state uses 'licenseNumber')
        // contactPhone: formData.phoneNumber, // Example mapping
        // contactEmail: formData.emailAddress, // Example mapping
        // ...
    };

    try {
        // 2. Validate the data
        VendorQualificationSchema.parse(dataToValidate);

        // 3. Mandatory Documents Check (Since Zod structure doesn't enforce key presence)
        const missingDocs = MANDATORY_DOCS.filter(docKey => {
            const docEntry = documentData[docKey];
            // Check if the document key is mandatory AND is missing the file object
            return docEntry && (!docEntry.file || docEntry.file.length === 0);
        });

        if (missingDocs.length > 0) {
            // Set an error for the document section and throw to stop submission
            const errorMessage = `Missing mandatory documents: ${missingDocs.join(', ')}.`;
            setSubmissionError(errorMessage);
            throw new Error(errorMessage);
        }

    } catch (validationError) {
        // This block catches Zod errors and custom errors
        console.error("Validation failed:", validationError);
        
        if (validationError instanceof z.ZodError) {
            // Reformat Zod errors to set form-specific error state (setErrors)
            const fieldErrors = validationError.errors.reduce((acc, current) => {
                // Use the first part of the path (the field name)
                const fieldName = current.path[0]; 
                acc[fieldName] = current.message;
                return acc;
            }, {});
            setErrors(fieldErrors);
            setSubmissionError("Please correct the validation errors in the form.");
        } else {
            setSubmissionError(validationError.message);
        }
        
        setIsSubmitting(false);
        return; // STOP SUBMISSION
    }




    const finalFormData = new FormData();
    finalFormData.append('vendorData', JSON.stringify({
        ...formData,
        yearsInBusiness: parseInt(formData.yearsInBusiness) || 0, // Default to 0 if null/empty
        gosiEmployeeCount: parseInt(formData.gosiEmployeeCount) || 0, // Default to 0 if null/empty
        
        documentData: Object.keys(documentData).map(key => ({
            docType: key,
            documentNumber: documentData[key].number,
            expiryDate: documentData[key].expiry,
        })),
        
        // 🔑 FIX: Ensure contractValue is a number string before sending
        projectExperience: projectExperience.map(p => ({
            ...p,
            contractValue: parseFloat(p.contractValue)
        })),
    }));

    Object.keys(documentData).forEach(docKey => {
        const file = documentData[docKey].file;
        if (file) {
            finalFormData.append(`file_${docKey}`, file, file.name);
        }
    });

    projectExperience.forEach((project, index) => {
        if (project.completionFile && project.completionFile[0]) {
            const file = project.completionFile[0];
            finalFormData.append(`project_file_${index}`, file, file.name);
        }
    });

    try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        console.log("🌍 API URL being used:", apiUrl);
        const response = await fetch(`${apiUrl}/api/vendor/qualification/submit`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
            },
            body: finalFormData,
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Server processing error occurred.');
        }

        if (onSuccess) {
                        onSuccess(); 
                        setFormData({}); // Still clear the form if it was a fresh submission
                        setDocumentData({});
                        setProjectExperience([]);
                    } else {
                        // Fallback to original logic if used as initial submission page
                        setTimeout(() => {
                            router.push('/vendor/submission-tracker');
                        }, 3000);
                    }

    } catch (error) {
        console.error("API Submission Error:", error);
        setSubmissionError(error.message);
        setSubmissionSuccess(false);
    } finally {
        setIsSubmitting(false);
    }
};

// --- MAIN COMPONENT RENDER (UPDATED) ---
  return (
    <div className="p-4 sm:p-8 bg-gray-100 min-h-screen">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-6 sm:p-10 border border-gray-200">
        
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-black text-gray-800 mb-2 tracking-wide">
            Vendor Qualification Form
          </h1>
          <p className="text-gray-500">
            Complete all sections to submit your company for qualification. Mandatory fields are marked with (*).
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-12">

            {/* NEW: Submission Feedback Messages */}
            {submissionSuccess && (
                <div className="alert alert-success bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-6" role="alert">
                    <strong className="font-bold">✅ Success!</strong>
                    <span className="block sm:inline"> Your qualification has been submitted and is pending review. Redirecting...</span>
                </div>
            )}

            {submissionError && (
                <div className="alert alert-danger bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
                    <strong className="font-bold">❌ Submission Failed!</strong>
                    <span className="block sm:inline"> {submissionError}</span>
                </div>
            )}
          
          {/* A. Company Information */}
          <section className="bg-blue-50/50 p-6 rounded-2xl border border-blue-200/50">
            <SectionHeader title="A. Company Information" icon={Building2} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <FormInput 
                label="Company Legal Name" 
                name="name" // Matches schema
                placeholder="Enter full legal name" 
                required 
                value={formData.name || ''}
                onChange={handleChange}
                error={errors.name}
              />
              
              <FormInput 
                label="Commercial Registration (CR) Number" 
                name="crNumber" // Matches schema
                placeholder="Unique CR Number" 
                required 
                value={formData.crNumber || ''}
                onChange={handleChange}
                error={errors.crNumber}
              />
              
              <FormInput label="Vendor Type" name="vendorType" type="select" required value={formData.vendorType || ''} onChange={handleChange} error={errors.vendorType}>
                <option value="">-- Select Vendor Type --</option>
                <option value="GeneralContractor">General Contractor</option>
                <option value="Supplier">Supplier</option>
                <option value="Consultant">Consultant</option>
                {/* Add all other required options */}
              </FormInput>

              <FormInput label="Business Type" name="businessType" type="select" value={formData.businessType || ''} onChange={handleChange} error={errors.businessType}>
                <option value="">-- Select Business Type --</option>
                <option value="Supplier">Supplier</option>
                <option value="Contractor">Contractor</option>
                <option value="Manufacturer">Manufacturer</option>
              </FormInput>

              <FormInput label="Years in Business" name="yearsInBusiness" type="number" placeholder="Number of years (Mandatory)" required value={formData.yearsInBusiness || ''} onChange={handleChange} error={errors.yearsInBusiness} />
              <FormInput label="GOSI Employee Count" name="gosiEmployeeCount" type="number" placeholder="Total employees under GOSI (Mandatory)" required value={formData.gosiEmployeeCount || ''} onChange={handleChange} error={errors.gosiEmployeeCount} />
              
              <FormInput 
                label="Products & Services (Multi-select/Text)" 
                name="productsAndServices" // Matches schema (String[])
                placeholder="Comma-separated list (e.g., HVAC, Electrical, Plumbing)" 
                colSpan={2}
                required
                value={formData.productsAndServices || ''} 
                onChange={handleChange}
                error={errors.productsAndServices}
              />
              
            </div>
          </section>

          {/* B. Contact Information */}
          <section className="p-6">
            <SectionHeader title="B. Contact Information" icon={FileText} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Primary Contact */}
              <FormInput label="Primary Contact Name" name="primaryContactName" placeholder="Full Name (Mandatory)" required value={formData.primaryContactName || ''} onChange={handleChange} error={errors.primaryContactName} />
              <FormInput label="Primary Contact Title" name="primaryContactTitle" placeholder="Title (Mandatory)" required value={formData.primaryContactTitle || ''} onChange={handleChange} error={errors.primaryContactTitle} />
              <FormInput label="Contact Person" name="contactPerson" placeholder="The person filling the form (Mandatory)" required value={formData.contactPerson || ''} onChange={handleChange} error={errors.contactPerson} />

              {/* General Contact Info */}
              <FormInput label="Phone Number" name="contactPhone" type="tel" placeholder="+966 5x xxx xxxx" required value={formData.contactPhone || ''} onChange={handleChange} error={errors.contactPhone} />
              <FormInput label="Email Address" name="contactEmail" type="email" placeholder="contact@company.com" required value={formData.contactEmail || ''} onChange={handleChange} error={errors.contactEmail} />
              <FormInput label="Company Website" name="website" type="url" placeholder="https://www.company.com (Optional)" value={formData.website || ''} onChange={handleChange} error={errors.website} />
              
              {/* Technical & Financial Contacts */}
              <FormInput label="Technical Contact (Name + Email)" name="technicalContact" placeholder="Optional" colSpan={2} value={formData.technicalContact || ''} onChange={handleChange} error={errors.technicalContact} />
              <FormInput label="Financial Contact (Name + Email)" name="financialContact" placeholder="Optional" colSpan={1} value={formData.financialContact || ''} onChange={handleChange} error={errors.financialContact} />

              {/* Address Fields */}
              <FormInput label="Street Address" name="addressStreet" placeholder="Street / PO Box (Mandatory)" required value={formData.addressStreet || ''} onChange={handleChange} error={errors.addressStreet} />
              <FormInput label="City" name="addressCity" placeholder="City (Mandatory)" required value={formData.addressCity || ''} onChange={handleChange} error={errors.addressCity} />
              <FormInput label="Country" name="addressCountry" placeholder="Country (Mandatory)" required value={formData.addressCountry || ''} onChange={handleChange} error={errors.addressCountry} />

            </div>
          </section>

          {/* C. Document Checklist (The complex part) */}
          <section className="bg-gray-50 p-6 rounded-2xl border border-gray-200">
            <SectionHeader title="C. Document Checklist & Uploads" icon={CheckCircle} />
            <div className="flex flex-col space-y-4">
              {DOCUMENT_CHECKLIST.map((doc) => (
                <DocumentRow
                  key={doc.dbKey}
                  doc={doc}
                  onChange={handleChange}
                  // Pass the state values for visual feedback
                  file={documentData[doc.dbKey]?.file} 
                  expiryDate={documentData[doc.dbKey]?.expiry} 
                  docNumber={documentData[doc.dbKey]?.number}
                />
              ))}
            </div>
            <p className="text-sm text-red-500 mt-4 font-semibold">
              Note: Documents with an expiry date must be future-dated for submission.
            </p>
          </section>
                          
      {/* D. Project Experience (NOW IMPLEMENTED) */}
      <section className="p-6">
        <SectionHeader title="D. Project Experience" icon={FileText} />
        {/* 👈 RENDER THE NEW DYNAMIC TABLE */}
        <ProjectExperienceTable 
            projects={projectExperience}   
            setProjects={setProjectExperience} 
        />
      </section>

          {/* Submission Button Block */}
          <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
          {isEditable && (
            <button
              type="submit"
              disabled={isSubmitting} // Use the new state here
              className={`px-8 py-3 rounded-full flex items-center gap-2 font-bold text-white transition duration-150 shadow-lg ${isSubmitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/50'}`}
            >
              {isSubmitting ? (
                <>
                    {/* Simple loading spinner */}
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Processing...
                </>
              ) : (
                <>
                    <Send className="w-5 h-5" />
                    Submit Qualification
                </>
              )}
            </button>
            )}            
          </div>
        </form>
      </div>
    </div>
  );
}
