// components/ProjectExperienceTable.jsx

import React from 'react';
import { Plus, Trash2, Calendar, DollarSign } from 'lucide-react';

// Initial state for a single project entry
const initialProject = {
  projectName: '',
  clientName: '',
  contractValue: 0,
  startDate: '',
  endDate: '',
  scopeDescription: '',
  referenceContact: '',
  completionFile: null, // Holds the File object
};

// --- Project Experience Table Component ---
export default function ProjectExperienceTable({ projects = [], setProjects }) {
  
  // --- State Handlers ---

  const handleAddProject = () => {
    // Adds a new, empty project row to the state
    setProjects(prev => [...prev, initialProject]);
  };

  const handleRemoveProject = (index) => {
    // Removes a project row by its index
    setProjects(prev => prev.filter((_, i) => i !== index));
  };

  const handleChange = (index, name, value) => {
    // Updates a specific field in a specific project row
    setProjects(prev => prev.map((project, i) => {
      if (i === index) {
        return { ...project, [name]: value };
      }
      return project;
    }));
  };

  const handleFileChange = (index, file) => {
    // Handles the file upload for the completion certificate
    handleChange(index, 'completionFile', file);
  };


  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-800 flex items-center justify-between">
        List of Major Completed Projects
        <button
          type="button"
          onClick={handleAddProject}
          className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-full hover:bg-green-700 transition duration-150 shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>Add Project</span>
        </button>
      </h3>

      {projects.length === 0 ? (
        <div className="text-center p-8 bg-gray-50 rounded-xl text-gray-500 border border-dashed border-gray-300">
          Click "Add Project" to list your relevant experience.
        </div>
      ) : (
        <div className="space-y-8">
          {projects.map((project, index) => (
            <div key={index} className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm relative">
              
              <h4 className="text-md font-bold mb-4 text-blue-700">Project #{index + 1}</h4>

              <button
                type="button"
                onClick={() => handleRemoveProject(index)}
                className="absolute top-4 right-4 p-2 text-red-500 hover:text-red-700 transition"
                title="Remove Project"
              >
                <Trash2 className="w-5 h-5" />
              </button>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                
                {/* Row 1: Names and Values */}
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-gray-500">Project Name *</label>
                  <input
                    type="text"
                    value={project.projectName}
                    onChange={(e) => handleChange(index, 'projectName', e.target.value)}
                    className="w-full border border-gray-300 p-2 rounded-lg"
                    placeholder="Residential Tower 1"
                    required
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="text-xs font-medium text-gray-500">Client Name *</label>
                  <input
                    type="text"
                    value={project.clientName}
                    onChange={(e) => handleChange(index, 'clientName', e.target.value)}
                    className="w-full border border-gray-300 p-2 rounded-lg"
                    placeholder="Emaar, Aramco, etc."
                    required
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="text-xs font-medium text-gray-500 flex items-center"><DollarSign className="w-3 h-3 mr-1"/> Contract Value (SAR) *</label>
                  <input
                    type="number"
                    value={project.contractValue}
                    onChange={(e) => handleChange(index, 'contractValue', parseFloat(e.target.value) || 0)}
                    className="w-full border border-gray-300 p-2 rounded-lg"
                    placeholder="5000000.00"
                    required
                  />
                </div>

                {/* Row 2: Dates */}
                <div className="md:col-span-1">
                  <label className="text-xs font-medium text-gray-500 flex items-center"><Calendar className="w-3 h-3 mr-1"/> Start Date</label>
                  <input
                    type="date"
                    value={project.startDate}
                    onChange={(e) => handleChange(index, 'startDate', e.target.value)}
                    className="w-full border border-gray-300 p-2 rounded-lg"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="text-xs font-medium text-gray-500 flex items-center"><Calendar className="w-3 h-3 mr-1"/> End Date</label>
                  <input
                    type="date"
                    value={project.endDate}
                    onChange={(e) => handleChange(index, 'endDate', e.target.value)}
                    className="w-full border border-gray-300 p-2 rounded-lg"
                  />
                </div>
                
                {/* Row 3: Scope and Contact */}
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-gray-500">Scope Description</label>
                  <input
                    type="text"
                    value={project.scopeDescription}
                    onChange={(e) => handleChange(index, 'scopeDescription', e.target.value)}
                    className="w-full border border-gray-300 p-2 rounded-lg"
                    placeholder="Briefly describe the scope of work."
                  />
                </div>

                {/* Row 4: Reference and File Upload */}
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-gray-500">Reference Contact (Name, Email/Phone)</label>
                  <input
                    type="text"
                    value={project.referenceContact}
                    onChange={(e) => handleChange(index, 'referenceContact', e.target.value)}
                    className="w-full border border-gray-300 p-2 rounded-lg"
                    placeholder="Optional: Contact for verification"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-gray-500">Completion Certificate (Upload)</label>
                  <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                    <label className="flex items-center justify-center p-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 cursor-pointer transition">
                      Upload File
                      <input
                          type="file"
                          accept=".pdf,.doc,.docx"
                          className="hidden"
                          onChange={(e) => handleFileChange(index, e.target.files[0] || null)}
                      />
                    </label>
                    <span className="p-2 text-sm text-gray-500 truncate w-full">
                      {project.completionFile ? project.completionFile.name : 'No file selected'}
                    </span>
                  </div>
                </div>

              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}