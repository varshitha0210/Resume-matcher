// server.js
// This Express.js backend handles resume uploads, extracts text, performs basic NLP matching,
// and interacts with a PostgreSQL database for persistence.

const express = require('express');
const multer = require('multer'); // For handling multipart/form-data (file uploads)
const cors = require('cors');     // For Cross-Origin Resource Sharing
const path = require('path');     // For working with file and directory paths
const fs = require('fs').promises; // Node.js file system module with promise-based methods

// Libraries for Text Extraction
const pdfParse = require('pdf-parse'); // For parsing PDF files
const mammoth = require('mammoth');   // For parsing DOCX files

// Libraries for NLP (Natural Language Processing) - Simple implementation
const natural = require('natural'); // Used for tokenization and stop word removal

// PostgreSQL client
const { Pool } = require('pg');

const app = express();
const port = 5000; // Backend server port

// --- Middleware Setup ---

// Enable CORS for all routes (important for frontend-backend communication)
app.use(cors());

// Parse JSON request bodies (for job description text)
app.use(express.json());

// Create the 'uploads' directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir); // Store files in the 'uploads' directory
    },
    filename: (req, file, cb) => {
        // Generate a unique filename using timestamp and original extension
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// --- PostgreSQL Database Setup ---
// !! IMPORTANT !!
// Before running, you MUST configure your PostgreSQL connection details here.
// Make sure you have a PostgreSQL server running and a database created.
const pool = new Pool({
    user: 'postgres',      // Replace with your PostgreSQL username
    host: 'localhost',         // Replace with your PostgreSQL host (e.g., 'localhost', '127.0.0.1')
    database: 'resume_matcher_db', // Replace with your database name
    password: 'Varshitha@2005', // Replace with your PostgreSQL password
    port: 5432,                // Default PostgreSQL port, change if yours is different
});

// Function to initialize database tables
async function initDatabase() {
    try {
        const client = await pool.connect();
        await client.query(`
            CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; -- Enable UUID generation if not already present

            CREATE TABLE IF NOT EXISTS jobs (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                description TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS resumes (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                original_filename VARCHAR(255) NOT NULL,
                extracted_text TEXT,
                uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS match_results (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
                match_score NUMERIC(5, 2) NOT NULL, -- e.g., 95.50
                matched_keywords TEXT[], -- Array of text for keywords
                match_summary TEXT,
                matched_on TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Database tables checked/created successfully.');
        client.release();
    } catch (err) {
        console.error('Error initializing database:', err);
        process.exit(1); // Exit if database cannot be initialized
    }
}

// --- Text Extraction Logic ---

/**
 * Extracts text content from a given file based on its extension.
 * @param {string} filePath - The full path to the file.
 * @param {string} originalname - The original filename (to determine extension).
 * @returns {Promise<string>} - A promise that resolves with the extracted text.
 */
async function extractTextFromFile(filePath, originalname) {
    const ext = path.extname(originalname).toLowerCase();
    try {
        if (ext === '.pdf') {
            const dataBuffer = await fs.readFile(filePath);
            const data = await pdfParse(dataBuffer);
            return data.text;
        } else if (ext === '.docx') {
            const dataBuffer = await fs.readFile(filePath);
            const result = await mammoth.extractRawText({ arrayBuffer: dataBuffer });
            // mammoth.extractRawText returns { value: string, messages: array }
            // If you want HTML: const result = await mammoth.convertToHtml({path: filePath}); return result.value;
            return result.value;
        } else if (ext === '.txt') {
            return await fs.readFile(filePath, 'utf8');
        } else {
            console.warn(`Unsupported file type: ${ext} for ${originalname}. Returning empty text.`);
            return '';
        }
    } catch (error) {
        console.error(`Error extracting text from ${originalname}:`, error);
        return ''; // Return empty string on error
    }
}

// --- Basic NLP Matching Logic ---

// A simple list of common English stop words
const stopWords = new Set(natural.stopwords);

/**
 * Tokenizes text, converts to lowercase, and removes stop words.
 * @param {string} text - The input text.
 * @returns {string[]} - An array of cleaned tokens.
 */
function cleanText(text) {
    const tokenizer = new natural.WordTokenizer();
    return tokenizer.tokenize(text.toLowerCase())
        .filter(token => natural.PorterStemmer.stem(token).length > 2) // Remove very short words after stemming
        .filter(token => !stopWords.has(token));
}

/**
 * Performs a basic NLP match between job description and resume text.
 * @param {string} jobDescription - The job description text.
 * @param {string} resumeText - The extracted resume text.
 * @returns {{matchScore: number, keywordsFound: string[], summary: string}}
 */
function performNLPMatching(jobDescription, resumeText) {
    const jobTokens = cleanText(jobDescription);
    const resumeTokens = cleanText(resumeText);

    // Create a set of unique job description keywords for efficient lookup
    const jobKeywordsSet = new Set(jobTokens);

    // Find common keywords (those from JD present in resume)
    const commonKeywords = resumeTokens.filter(token => jobKeywordsSet.has(token));

    // Calculate match score based on percentage of job description keywords found
    let matchScore = 0;
    if (jobKeywordsSet.size > 0) {
        // Use a set to count unique common keywords
        const uniqueCommonKeywords = new Set(commonKeywords);
        matchScore = (uniqueCommonKeywords.size / jobKeywordsSet.size) * 100;
        matchScore = Math.min(100, matchScore * 1.2); // Give a slight boost, cap at 100
        matchScore = parseFloat(matchScore.toFixed(2)); // Round to 2 decimal places
    }

    // Generate a simple summary: find sentences in resume text containing common keywords
    let summary = "No direct summary generated based on keywords.";
    if (commonKeywords.length > 0) {
        const sentenceTokenizer = new natural.SentenceTokenizer();
        const sentences = sentenceTokenizer.tokenize(resumeText);
        const keywordsForSummary = new Set(commonKeywords.slice(0, 5)); // Use top 5 common keywords for summary
        const relevantSentences = sentences.filter(sentence => {
            const cleanedSentenceTokens = cleanText(sentence);
            return cleanedSentenceTokens.some(token => keywordsForSummary.has(token));
        });
        if (relevantSentences.length > 0) {
            summary = relevantSentences.slice(0, 2).join('... ') + '...'; // Take first 2 relevant sentences
        } else {
            // Fallback if no specific sentences match, use a generic one
            summary = `This resume contains ${new Set(commonKeywords).size} keywords relevant to the job description, including: ${Array.from(new Set(commonKeywords)).slice(0, 5).join(', ')}.`;
        }
    }

    return {
        matchScore: matchScore,
        keywordsFound: Array.from(new Set(commonKeywords)).slice(0, 10), // Return up to 10 unique common keywords
        summary: summary
    };
}

// --- API Route ---

/**
 * POST /api/match
 * Handles the resume matching process.
 * - Uploads resume files.
 * - Extracts text from files.
 * - Performs NLP matching.
 * - Stores data and results in PostgreSQL.
 * - Returns matching results to the frontend.
 */
app.post('/api/match', upload.array('resumes'), async (req, res) => {
    let client; // Declare client outside try-catch for finally block access
    try {
        const { jobDescription } = req.body;
        const resumeFiles = req.files;

        // --- Input Validation ---
        if (!jobDescription || jobDescription.trim() === '') {
            return res.status(400).json({ error: 'Job description is required.' });
        }
        if (!resumeFiles || resumeFiles.length === 0) {
            return res.status(400).json({ error: 'Please upload at least one resume file.' });
        }

        console.log(`Received job description (${jobDescription.length} chars) and ${resumeFiles.length} files.`);

        client = await pool.connect(); // Get a client from the connection pool
        await client.query('BEGIN'); // Start a transaction

        // 1. Store Job Description
        const jobInsertResult = await client.query(
            'INSERT INTO jobs(description) VALUES($1) RETURNING id',
            [jobDescription]
        );
        const jobId = jobInsertResult.rows[0].id;
        console.log(`Job description saved with ID: ${jobId}`);

        const results = [];

        // 2. Process Each Resume
        for (const file of resumeFiles) {
            let extractedText = '';
            try {
                extractedText = await extractTextFromFile(file.path, file.originalname);
                console.log(`Extracted text from ${file.originalname}: ${extractedText.substring(0, 100)}...`);
            } catch (textExtractError) {
                console.error(`Failed to extract text from ${file.originalname}:`, textExtractError);
                // Continue processing other files even if one fails
                extractedText = `Error extracting text from ${file.originalname}.`;
            } finally {
                // Ensure temporary file is deleted after attempt to extract text
                await fs.unlink(file.path).catch(err => console.error(`Error deleting temp file ${file.path}:`, err));
            }

            // Store Resume
            const resumeInsertResult = await client.query(
                'INSERT INTO resumes(original_filename, extracted_text) VALUES($1, $2) RETURNING id',
                [file.originalname, extractedText]
            );
            const resumeId = resumeInsertResult.rows[0].id;
            console.log(`Resume ${file.originalname} saved with ID: ${resumeId}`);

            // Perform NLP Matching
            const { matchScore, keywordsFound, summary } = performNLPMatching(jobDescription, extractedText);
            console.log(`Matching for ${file.originalname}: Score=${matchScore}%, Keywords=${keywordsFound.join(', ')}`);

            // Store Match Results
            await client.query(
                'INSERT INTO match_results(job_id, resume_id, match_score, matched_keywords, match_summary) VALUES($1, $2, $3, $4, $5)',
                [jobId, resumeId, matchScore, keywordsFound, summary] // keywordsFound is already an array
            );

            results.push({
                fileName: file.originalname,
                matchScore: matchScore,
                keywordsFound: keywordsFound,
                summary: summary,
            });
        }

        await client.query('COMMIT'); // Commit the transaction
        results.sort((a, b) => b.matchScore - a.matchScore); // Sort by score

        res.json(results); // Send results to frontend

    } catch (error) {
        if (client) {
            await client.query('ROLLBACK'); // Rollback transaction on error
        }
        console.error('Error processing resume match request:', error);
        res.status(500).json({ error: 'An internal server error occurred during processing.' });
    } finally {
        if (client) {
            client.release(); // Release the client back to the pool
        }
    }
});

// --- Server Start ---
initDatabase().then(() => {
    app.listen(port, () => {
        console.log(`Resume Matcher Backend listening at http://localhost:${port}`);
        console.log('\n--- Setup Instructions ---');
        console.log('1. Ensure PostgreSQL server is running.');
        console.log('2. Create a database (e.g., `resume_matcher_db`) in PostgreSQL.');
        console.log('3. Open this `server.js` file and CONFIGURE your PostgreSQL connection details.');
        console.log('4. In your terminal, navigate to this backend folder.');
        console.log('5. Install Node.js dependencies: `npm install express multer cors pg pdf-parse mammoth natural`');
        console.log('6. Run the server: `node server.js`');
        console.log('Ensure your React frontend is configured to call this backend (e.g., fetch to http://localhost:5000/api/match).');
    });
}).catch(err => {
    console.error('Failed to start server due to database initialization error:', err);
});
