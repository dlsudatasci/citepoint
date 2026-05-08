// Import config
importScripts('config.js');

// Initialize Firestore URL
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${config.firebase.projectId}/databases/(default)/documents`;

// Helper function to make authenticated requests to Firestore
async function firestoreRequest(collection, docId = null, method = 'GET', data = null) {
    let url = `${FIRESTORE_URL}/${collection}`;
    if (docId) {
        url += `/${docId}`;
    }
    url += `?key=${config.firebase.apiKey}`;

    console.log('Making Firestore request:', { url, method, data });

    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        }
    };

    if (data) {
        // Convert data to Firestore format
        const firestoreData = {
            fields: Object.entries(data).reduce((acc, [key, value]) => {
                let fieldValue;
                if (typeof value === 'string') {
                    // Special handling for ISO date strings
                    if (key === 'dateAdded' || key === 'timestamp') {
                        fieldValue = { timestampValue: value };
                    } else {
                        fieldValue = { stringValue: value };
                    }
                } else if (typeof value === 'number') {
                    fieldValue = { integerValue: value };
                } else if (typeof value === 'boolean') {
                    fieldValue = { booleanValue: value };
                } else if (value instanceof Date) {
                    fieldValue = { timestampValue: value.toISOString() };
                } else if (value === null || value === undefined) {
                    fieldValue = { nullValue: null };
                } else {
                    fieldValue = { stringValue: String(value) };
                }
                acc[key] = fieldValue;
                return acc;
            }, {})
        };

        // For PATCH requests, add updateMask to specify which fields to update
        if (method === 'PATCH') {
            url += '&updateMask.fieldPaths=' + Object.keys(data).join('&updateMask.fieldPaths=');
        }

        options.body = JSON.stringify(firestoreData);
        console.log('Request body:', options.body);
    }

    try {
        const response = await fetch(url, options);
        const responseText = await response.text();
        
        if (!response.ok) {
            console.error('Firestore request failed:', {
                status: response.status,
                statusText: response.statusText,
                response: responseText
            });
            throw new Error(`Firestore request failed: ${responseText}`);
        }

        // Parse the response text as JSON
        const responseData = responseText ? JSON.parse(responseText) : {};
        console.log('Firestore response:', responseData);
        return responseData;
    } catch (error) {
        console.error('Error in firestoreRequest:', error);
        throw error;
    }
}

// Helper function to convert Firestore response to regular object
function convertFromFirestore(firestoreDoc) {
    if (!firestoreDoc || !firestoreDoc.fields) return null;
    
    return Object.entries(firestoreDoc.fields).reduce((acc, [key, value]) => {
        // Handle different Firestore field types
        try {
            if (value.timestampValue) {
                // Parse and validate the timestamp
                const date = new Date(value.timestampValue);
                if (isNaN(date.getTime())) {
                    console.error('Invalid timestamp value:', { key, value: value.timestampValue });
                    acc[key] = new Date().toISOString();
                } else {
                    acc[key] = date.toISOString();
                }
            } else if (value.stringValue !== undefined) {
                acc[key] = value.stringValue;
            } else if (value.integerValue !== undefined) {
                acc[key] = parseInt(value.integerValue);
            } else if (value.doubleValue !== undefined) {
                acc[key] = value.doubleValue;
            } else if (value.booleanValue !== undefined) {
                acc[key] = value.booleanValue;
            } else {
                console.warn('Unknown field type:', { key, value });
                // For unknown types, try to extract the first value
                const fieldValue = Object.values(value)[0];
                if (fieldValue !== undefined) {
                    acc[key] = fieldValue;
                }
            }
        } catch (error) {
            console.error('Error converting field:', { key, value, error });
            // Provide sensible defaults for errors
            if (key === 'dateAdded') {
                acc[key] = new Date().toISOString();
            } else if (key === 'voteScore') {
                acc[key] = 0;
            } else {
                acc[key] = '';
            }
        }
        return acc;
    }, {});
}

// Helper function to migrate old data format to new
async function migrateCitationData(videoId, docId, oldData) {
    try {
        // Create new data object with citationTitle instead of source
        const newData = {
            ...oldData,
            citationTitle: oldData.source,
        };
        delete newData.source;  // Remove old field

        // Update the document with new format
        await firestoreRequest(`citations_${videoId}`, docId, 'PATCH', newData);
        console.log('Successfully migrated citation:', docId);
        return true;
    } catch (error) {
        console.error('Error migrating citation:', error);
        return false;
    }
}

// Migrate all citations in a collection from source to citationTitle
async function migrateAllCitations(videoId) {
    try {
        console.log('Starting bulk migration for video:', videoId);
        const result = await firestoreRequest(`citations_${videoId}`);
        
        if (!result.documents) {
            console.log('No documents to migrate');
            return { success: true, migratedCount: 0 };
        }

        let migratedCount = 0;
        for (const doc of result.documents) {
            const data = convertFromFirestore(doc);
            const docId = doc.name.split('/').pop();
            
            if (data.source && !data.citationTitle) {
                const newData = {
                    ...data,
                    citationTitle: data.source
                };
                delete newData.source;

                await firestoreRequest(`citations_${videoId}`, docId, 'PATCH', newData);
                migratedCount++;
            }
        }
        
        console.log(`Migration complete. Migrated ${migratedCount} documents`);
        return { success: true, migratedCount };
    } catch (error) {
        console.error('Error during bulk migration:', error);
        return { success: false, error: error.message };
    }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message:', request);
    if (request.type === 'addCitation') {
        handleAddCitation(request.data).then(sendResponse);
        return true;
    }
    if (request.type === 'getCitations') {
        handleGetCitations(request.videoId).then(sendResponse);
        return true;
    }
    if (request.type === 'addRequest') {
        handleAddRequest(request.data).then(sendResponse);
        return true;
    }
    if (request.type === 'getCitationRequests') {
        handleGetRequests(request.videoId).then(sendResponse);
        return true;
    }
    if (request.type === 'updateVotes') {
        if (!request.videoId) {
            sendResponse({ success: false, error: 'Video ID is required' });
            return true;
        }
        if (request.itemType === 'citation') {
            handleUpdateCitationVotes(request.videoId, request.itemId, request.voteType).then(sendResponse);
        } else {
            handleUpdateRequestVotes(request.videoId, request.itemId, request.voteType).then(sendResponse);
        }
        return true;
    }
    if (request.type === 'getUserVotes') {
        handleGetUserVotes(request.videoId, request.itemType).then(sendResponse);
        return true;
    }
    if (request.type === 'migrateAllCitations') {
        migrateAllCitations(request.videoId).then(sendResponse);
        return true;
    }
    if (request.type === 'deleteCitation') {
        handleDeleteCitation(request.citationId, request.videoId)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Will respond asynchronously
    }
    if (request.type === 'reportItem') {
        handleReportItem(request.data)
            .then(response => sendResponse(response))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep the message channel open for async response
    }
});

async function handleAddCitation(data) {
    try {
        console.log('Adding citation:', data);
        // Ensure source is properly handled
        const citation = {
            ...data,
            source: data.source || null, // Ensure source is explicitly set
            timestamp: new Date().toISOString(),
            voteScore: 0
        };
        
        console.log('Processed citation data:', citation); // Debug log
        
        const result = await firestoreRequest(`citations_${data.videoId}`, null, 'POST', citation);
        const docId = result.name.split('/').pop();
        console.log('Citation added successfully:', docId);
        return { success: true, id: docId };
    } catch (error) {
        console.error('Error adding citation:', error);
        return { success: false, error: error.message };
    }
}

async function handleGetCitations(videoId) {
    try {
        console.log('Getting citations for video:', videoId);
        // List all documents in the video's citations collection
        const result = await firestoreRequest(`citations_${videoId}`);
        
        // Convert Firestore documents to regular objects and handle migration
        const citations = result.documents ? await Promise.all(result.documents.map(async doc => {
            const data = convertFromFirestore(doc);
            const docId = doc.name.split('/').pop();
            
            // Check if document needs migration (has 'source' instead of 'citationTitle')
            if (data.source && !data.citationTitle) {
                await migrateCitationData(videoId, docId, data);
                // Update local data to use new field name
                data.citationTitle = data.source;
                delete data.source;
            }

            return {
                id: docId,
                ...data
            };
        })) : [];

        // Sort by timestamp descending
        citations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        console.log('Found citations:', citations.length);
        return { success: true, citations };
    } catch (error) {
        console.error('Error getting citations:', error);
        return { success: false, error: error.message };
    }
}

async function handleAddRequest(data) {
    try {
        console.log('Adding request:', data);
        const request = {
            ...data,
            voteScore: 0 // Initialize vote score
        };
        
        const result = await firestoreRequest(`requests_${data.videoId}`, null, 'POST', request);
        const docId = result.name.split('/').pop();
        console.log('Request added successfully:', docId);
        return { success: true, id: docId };
    } catch (error) {
        console.error('Error adding request:', error);
        return { success: false, error: error.message };
    }
}

async function handleGetRequests(videoId) {
    try {
        console.log('Getting requests for video:', videoId);
        // List all documents in the video's requests collection
        const result = await firestoreRequest(`requests_${videoId}`);
        console.log('Raw Firestore response:', JSON.stringify(result, null, 2));
        
        // Convert Firestore documents to regular objects
        const requests = result.documents ? result.documents.map(doc => {
            console.log('Processing doc:', JSON.stringify(doc, null, 2));
            const data = convertFromFirestore(doc);
            console.log('Converted data:', JSON.stringify(data, null, 2));
            
            // Ensure dateAdded is valid
            if (!data.dateAdded) {
                console.warn('Request missing dateAdded, adding current time:', doc.name);
                data.dateAdded = new Date().toISOString();
            } else {
                try {
                    const date = new Date(data.dateAdded);
                    if (isNaN(date.getTime())) {
                        console.warn('Invalid dateAdded value, resetting:', data.dateAdded);
                        data.dateAdded = new Date().toISOString();
                    }
                } catch (error) {
                    console.error('Error parsing dateAdded:', error);
                    data.dateAdded = new Date().toISOString();
                }
            }

            return {
                id: doc.name.split('/').pop(),
                ...data,
                voteScore: data.voteScore || 0 // Ensure voteScore exists
            };
        }) : [];

        // Sort by dateAdded descending, with error handling
        requests.sort((a, b) => {
            try {
                return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime();
            } catch (error) {
                console.error('Error sorting by dateAdded:', error);
                return 0;
            }
        });

        console.log('Processed and sorted requests:', JSON.stringify(requests, null, 2));
        return { success: true, requests };
    } catch (error) {
        console.error('Error getting requests:', error);
        return { success: false, error: error.message };
    }
}

async function handleUpdateCitationVotes(videoId, citationId, voteType) {
    try {
        if (!videoId) {
            throw new Error('Video ID is required');
        }

        // Get current citation data
        const citation = await firestoreRequest(`citations_${videoId}`, citationId);
        if (!citation) {
            throw new Error('Citation not found');
        }

        // Get current user votes
        const userVotes = await new Promise(resolve => {
            chrome.storage.local.get(`citation_votes_${videoId}`, result => {
                resolve(result[`citation_votes_${videoId}`] || {});
            });
        });

        // Calculate new vote score
        const currentVote = userVotes[citationId];
        const currentCitation = convertFromFirestore(citation);
        let voteScore = currentCitation.voteScore || 0;

        if (voteType === currentVote) {
            // Remove vote
            voteScore += (voteType === 'up' ? -1 : 1);
            delete userVotes[citationId];
        } else {
            // Add/change vote
            if (currentVote) {
                // Remove previous vote
                voteScore += (currentVote === 'up' ? -1 : 1);
            }
            // Add new vote
            voteScore += (voteType === 'up' ? 1 : -1);
            userVotes[citationId] = voteType;
        }

        // Update citation in Firestore - only update the voteScore field
        await firestoreRequest(`citations_${videoId}`, citationId, 'PATCH', { 
            ...currentCitation,
            voteScore 
        });

        // Save updated votes to local storage
        await new Promise(resolve => {
            chrome.storage.local.set({ [`citation_votes_${videoId}`]: userVotes }, resolve);
        });

        return { success: true, newScore: voteScore, newVote: userVotes[citationId] || null };
    } catch (error) {
        console.error('Error updating citation vote:', error);
        return { success: false, error: error.message };
    }
}

async function handleGetUserVotes(videoId, itemType = 'citation') {
    try {
        console.log(`Getting ${itemType} votes for video:`, videoId);
        // Get votes from local storage
        const votes = await new Promise(resolve => {
            chrome.storage.local.get(`${itemType}_votes_${videoId}`, result => {
                resolve(result[`${itemType}_votes_${videoId}`] || {});
            });
        });
        return { success: true, votes };
    } catch (error) {
        console.error(`Error getting ${itemType} votes:`, error);
        return { success: false, error: error.message };
    }
}

async function handleUpdateRequestVotes(videoId, requestId, voteType) {
    try {
        if (!videoId) {
            throw new Error('Video ID is required');
        }

        // Get the request document
        const request = await firestoreRequest(`requests_${videoId}`, requestId);
        if (!request) {
            throw new Error('Request not found');
        }

        // Get current user votes
        const userVotes = await new Promise(resolve => {
            chrome.storage.local.get(`request_votes_${videoId}`, result => {
                resolve(result[`request_votes_${videoId}`] || {});
            });
        });

        // Calculate new vote score
        const currentVote = userVotes[requestId];
        const currentRequest = convertFromFirestore(request);
        let voteScore = currentRequest.voteScore || 0;

        if (voteType === currentVote) {
            // Remove vote
            voteScore += (voteType === 'up' ? -1 : 1);
            delete userVotes[requestId];
        } else {
            // Add/change vote
            if (currentVote) {
                // Remove previous vote
                voteScore += (currentVote === 'up' ? -1 : 1);
            }
            // Add new vote
            voteScore += (voteType === 'up' ? 1 : -1);
            userVotes[requestId] = voteType;
        }

        // Update request in Firestore - preserve all fields and update voteScore
        await firestoreRequest(`requests_${videoId}`, requestId, 'PATCH', {
            ...currentRequest,
            voteScore
        });

        // Save updated votes to local storage
        await new Promise(resolve => {
            chrome.storage.local.set({ [`request_votes_${videoId}`]: userVotes }, resolve);
        });

        return { success: true, newScore: voteScore, newVote: userVotes[requestId] || null };
    } catch (error) {
        console.error('Error updating request vote:', error);
        return { success: false, error: error.message };
    }
}

// Function to handle citation deletion
async function handleDeleteCitation(citationId, videoId) {
    try {
        console.log('Deleting citation:', citationId, 'from video:', videoId);
        
        // Delete the citation document directly
        await firestoreRequest(`citations_${videoId}`, citationId, 'DELETE');
        
        console.log('Citation deleted successfully');
        return { success: true };
    } catch (error) {
        console.error('Error deleting citation:', error);
        throw error;
    }
}

// Function to handle report submission
async function handleReportItem(data) {
    console.log('Handling report:', data);
    
    // Validate required fields
    if (!data.videoId || !data.itemId || !data.itemType || !data.reason) {
        throw new Error('Missing required fields for report');
    }
    
    try {
        // Create report object
        const report = {
            videoId: data.videoId,
            itemId: data.itemId,
            itemType: data.itemType,
            reason: data.reason,
            additionalInfo: data.additionalInfo || '',
            timestamp: new Date().toISOString(),
            status: 'pending' // Initial status
        };
        
        // Add report to Firestore in the reports collection
        // Note: We need to use the full collection path and ensure proper document creation
        const collectionPath = `reports_${data.videoId}`;
        console.log('Submitting report to collection:', collectionPath);
        
        const response = await firestoreRequest(collectionPath, null, 'POST', report);
        
        if (response.error) {
            console.error('Firestore error:', response.error);
            throw new Error(response.error);
        }
        
        // Log the full response for debugging
        console.log('Full Firestore response:', response);
        
        // Extract the document ID from the response
        const docId = response.name ? response.name.split('/').pop() : null;
        console.log('Created report with ID:', docId);
        
        return { success: true, reportId: docId };
    } catch (error) {
        console.error('Error submitting report:', error);
        throw error;
    }
}
