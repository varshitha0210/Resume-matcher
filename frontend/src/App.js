import React, { useState } from 'react'; 

    // Main App Component
    const App = () => {
      const [jobDescription, setJobDescription] = useState('');
      const [resumeFiles, setResumeFiles] = useState([]);
      const [matchingResults, setMatchingResults] = useState([]);
      const [isLoading, setIsLoading] = useState(false);
      const [message, setMessage] = useState('');

      /**
       * Handles changes to the job description textarea.
       * @param {Object} e - The event object from the textarea.
       */
      const handleJobDescriptionChange = (e) => {
        setJobDescription(e.target.value);
      };

      /**
       * Handles file selection for resumes.
       * @param {Object} e - The event object from the file input.
       */
      const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        // Filter out files that are not PDF, DOCX, or TXT
        const allowedTypes = ['.pdf', '.doc', '.docx', '.txt'];
        const filteredFiles = files.filter(file =>
          allowedTypes.some(type => file.name.toLowerCase().endsWith(type))
        );

        if (files.length !== filteredFiles.length) {
          setMessage('Some files were not uploaded. Only PDF, DOCX, and TXT files are allowed.');
        } else {
          setMessage(''); // Clear message if all files are valid
        }
        setResumeFiles(filteredFiles);
      };

      /**
       * Handles the resume matching process.
       * This sends data to the backend API.
       */
      const handleMatchResumes = async () => {
        if (!jobDescription.trim()) {
          setMessage('Please enter a job description.');
          return;
        }
        if (resumeFiles.length === 0) {
          setMessage('Please upload at least one resume.');
          return;
        }

        setIsLoading(true);
        setMessage('');
        setMatchingResults([]); // Clear previous results

        const formData = new FormData();
        formData.append('jobDescription', jobDescription);
        resumeFiles.forEach((file) => {
          formData.append('resumes', file);
        });

        try {
          // Ensure this URL matches your backend server's address
          const response = await fetch('http://localhost:5000/api/match', {
            method: 'POST',
            body: formData, // Multer expects FormData for file uploads
          });

          if (!response.ok) {
            // Attempt to read error message from backend
            const errorData = await response.json().catch(() => ({ error: 'Unknown server error.' }));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          setMatchingResults(data);
          setMessage('Matching process completed successfully!');
        } catch (error) {
          console.error('Error during resume matching:', error);
          setMessage(`Failed to match resumes: ${error.message}`);
        } finally {
          setIsLoading(false);
        }
      };

      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4 font-inter">
          <div className="bg-white rounded-2xl card-shadow p-6 md:p-10 w-full max-w-4xl border border-gray-100">
            <h1 className="text-4xl font-extrabold text-gray-900 text-center mb-8 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-700">
              Resume Matcher
            </h1>

            {/* Job Description Input */}
            <div className="mb-6">
              <label htmlFor="jobDescription" className="block text-gray-700 text-base font-semibold mb-2">
                Job Description
              </label>
              <textarea
                id="jobDescription"
                className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition duration-300 ease-in-out resize-y min-h-[150px] placeholder-gray-400 text-gray-800 text-base"
                rows="8"
                placeholder="Paste the job description here. Be as detailed as possible for best matching results..."
                value={jobDescription}
                onChange={handleJobDescriptionChange}
              ></textarea>
            </div>

            {/* Resume Upload Input */}
            <div className="mb-6">
              <label htmlFor="resumeUpload" className="block text-gray-700 text-base font-semibold mb-2">
                Upload Resumes (PDF, DOCX, TXT)
              </label>
              <input
                type="file"
                id="resumeUpload"
                className="w-full text-gray-700
                           file:mr-4 file:py-2.5 file:px-5
                           file:rounded-full file:border-0
                           file:text-sm file:font-semibold
                           file:bg-purple-100 file:text-purple-700
                           hover:file:bg-purple-200 cursor-pointer
                           transition duration-200 ease-in-out"
                accept=".pdf,.doc,.docx,.txt"
                multiple
                onChange={handleFileChange}
              />
              {resumeFiles.length > 0 && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <h4 className="text-sm font-medium text-gray-600 mb-2">Selected Files:</h4>
                  <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                    {resumeFiles.map((file, index) => (
                      <li key={index} className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        {file.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Action Button */}
            <div className="mb-8">
              <button
                onClick={handleMatchResumes}
                className="w-full gradient-button text-white font-bold py-3.5 px-6 rounded-xl
                           shadow-lg hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-purple-300
                           flex items-center justify-center transition duration-300 ease-in-out
                           disabled:opacity-60 disabled:shadow-none disabled:cursor-not-allowed"
                disabled={isLoading || !jobDescription.trim() || resumeFiles.length === 0}
              >
                {isLoading ? (
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  'Match Resumes'
                )}
              </button>
            </div>

            {/* Message Display */}
            {message && (
              <div className={`p-4 rounded-lg text-sm mb-8 font-medium
                ${message.includes('successfully') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {message}
              </div>
            )}

            {/* Matching Results Display */}
            {matchingResults.length > 0 && (
              <div>
                <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Matching Results</h2>
                <div className="space-y-6">
                  {matchingResults.map((result, index) => (
                    <div key={index} className="bg-white p-6 rounded-xl border border-gray-200 shadow-md transform hover:scale-[1.005] transition-transform duration-200 ease-in-out">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-3 gap-2">
                        <h3 className="text-xl font-semibold text-indigo-700">{result.fileName}</h3>
                        <div className="w-full md:w-auto flex items-center gap-3">
                          <div className="flex-grow bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-green-500 h-2 rounded-full"
                              style={{ width: `${result.matchScore}%` }}
                            ></div>
                          </div>
                          <span className="text-2xl font-extrabold text-green-600">{result.matchScore}%</span>
                        </div>
                      </div>
                      <p className="text-gray-700 text-sm mb-3 leading-relaxed">{result.summary}</p>
                      {result.keywordsFound && result.keywordsFound.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-4">
                          {result.keywordsFound.map((keyword, kwIndex) => (
                            <span key={kwIndex} className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full shadow-sm">
                              {keyword}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    };
export default App;
