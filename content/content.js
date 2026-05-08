// Wait for YouTube page to be ready
window.respondWithCitation = function(start, end, reason, title = '') {
    // Switch to citations tab first
    document.getElementById('citations-btn').click();
    
    // Show the add citation form by clicking the add button
    const addItemBtn = document.getElementById('add-item-btn');
    if (addItemBtn && document.getElementById('add-form-container').style.display === 'none') {
        addItemBtn.click();
    }
    
    // Load the citation form and populate it
    loadPage("youtube_extension_citation.html", "add-form-container", () => {
        const form = document.getElementById('citation-form');
        if (form) {
            // Set a flag on the form to indicate it's a response form
            form.dataset.isResponseForm = 'true';
            
            // Get form field elements
            const titleField = form.querySelector('#citationTitle');
            const startField = form.querySelector('#timestampStart');
            const endField = form.querySelector('#timestampEnd');
            const descriptionField = form.querySelector('#description');
            const sourceField = form.querySelector('#source');

            // Set values if the fields exist
            if (titleField) titleField.value = title;
            if (startField) startField.value = start;
            if (endField) endField.value = end;
            if (descriptionField) {
                // Create a container for the description
                const descriptionContainer = document.createElement('div');
                descriptionContainer.className = 'response-section';
                
                // Create the read-only original request section
                const originalRequestDiv = document.createElement('div');
                originalRequestDiv.className = 'original-request';
                originalRequestDiv.textContent = reason.replace('Response to request:', '').trim(); // Display only the original text
                
                // Create a hidden input to store the full original request string for submission
                const originalRequestHidden = document.createElement('input');
                originalRequestHidden.type = 'hidden';
                originalRequestHidden.id = 'originalRequestHidden';
                originalRequestHidden.value = reason; // Store the full prefixed string
                
                // Create a separator
                const separator = document.createElement('hr');
                separator.style.margin = '15px 0';
                separator.style.border = 'none';
                separator.style.borderTop = '1px solid #ddd';
                
                // Create the editable response section label
                const responseLabel = document.createElement('div');
                responseLabel.className = 'response-label';
                responseLabel.textContent = 'Your response:';
                
                // Replace the original textarea with our new structure
                descriptionField.parentNode.replaceChild(descriptionContainer, descriptionField);
                descriptionContainer.appendChild(originalRequestDiv);
                descriptionContainer.appendChild(originalRequestHidden); // Add hidden field
                descriptionContainer.appendChild(separator);
                descriptionContainer.appendChild(responseLabel);
                descriptionContainer.appendChild(descriptionField);
                
                // Reset the textarea value and make it editable with normal style
                descriptionField.value = '';
                descriptionField.placeholder = 'Enter your response to the citation request...';
                descriptionField.style.fontStyle = 'normal';
                descriptionField.required = true; // Make the description field required for responses

                // NO submit listener here. The main submit listener in setupFormListeners will handle it.
            }
            if (sourceField) sourceField.value = '';

            // Focus on the response textarea
            descriptionField?.focus();

            initializeCitationForm();
        }
    });
};

function waitForDependencies() {
    console.log('Waiting for YouTube page dependencies...');
    const checkPage = setInterval(() => {
        const titleContainer = document.querySelector("ytd-watch-metadata");
        const videoElement = document.querySelector("video");
        if (titleContainer && videoElement) {
            clearInterval(checkPage);
            player = videoElement;
            console.log('Dependencies found, initializing extension features...');
            setupTimeTracking();
            setupVideoChangeTracking();
            init();
            
            // Add a slight delay before setting up record buttons to ensure player controls are ready
            setTimeout(() => {
                console.log('Setting up record functionality...');
                setupRecordButtons();
                console.log('YouTube page ready, extension fully initialized');
            }, 1000);
        }
    }, 100);
    
    // Clear interval after 30 seconds to prevent infinite checking
    setTimeout(() => {
        clearInterval(checkPage);
    }, 30000);
}

// Function to check if theater mode is active
function isTheaterMode() {
    const player = document.querySelector('ytd-watch-flexy');
    return player && player.hasAttribute('theater');
}

// Callback function for MutationObserver
function mutationCallback(mutationsList) {
    for (const mutation of mutationsList) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'theater') {
            if (isTheaterMode()) {
                console.log('Theater mode activated');

                const playerContainer = document.querySelector('#ytd-player');
                const ccDiv = document.querySelector("#citation-controls");
                
                if (ccDiv) {
                    playerContainer.appendChild(ccDiv);
                    ccDiv.style.position = 'absolute';
                    ccDiv.style.top = '0';
                    ccDiv.style.right = '0';
                    ccDiv.style.zIndex = '999';
                    // Use the stored width
                    ccDiv.style.width = storedSecondaryWidth + 'px';
                    ccDiv.style.backgroundColor = 'white';
                    ccDiv.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
                }
            } else {
                console.log('Theater mode deactivated');
                
                const ccDiv = document.querySelector("#citation-controls");
                const secondaryElement = document.querySelector("div#secondary.style-scope.ytd-watch-flexy");
                
                if (ccDiv && secondaryElement) {
                    ccDiv.removeAttribute('style');
                    // Use the stored width
                    ccDiv.style.width = storedSecondaryWidth + 'px';
                    secondaryElement.insertBefore(ccDiv, secondaryElement.firstChild);
                }
            }
        }
    }
}

function observeTheaterMode() {
    const observer = new MutationObserver(mutationCallback);

    // Start observing the player element for attribute changes
    const playerElement = document.querySelector('ytd-watch-flexy');
    if (playerElement) {
        observer.observe(playerElement, { attributes: true });
    }
}

function insertBelowTitle() {
    // This function is no longer needed as we're removing the controls from below title
    return;
}

// Add a variable to store the width of the secondary element
let storedSecondaryWidth = 0;

function insertCitationButtons() {
    const secondaryElement = document.querySelector("div#secondary.style-scope.ytd-watch-flexy");
    if (!secondaryElement) {
        console.log("Secondary element not found");
        return;
    }
    
    // Store the initial width
    storedSecondaryWidth = secondaryElement.offsetWidth;
    
    const citationControls = document.createElement("div");
    citationControls.id = "citation-controls";
    citationControls.className = "citation-controls";
    
    // Set initial width to match secondary element
    citationControls.style.width = storedSecondaryWidth + 'px';
    
    citationControls.innerHTML = `
        <div class="extension-header">
            <button id="toggle-extension" class="toggle-extension-btn">
                <span class="toggle-icon">▼</span>
            </button>
            <div class="button-container">
                <button id="citation-requests-btn" class="tab-btn">
                    Citation Requests
                    <span class="tab-counter" id="requests-counter">0</span>
                </button>
                <button id="citations-btn" class="tab-btn">
                    Citations
                    <span class="tab-counter" id="citations-counter">0</span>
                </button>
            </div>
        </div>
        <div id="extension-content" class="extension-content">
            <div id="citation-title-container" class="header-container">
                <h3 id="citation-title" class="section-title">Citations</h3>
            </div>
            <div class="header-actions">
                <button id="add-item-btn" class="add-btn">+ Add Citation</button>
                <div class="sort-container">
                    <button class="sort-button">
                        <span class="sort-icon">
                            <svg viewBox="0 0 24 24" width="24" height="24">
                            <path d="M21,6H3V5h18V6z M15,11H3v1h12V11z M9,17H3v1h6V17z" fill="currentColor"></path>
                           </svg>
                        </span>
                        <span class="sort-text">Sort by</span>
                        <span class="sort-caret">
                            <svg viewBox="0 0 24 24" width="24" height="24">
                                <path d="M7 10l5 5 5-5z" fill="currentColor"></path>
                            </svg>
                        </span>
                    </button>
                    <div class="sort-menu" style="display: none;">
                        <button class="sort-menu-item" data-value="upvotes">
                            <span class="sort-menu-text">Most Upvoted</span>
                            <span class="sort-check">✓</span>
                        </button>
                        <button class="sort-menu-item" data-value="recent">
                            <span class="sort-menu-text">Newest first</span>
                        </button>
                    </div>
                </div>
            </div>
            <div class="citations-scroll-container">
                <div id="add-form-container" style="display: none;"></div>
                <div id="citations-container"></div>
                <div id="citation-requests-container"></div>
            </div>
        </div>
    `;
    
    secondaryElement.prepend(citationControls);
    
    // Create a ResizeObserver to update width when secondary element changes
    const resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
            if (entry.target === secondaryElement) {
                // Update the stored width
                storedSecondaryWidth = entry.target.offsetWidth;
                
                const ccDiv = document.querySelector("#citation-controls");
                if (ccDiv) {
                    ccDiv.style.width = storedSecondaryWidth + 'px';
                }
            }
        }
    });
    
    // Start observing the secondary element
    resizeObserver.observe(secondaryElement);

    // Add toggle functionality
    const toggleBtn = document.getElementById('toggle-extension');
    const extensionContent = document.getElementById('extension-content');
    const toggleIcon = toggleBtn.querySelector('.toggle-icon');
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    toggleBtn.addEventListener('click', () => {
        const isCollapsed = extensionContent.style.display === 'none';
        extensionContent.style.display = isCollapsed ? 'block' : 'none';
        toggleIcon.textContent = isCollapsed ? '▼' : '▶';
        
        // Update tab button states
        tabButtons.forEach(btn => {
            btn.style.pointerEvents = isCollapsed ? 'auto' : 'none';
            btn.classList.toggle('disabled', !isCollapsed);
        });
    });

    // Set initial state and load citations
    const citationsBtn = document.getElementById('citations-btn');
    citationsBtn.classList.add('active');
    document.getElementById('citations-container').style.display = 'block';
    document.getElementById('citation-requests-container').style.display = 'none';
    loadCitations();

    // Add event listeners for tab buttons
    document.getElementById('citation-requests-btn').addEventListener('click', function() {
        if (this.classList.contains('disabled')) return;
        
        this.classList.add('active');
        document.getElementById('citations-btn').classList.remove('active');
        document.getElementById('citation-title').textContent = 'Citation Requests';
        document.getElementById('citations-container').style.display = 'none';
        document.getElementById('citation-requests-container').style.display = 'block';
        document.getElementById('add-item-btn').textContent = '+ Add Request';
        // Close form when switching tabs
        document.getElementById('add-form-container').style.display = 'none';
        loadCitationRequests();
    });

    document.getElementById('citations-btn').addEventListener('click', function() {
        if (this.classList.contains('disabled')) return;
        
        this.classList.add('active');
        document.getElementById('citation-requests-btn').classList.remove('active');
        document.getElementById('citation-title').textContent = 'Citations';
        document.getElementById('citations-container').style.display = 'block';
        document.getElementById('citation-requests-container').style.display = 'none';
        document.getElementById('add-item-btn').textContent = '+ Add Citation';
        // Close form when switching tabs
        document.getElementById('add-form-container').style.display = 'none';
        loadCitations();
    });

    // Add event listeners for add button
    document.getElementById('add-item-btn').addEventListener('click', () => {
        const formContainer = document.getElementById('add-form-container');
        const addButton = document.getElementById('add-item-btn');
        const isRequestsTab = document.getElementById('citation-requests-container').style.display === 'block';
        
        if (formContainer.style.display === 'none') {
            formContainer.style.display = 'block';
            addButton.textContent = isRequestsTab ? '- Add Request' : '- Add Citation';
            if (isRequestsTab) {
                loadPage("youtube_extension_request.html", "add-form-container", () => {
                    initializeRequestForm();
                });
            } else {
                loadPage("youtube_extension_citation.html", "add-form-container", () => {
                    initializeCitationForm();
                });
            }
        } else {
            formContainer.style.display = 'none';
            addButton.textContent = isRequestsTab ? '+ Add Request' : '+ Add Citation';
        }
    });

    // Handle sort button click
    const sortButton = document.querySelector('.sort-button');
    const sortMenu = document.querySelector('.sort-menu');
    sortButton.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = sortMenu.style.display === 'block';
        sortMenu.style.display = isVisible ? 'none' : 'block';
        sortButton.classList.toggle('active');
    });

    // Handle sort menu item clicks
    sortMenu.addEventListener('click', (e) => {
        const menuItem = e.target.closest('.sort-menu-item');
        if (menuItem) {
            const value = menuItem.dataset.value;
            currentSortOption = value;
            sortMenu.querySelectorAll('.sort-menu-item').forEach(item => {
                item.innerHTML = `
                    <span class="sort-menu-text">${item.dataset.value === 'upvotes' ? 'Most Upvoted' : 'Newest first'}</span>
                    ${item.dataset.value === value ? '<span class="sort-check">✓</span>' : ''}
                `;
            });
            sortMenu.style.display = 'none';
            sortButton.classList.remove('active');
            const citationsContainer = document.getElementById('citations-container');
            const requestsContainer = document.getElementById('citation-requests-container');
            if (citationsContainer.style.display === 'block') {
                loadCitations();
            } else if (requestsContainer.style.display === 'block') {
                loadCitationRequests();
            }
        }
    });

    // Close sort menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.sort-container')) {
            sortMenu.style.display = 'none';
            sortButton.classList.remove('active');
        }
    });

    // Initialize the record button functionality
    setupRecordButtons();
}

// Setup Record Buttons to toggle recording and capture timestamps
function setupRecordButtons() {
    console.log('Setting up record buttons...');
    
    // Check if buttons already exist
    if (document.querySelector('.record-start-btn')) {
        console.log('Record buttons already exist, skipping setup');
        return;
    }
    
    // Look for player controls - try multiple selectors for better reliability
    const playerControlsSelectors = [
        '.ytp-left-controls',
        '.ytp-chrome-bottom .ytp-left-controls',
        '#movie_player .ytp-chrome-bottom .ytp-left-controls',
        '#movie_player .ytp-left-controls'
    ];
    
    let playerControls = null;
    
    // Try each selector
    for (const selector of playerControlsSelectors) {
        playerControls = document.querySelector(selector);
        if (playerControls) {
            console.log('Found player controls with selector:', selector);
            break;
        }
    }
    
    // If we still couldn't find controls, return early but log it
    if (!playerControls) {
        console.error('Could not find YouTube player controls. Record buttons not added.');
        return;
    }

    // Find the timestamp element - again with fallback selectors
    const timestampSelectors = [
        '.ytp-time-display',
        '.ytp-time-current',
        '.ytp-time-display > span'
    ];
    
    let timestamp = null;
    
    // Try each timestamp selector
    for (const selector of timestampSelectors) {
        timestamp = playerControls.querySelector(selector);
        if (timestamp) {
            console.log('Found timestamp element with selector:', selector);
            break;
        }
    }

    // If we couldn't find the timestamp element, try to find another anchor point
    if (!timestamp) {
        timestamp = playerControls.querySelector('.ytp-volume-panel') || 
                   playerControls.querySelector('button') ||
                   playerControls.firstChild;
                   
        if (!timestamp) {
            console.error('Could not find suitable anchor for record buttons in player controls');
            return;
        }
        console.log('Using fallback anchor for record buttons');
    }

    // Make sure we have access to the video element
    const player = document.querySelector('video');
    if (!player) {
        console.error('Could not find video element. Record buttons not added.');
        return;
    }

    // Create start record button
    const startRecordBtn = document.createElement('button');
    startRecordBtn.className = 'ytp-button record-start-btn';
    startRecordBtn.title = 'Start Citation Segment';
    startRecordBtn.innerHTML = `
        <div class="citation-record-btn">
            <svg height="100%" viewBox="0 0 36 36" width="100%">
                <rect x="8" y="8" width="20" height="20" rx="2" fill="none" stroke="#ff0000" stroke-width="2"/>
                <circle cx="18" cy="18" r="6" fill="#ff0000"/>
            </svg>
        </div>
    `;

    // Create end record button (initially hidden)
    const endRecordBtn = document.createElement('button');
    endRecordBtn.className = 'ytp-button record-end-btn';
    endRecordBtn.title = 'End Citation Segment';
    endRecordBtn.style.display = 'none';
    endRecordBtn.innerHTML = `
        <div class="citation-record-btn">
            <svg height="100%" viewBox="0 0 36 36" width="100%">
                <rect x="8" y="8" width="20" height="20" rx="2" fill="none" stroke="#ff0000" stroke-width="2"/>
                <path d="M 14 14 L 22 22 M 14 22 L 22 14" stroke="#ff0000" stroke-width="2"/>
            </svg>
        </div>
    `;

    // Insert buttons right after the timestamp
    timestamp.insertAdjacentElement('afterend', startRecordBtn);
    timestamp.insertAdjacentElement('afterend', endRecordBtn);
    
    console.log('Record buttons added to player controls');

    let recordStartTime = null;

    startRecordBtn.addEventListener('click', () => {
        console.log('Start record button clicked');
        recordStartTime = player.currentTime;
        startRecordBtn.style.display = 'none';
        endRecordBtn.style.display = '';
        startRecordBtn.classList.add('recording-active');
    });

    endRecordBtn.addEventListener('click', () => {
        console.log('End record button clicked');
        const recordEndTime = player.currentTime;
        startRecordBtn.style.display = '';
        endRecordBtn.style.display = 'none';
        startRecordBtn.classList.remove('recording-active');
        
        if (recordStartTime !== null && recordEndTime > recordStartTime) {
            console.log('Recording completed: start=', recordStartTime, 'end=', recordEndTime);
            addRecordedSegment(recordStartTime, recordEndTime);
        } else {
            console.warn('Invalid recording: start time must be before end time');
        }
        recordStartTime = null;
    });
}

// Function to create and manage recorded segments panel
function setupRecordedSegmentsPanel() {
    // Create panel if it doesn't exist
    let panel = document.querySelector('.recorded-segments-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.className = 'recorded-segments-panel collapsed';
        panel.style.display = 'none'; // Initially hidden
        panel.innerHTML = `
            <button class="toggle-btn">◀</button>
            <div class="panel-content">
                <h3>Citation Segments</h3>
                <div class="segments-container"></div>
            </div>
        `;
        document.body.appendChild(panel);

        // Setup toggle button
        const toggleBtn = panel.querySelector('.toggle-btn');
        toggleBtn.addEventListener('click', () => {
            panel.classList.toggle('collapsed');
            toggleBtn.textContent = panel.classList.contains('collapsed') ? '▶' : '◀';
        });
    }
    return panel;
}

// Function to check if segments container is empty and hide panel if needed
function checkAndHidePanel() {
    const panel = document.querySelector('.recorded-segments-panel');
    const container = panel?.querySelector('.segments-container');
    if (panel && container && container.children.length === 0) {
        panel.style.display = 'none';
    }
}

// Function to add a new recorded segment
function addRecordedSegment(startTime, endTime) {
    console.log('Adding recorded segment:', startTime, endTime);
    
    // Create or get the panel
    const panel = setupRecordedSegmentsPanel();
    
    // Make sure the panel is properly styled
    if (!panel.style.position) {
        panel.style.position = 'fixed';
        panel.style.top = '20%';
        panel.style.right = '0';
        panel.style.zIndex = '2000';
    }
    
    // Make panel visible
    panel.style.display = '';
    
    // Get or create the container
    let container = panel.querySelector('.segments-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'segments-container';
        panel.querySelector('.panel-content').appendChild(container);
    }
    
    // Create segment element
    const segment = document.createElement('div');
    segment.className = 'recorded-segment';
    
    // Format the times
    const formattedStart = formatTime(Math.floor(startTime));
    const formattedEnd = formatTime(Math.floor(endTime));
    
    // Create segment HTML
    segment.innerHTML = `
        <div class="time-range">${formattedStart} - ${formattedEnd}</div>
        <div class="actions">
            <button class="cite-btn">Add Citation</button>
            <button class="request-btn">Add Request</button>
            <button class="delete-btn">Delete</button>
        </div>
    `;

    // Add event listeners for the time range (to seek)
    segment.querySelector('.time-range').addEventListener('click', () => {
        const video = document.querySelector('video');
        if (video) {
            video.currentTime = startTime;
            video.play();
        }
    });

    // Add Citation button
    segment.querySelector('.cite-btn').addEventListener('click', () => {
        // First, make sure the citation tab is selected
        const citationsBtn = document.getElementById('citations-btn');
        if (citationsBtn) {
            citationsBtn.click();
        }
        
        // Then click the add button
        const addItemBtn = document.getElementById('add-item-btn');
        if (addItemBtn) {
            addItemBtn.click();
        }
        
        // Wait for form to load
        setTimeout(() => {
            const form = document.getElementById('citation-form');
            if (form) {
                // Find and populate timestamp fields
                const startField = form.querySelector('#timestampStart');
                const endField = form.querySelector('#timestampEnd');
                
                if (startField) startField.value = formattedStart;
                if (endField) endField.value = formattedEnd;
                
                // Focus on title field
                const titleField = form.querySelector('#citationTitle');
                if (titleField) titleField.focus();
                
                console.log('Citation form loaded with start:', formattedStart, 'and end:', formattedEnd);
                
                // Initialize the form if needed
                if (typeof initializeCitationForm === 'function') {
                    initializeCitationForm();
                }
            } else {
                console.error("Citation form not found!");
            }
        }, 300);
        
        // Collapse panel to show form
        panel.classList.add('collapsed');
        const toggleBtn = panel.querySelector('.toggle-btn');
        if (toggleBtn) toggleBtn.textContent = '▶';
    });

    // Add Request button
    segment.querySelector('.request-btn').addEventListener('click', () => {
        // First, make sure the requests tab is selected
        const requestsBtn = document.getElementById('citation-requests-btn');
        if (requestsBtn) {
            requestsBtn.click();
        }
        
        // Then click the add button
        const addItemBtn = document.getElementById('add-item-btn');
        if (addItemBtn) {
            addItemBtn.click();
        }
        
        // Wait for form to load
        setTimeout(() => {
            const form = document.getElementById('request-form');
            if (form) {
                // Find and populate timestamp fields
                const startField = form.querySelector('#timestampStart');
                const endField = form.querySelector('#timestampEnd');
                
                if (startField) startField.value = formattedStart;
                if (endField) endField.value = formattedEnd;
                
                // Focus on reason field
                const reasonField = form.querySelector('#reason');
                if (reasonField) reasonField.focus();
                
                console.log('Request form loaded with start:', formattedStart, 'and end:', formattedEnd);
                
                // Initialize the form if needed
                if (typeof initializeRequestForm === 'function') {
                    initializeRequestForm();
                }
            } else {
                console.error("Request form not found!");
            }
        }, 300);
        
        // Collapse panel to show form
        panel.classList.add('collapsed');
        const toggleBtn = panel.querySelector('.toggle-btn');
        if (toggleBtn) toggleBtn.textContent = '▶';
    });

    // Delete button
    segment.querySelector('.delete-btn').addEventListener('click', () => {
        segment.remove();
        // Check if container is empty and hide panel if needed
        if (container.children.length === 0) {
            panel.style.display = 'none';
        }
    });

    // Add segment to container
    container.appendChild(segment);
    
    // Make sure panel is expanded
    panel.classList.remove('collapsed');
    const toggleBtn = panel.querySelector('.toggle-btn');
    if (toggleBtn) toggleBtn.textContent = '◀';
    
    console.log('Recorded segment added successfully');
}

// Utility function to format seconds into HH:MM:SS
function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return [hrs, mins, secs]
      .map(v => v < 10 ? "0" + v : v)
      .join(":");
}

// Function to show quick-action buttons for Citation and Request tasks
function showQuickTaskButtons(startTime, endTime) {
    // Create or clear a container for the quick task buttons
    let quickTaskContainer = document.getElementById('quick-task-container');
    if (!quickTaskContainer) {
        quickTaskContainer = document.createElement('div');
        quickTaskContainer.id = 'quick-task-container';
        quickTaskContainer.style.marginTop = '10px';
        // Append the container to the citation controls container
        const citationControls = document.getElementById('citation-controls');
        if (citationControls) {
            citationControls.appendChild(quickTaskContainer);
        } else {
            console.error('Citation controls container not found!');
            return;
        }
    } else {
        quickTaskContainer.innerHTML = '';
    }
    
    // Create the Citation quick task button
    const citationQuickBtn = document.createElement('button');
    citationQuickBtn.textContent = 'Citation';
    citationQuickBtn.className = 'action-btn';
    citationQuickBtn.addEventListener('click', () => {
        // Switch to the Citation tab by simulating a click
        const citationsTab = document.getElementById('citations-btn');
        if (citationsTab) {
            citationsTab.click();
        } else {
            console.error('Citations tab button not found!');
        }
        
        // Ensure the form container is visible
        const formContainer = document.getElementById('add-form-container');
        if (formContainer) {
            formContainer.style.display = 'block';
        } else {
            console.error('Form container not found!');
        }
        
        // Load the citation form and pre-fill the timestamps
        loadPage("youtube_extension_citation.html", "add-form-container", () => {
            const form = document.getElementById('citation-form');
            if (form) {
                form.timestampStart.value = startTime;
                form.timestampEnd.value = endTime;
                form.citationTitle.focus();
                console.log('Citation form loaded with start:', startTime, 'and end:', endTime);
                initializeCitationForm();
            } else {
                console.error("Citation form not found!");
            }
        });
        quickTaskContainer.innerHTML = '';
    });
    
    // Create the Request quick task button
    const requestQuickBtn = document.createElement('button');
    requestQuickBtn.textContent = 'Request';
    requestQuickBtn.className = 'action-btn';
    requestQuickBtn.addEventListener('click', () => {
        // Switch to the Citation Requests tab by simulating a click
        const requestsTab = document.getElementById('citation-requests-btn');
        if (requestsTab) {
            requestsTab.click();
        } else {
            console.error('Citation Requests tab button not found!');
        }
        
        // Ensure the form container is visible
        const formContainer = document.getElementById('add-form-container');
        if (formContainer) {
            formContainer.style.display = 'block';
        } else {
            console.error('Form container not found!');
        }
        
        // Load the request form and pre-fill the timestamps
        loadPage("youtube_extension_request.html", "add-form-container", () => {
            const form = document.getElementById('request-form');
            if (form) {
                form.timestampStart.value = startTime;
                form.timestampEnd.value = endTime;
                form.reason.focus();
                console.log('Request form loaded with start:', startTime, 'and end:', endTime);
            } else {
                console.error("Request form not found!");
            }
        });
        quickTaskContainer.innerHTML = '';
    });
    
    // Append both buttons to the quick task container
    quickTaskContainer.appendChild(citationQuickBtn);
    quickTaskContainer.appendChild(requestQuickBtn);
}

function init() {
    console.log('Initializing extension...');
    
    // Clear any existing controls first to prevent duplicates
    const existingControls = document.getElementById('citation-controls');
    if (existingControls) {
        console.log('Removing existing citation controls');
        existingControls.remove();
    }
    
    insertCitationButtons();
    observeTheaterMode();
    
    // Initialize forms if they exist
    const citationForm = document.getElementById('citation-form');
    if (citationForm) {
        initializeCitationForm();
    }
    const requestForm = document.getElementById('request-form');
    if (requestForm) {
        initializeRequestForm();
    }
    
    // Ensure recorded segments panel exists
    setupRecordedSegmentsPanel();
}

// Function to initialize citation form
async function initializeCitationForm() {
    console.log('Initializing citation form...');
    
    // Re-check if the form exists after async operation
    const form = document.getElementById('citation-form');
    if (form) {
        console.log('Setting up citation form listeners');
        setupFormListeners();
    } else {
        console.log('Citation form not found after initialization');
    }
}

// Function to initialize request form
async function initializeRequestForm() {
    console.log('Initializing request form...');
    // Removed anonymous checkbox from request form
    // await setupAnonymousCheckbox();
    
    // Re-check if the form exists after async operation
    const form = document.getElementById('request-form');
    if (form) {
        console.log('Setting up request form listeners');
        
        // Remove the anonymous checkbox if it exists
        const anonymousGroup = form.querySelector('#anonymous-group');
        if (anonymousGroup) {
            anonymousGroup.style.display = 'none';
        }
        
        setupFormListeners();
    } else {
        console.log('Request form not found after initialization');
    }
}

// Function to get YouTube username
async function getYouTubeUsername() {
    try {
        // Try to get the handle from ytd-topbar-menu-button-renderer which contains account info
        const accountInfo = document.querySelector('ytd-topbar-menu-button-renderer');
        if (!accountInfo) {
            console.log('Account info element not found - user likely not logged in');
            return null;
        }

        // Access YouTube's internal API through the element
        if (accountInfo.__data && accountInfo.__data.data) {
            const accountData = accountInfo.__data.data;
            if (accountData.channelHandle) {
                console.log('Found user handle from YouTube API:', accountData.channelHandle);
                return accountData.channelHandle.startsWith('@') ? 
                    accountData.channelHandle : 
                    `@${accountData.channelHandle}`;
            }
        }

        // Method 2: Try to get from the page without opening menu
        const possibleElements = [
            document.querySelector('ytd-guide-entry-renderer[line-end-style="handle"] #guide-entry-title'),
            document.querySelector('yt-formatted-string#channel-handle'),
            document.querySelector('[id="channel-handle"]')
        ];

        for (const element of possibleElements) {
            if (element && element.textContent) {
                const handle = element.textContent.trim();
                if (handle.startsWith('@')) {
                    console.log('Found user handle from page:', handle);
                    return handle;
                }
            }
        }

        // Method 3 (Last Resort): Quick menu open/close
        console.log('Attempting quick menu open to get handle...');
        const avatarButton = document.querySelector('ytd-masthead button#avatar-btn');
        if (!avatarButton) return null;

        let foundHandle = null;
        
        try {
            // Create a promise that will resolve when we find the handle
            const handlePromise = new Promise((resolve) => {
                let timeoutId;
                
                const observer = new MutationObserver((mutations, obs) => {
                    const menuHandle = document.querySelector('ytd-active-account-header-renderer yt-formatted-string#channel-handle');
                    if (menuHandle && menuHandle.textContent) {
                        const handle = menuHandle.textContent.trim();
                        if (handle.startsWith('@')) {
                            clearTimeout(timeoutId);
                            obs.disconnect();
                            resolve(handle);
                        }
                    }
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: false,
                    characterData: false
                });

                // Set a longer timeout to give more time for the menu to open
                timeoutId = setTimeout(() => {
                    observer.disconnect();
                    resolve(null);
                }, 1000); // Increased to 1000ms

                // Click to open and ensure the click event is properly triggered
                avatarButton.click();
                // Double-check if menu opened
                setTimeout(() => {
                    const menu = document.querySelector('ytd-popup-container tp-yt-iron-dropdown[focused]');
                    if (!menu) {
                        console.log('Menu did not open, trying click again');
                        avatarButton.click();
                    }
                }, 100);
            });

            foundHandle = await handlePromise;
        } finally {
            // Always ensure menu is closed, even if there was an error
            const isMenuOpen = document.querySelector('ytd-popup-container tp-yt-iron-dropdown[focused]');
            if (isMenuOpen) {
                const closeButton = document.querySelector('ytd-masthead button#avatar-btn');
                if (closeButton) {
                    closeButton.click();
                }
            }
        }

        if (foundHandle) {
            console.log('Found user handle from quick menu open:', foundHandle);
            return foundHandle;
        }

        console.log('Could not find user handle');
        return null;
    } catch (error) {
        console.error('Error getting YouTube username:', error);
        return null;
    }
}

// Function to setup the anonymous checkbox visibility
async function setupAnonymousCheckbox() {
    const anonymousGroup = document.getElementById('anonymous-group');
    if (!anonymousGroup) {
        console.log('Anonymous checkbox group not found');
        return;
    }

    const username = await getYouTubeUsername();
    console.log('Username detection result:', username);
    
    if (username) {
        console.log('Showing anonymous checkbox for logged-in user');
        anonymousGroup.style.display = 'block';
    } else {
        console.log('Hiding anonymous checkbox for anonymous user');
        anonymousGroup.style.display = 'none';
    }
}

// Start initialization
waitForDependencies();

function loadPage(url, containerId, callback = null) {
    fetch(chrome.runtime.getURL(url))
        .then(response => response.text())
        .then(html => {
            const container = document.getElementById(containerId);
            container.innerHTML = html;
            
            // Apply additional styling to form elements
            const forms = container.querySelectorAll('form');
            forms.forEach(form => {
                form.style.maxWidth = '100%';
                
                // Style input and textarea elements
                const inputs = form.querySelectorAll('input, textarea');
                inputs.forEach(input => {
                    if (input.type !== 'checkbox') {
                        input.classList.add('form-input');
                    }
                });
                
                const textareas = form.querySelectorAll('textarea');
                textareas.forEach(textarea => {
                    textarea.classList.add('form-textarea');
                });
                
                // Style form buttons
                const submitBtn = form.querySelector('button[type="submit"]');
                if (submitBtn) {
                    submitBtn.classList.add('submit-btn');
                }
                
                const cancelBtn = form.querySelector('button.cancel-btn');
                if (cancelBtn) {
                    cancelBtn.classList.add('cancel-btn');
                }
            });
            
            setupFormListeners();
            if (callback) callback();
        })
        .catch(error => console.error("Error loading form:", error));
}

async function setupFormListeners() {
    const form = document.getElementById('citation-form');
    const requestForm = document.getElementById('request-form');

    if (form && !form.dataset.listener) {
        form.dataset.listener = "true";
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const videoId = new URLSearchParams(window.location.search).get('v');
            
            try {
                // Get video duration
                const videoDuration = Math.floor(player.duration);
                if (!videoDuration) {
                    throw new Error('Could not determine video duration. Please try again.');
                }

                // Get YouTube username - require login
                const username = await getYouTubeUsername();
                if (!username) {
                    throw new Error('You must be logged in to submit a citation. Please log in to your YouTube account.');
                }

                // Validate timestamps
                const startTime = form.timestampStart.value;
                const endTime = form.timestampEnd.value;
                const { startSeconds, endSeconds } = validateTimestamps(startTime, endTime, videoDuration);
                
                let citationDescriptionValue = '';

                if (form.dataset.isResponseForm === 'true') {
                    // This is a response to a citation request
                    const originalRequestHidden = document.getElementById('originalRequestHidden');
                    const originalRequestText = originalRequestHidden ? originalRequestHidden.value : '';
                    const userActualResponse = form.description.value.trim();
                    
                    // Combine the original request with the user's actual response
                    // The originalRequestText already includes the "Response to request:" prefix
                    citationDescriptionValue = `${originalRequestText}\n\n${userActualResponse}`;
                } else {
                    // This is a normal citation submission
                    citationDescriptionValue = form.description.value.trim();
                }

                const citationData = {
                    videoId,
                    citationTitle: form.citationTitle.value.trim(),
                    timestampStart: startTime,
                    timestampEnd: endTime,
                    description: citationDescriptionValue, // Use the determined description value
                    source: form.source.value.trim(),
                    username: username,
                    dateAdded: new Date().toISOString()
                };

                const response = await chrome.runtime.sendMessage({
                    type: 'addCitation',
                    data: citationData
                });

                if (response.success) {
                    alert('Citation added successfully!');
                    form.reset();
                    document.getElementById('add-form-container').style.display = 'none';
                    // Update the add button text
                    const addButton = document.getElementById('add-item-btn');
                    addButton.textContent = '+ Add Citation';
                    loadCitations();
                } else {
                    throw new Error(response.error);
                }
            } catch (error) {
                console.error("Error adding citation:", error);
                alert(error.message || 'Error adding citation. Please try again.');
            }
        });
    }

    if (requestForm && !requestForm.dataset.listener) {
        requestForm.dataset.listener = "true";
        requestForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const videoId = new URLSearchParams(window.location.search).get('v');
            
            try {
                // Get video duration
                const videoDuration = Math.floor(player.duration);
                if (!videoDuration) {
                    throw new Error('Could not determine video duration. Please try again.');
                }

                // Get YouTube username
                const username = await getYouTubeUsername();
                if (!username) {
                    throw new Error('Could not retrieve YouTube username. Please make sure you are logged in.');
                } 
                // Validate timestamps
                const startTime = requestForm.timestampStart.value;
                const endTime = requestForm.timestampEnd.value;
                const { startSeconds, endSeconds } = validateTimestamps(startTime, endTime, videoDuration);
                
                const requestData = {
                    videoId,
                    title: requestForm.title.value.trim(),
                    timestampStart: startTime,
                    timestampEnd: endTime,
                    reason: requestForm.reason.value.trim(),
                    username: username, // Always set to Anonymous for requests
                    dateAdded: new Date().toISOString(),
                    voteScore: 0
                };

                const response = await chrome.runtime.sendMessage({
                    type: 'addRequest',
                    data: requestData
                });

                if (response.success) {
                    alert('Citation request submitted successfully!');
                    requestForm.reset();
                    document.getElementById('add-form-container').style.display = 'none';
                    // Update the add button text
                    const addButton = document.getElementById('add-item-btn');
                    addButton.textContent = '+ Add Request';
                    loadCitationRequests();
                } else {
                    throw new Error(response.error);
                }
            } catch (error) {
                console.error("Error submitting citation request:", error);
                alert(error.message || 'Error submitting request. Please try again.');
            }
        });
    }
}

// Function to validate timestamps
function validateTimestamps(startTime, endTime, videoDuration) {
    const timestampRegex = /^([0-5][0-9]):([0-5][0-9]):([0-5][0-9])$/;
    
    // Check format
    if (!timestampRegex.test(startTime) || !timestampRegex.test(endTime)) {
        throw new Error('Please enter timestamps in the format HH:MM:SS (e.g., 00:15:30)');
    }

    // Convert timestamps to seconds
    const startSeconds = startTime.split(':').reduce((acc, time) => (60 * acc) + +time, 0);
    const endSeconds = endTime.split(':').reduce((acc, time) => (60 * acc) + +time, 0);
    
    // Check if start is before end
    if (startSeconds >= endSeconds) {
        throw new Error('Start timestamp must be less than end timestamp');
    }

    // Check if end timestamp exceeds video duration
    if (endSeconds > videoDuration) {
        const durationFormatted = formatTime(Math.floor(videoDuration));
        throw new Error(`End timestamp cannot exceed video duration (${durationFormatted})`);
    }

    return { startSeconds, endSeconds };
}

// Handle voting on requests
async function handleRequestVote(requestId, voteType) {
    const videoId = new URLSearchParams(window.location.search).get('v');
    const voteControls = document.querySelector(`.vote-controls[data-request-id="${requestId}"]`);
    const voteScoreElement = voteControls.querySelector('.vote-score');
    const upvoteBtn = voteControls.querySelector('.upvote-btn');
    const downvoteBtn = voteControls.querySelector('.downvote-btn');

    // Get current vote score
    let voteScore = parseInt(voteScoreElement.textContent);

    // Get previous vote
    const storageKey = `request_votes_${videoId}`;
    const userVotes = await new Promise(resolve => {
        chrome.storage.local.get(storageKey, (result) => {
            resolve(result[storageKey] || {});
        });
    });
    const previousVote = userVotes[requestId];

    // Update score and UI based on the vote
    if (voteType === 'up') {
        if (previousVote === 'up') {
            // Remove upvote
            voteScore--;
            upvoteBtn.classList.remove('active');
            upvoteBtn.title = 'Upvote';
            userVotes[requestId] = null;
        } else {
            // Upvote
            voteScore++;
            if (previousVote === 'down') {
                // Remove previous downvote
                voteScore++;
            }
            upvoteBtn.classList.add('active');
            downvoteBtn.classList.remove('active');
            upvoteBtn.title = 'Remove upvote';
            downvoteBtn.title = 'Downvote';
            userVotes[requestId] = 'up';
        }
    } else {
        if (previousVote === 'down') {
            // Remove downvote
            voteScore++;
            downvoteBtn.classList.remove('active');
            downvoteBtn.title = 'Downvote';
            userVotes[requestId] = null;
        } else {
            // Downvote
            voteScore--;
            if (previousVote === 'up') {
                // Remove previous upvote
                voteScore--;
            }
            downvoteBtn.classList.add('active');
            upvoteBtn.classList.remove('active');
            downvoteBtn.title = 'Downvote';
            upvoteBtn.title = 'Upvote';
            userVotes[requestId] = 'down';
        }
    }

    // Update the displayed score
    voteScoreElement.textContent = voteScore;

    try {
        // Send update to background script
        const response = await chrome.runtime.sendMessage({
            type: 'updateRequestVotes',
            videoId,
            requestId,
            voteValue: voteScore,
            userVote: userVotes[requestId]
        });

        if (!response.success) {
            throw new Error(response.error);
        }
    } catch (error) {
        console.error('Error updating votes:', error);
        // Revert UI changes on error
        loadCitationRequests();
    }
}

async function loadCitations() {
    const container = document.getElementById("citations-container");
    if (!container) {
        console.log("Citations container not found");
        return;
    }

    const videoId = new URLSearchParams(window.location.search).get('v');
    console.log("Loading citations for video:", videoId);

    try {
        // Get citations and user votes in parallel
        const [citationsResponse, votesResponse] = await Promise.all([
            chrome.runtime.sendMessage({
                type: 'getCitations',
                videoId: videoId
            }),
            chrome.runtime.sendMessage({
                type: 'getUserVotes',
                videoId: videoId
            })
        ]);

        if (!citationsResponse.success) {
            throw new Error(citationsResponse.error);
        }

        const citations = citationsResponse.citations || [];
        userVotes = votesResponse.success ? votesResponse.votes : {};
        
        // Sort the citations before updating the DOM
        const sortedCitations = sortItems(citations, currentSortOption, 'citation');
        
        // Only update DOM if container is visible and data has changed
        if (container.style.display !== 'none' && JSON.stringify(sortedCitations) !== JSON.stringify(currentCitations)) {
            currentCitations = sortedCitations;

            // Create a temporary container for the new content
            const tempContainer = document.createElement('div');
            tempContainer.style.display = 'none';
            document.body.appendChild(tempContainer);

            // Create the new content in the temporary container
            if (sortedCitations.length === 0) {
                const noCitations = document.createElement('p');
                noCitations.textContent = 'No citations found for this video.';
                tempContainer.appendChild(noCitations);
            } else {
                sortedCitations.forEach(citation => {
                    const citationElement = createCitationElement(citation, userVotes[citation.id] || null);
                    tempContainer.appendChild(citationElement);
                });
            }

            // Update highlighting in the temporary container
            const currentTime = player?.currentTime || 0;
            const highlighted = [];
            const normal = [];

            tempContainer.querySelectorAll('.citation-item').forEach(item => {
                const start = parseFloat(item.dataset.start);
                const end = parseFloat(item.dataset.end);
                const isHighlighted = currentTime >= start && currentTime <= end;
                
                if (isHighlighted) {
                    highlighted.push(item);
                } else {
                    normal.push(item);
                }
            });

            // Clear the main container
            container.innerHTML = '';

            // Add sections with proper headers
            if (highlighted.length > 0) {
                const highlightedHeader = document.createElement('div');
                highlightedHeader.className = 'section-header';
                highlightedHeader.textContent = 'Current Timestamps';
                container.appendChild(highlightedHeader);
                highlighted.forEach(item => container.appendChild(item));
            }

            if (normal.length > 0) {
                if (highlighted.length > 0) {
                    container.appendChild(document.createElement('br'));
                }
                const normalHeader = document.createElement('div');
                normalHeader.className = 'section-header';
                normalHeader.textContent = 'Other Citations';
                container.appendChild(normalHeader);
                normal.forEach(item => container.appendChild(item));
            }

            // Remove the temporary container
            tempContainer.remove();

            // Update highlighting after a short delay to ensure smooth transition
            requestAnimationFrame(() => {
                updateHighlighting();
            });
        }

        // Check for username after citations are loaded
        const username = await getYouTubeUsername();
        console.log('Username check result:', username);
        
        // Update anonymous checkbox visibility if it exists
        const anonymousGroup = document.getElementById('anonymous-group');
        if (anonymousGroup) {
            if (username) {
                console.log('Showing anonymous checkbox for logged-in user');
                anonymousGroup.style.display = 'block';
            } else {
                console.log('Hiding anonymous checkbox for anonymous user');
                anonymousGroup.style.display = 'none';
            }
        }

        // Store username in chrome storage for later use
        if (username) {
            chrome.storage.local.set({ 'youtubeUsername': username }, () => {
                console.log('Username stored:', username);
            });
        }

        // Update the citations counter
        const counter = document.getElementById('citations-counter');
        if (counter) {
            counter.textContent = citations.length;
        }

    } catch (error) {
        console.error("Error loading citations:", error);
    }
}

// Helper function to update citations list
function updateCitationsList(citations, container) {
    if (!container) return;
    
    // Create a map of existing citation elements
    const existingElements = new Map();
    Array.from(container.children).forEach(child => {
        if (child.classList.contains('citation-item')) {
            const citationId = child.querySelector('.vote-controls')?.dataset.citationId;
            if (citationId) existingElements.set(citationId, child);
        }
    });
    
    if (citations.length === 0) {
        container.innerHTML = '<p>No citations found for this video.</p>';
        return;
    }

    const fragment = document.createDocumentFragment();
    
    if (citations.length === 0) {
        const noCitations = document.createElement('p');
        noCitations.textContent = 'No citations found for this video.';
        fragment.appendChild(noCitations);
    } else {
        citations.forEach(citation => {
            let citationElement;
            
            // Reuse existing element if available
            if (existingElements.has(citation.id)) {
                citationElement = existingElements.get(citation.id);
                existingElements.delete(citation.id);
            } else {
                citationElement = createCitationElement(citation, userVotes[citation.id] || null);
            }

            fragment.appendChild(citationElement);
        });
    }

    // Remove any remaining old elements
    existingElements.forEach(element => element.remove());

    // Clear and update container
    container.innerHTML = '';
    container.appendChild(fragment);
    updateHighlighting();
}

// Debounce function to limit the frequency of updates
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Debounced version of the sort and update function
const debouncedSortAndUpdate = debounce(() => {
    const citationsContainer = document.getElementById("citations-container");
    const requestsContainer = document.getElementById("citation-requests-container");
    
    if (citationsContainer && citationsContainer.style.display !== 'none') {
        const sortedCitations = sortItems(currentCitations, currentSortOption, 'citation');
        updateCitationsList(sortedCitations, citationsContainer);
    }
    
    if (requestsContainer && requestsContainer.style.display !== 'none') {
        const sortedRequests = sortItems(currentRequests, currentSortOption, 'request');
        updateRequestsList(sortedRequests, requestsContainer);
    }
}, 250); // Wait 250ms after the last call before executing

// Track video player and current time
let player = null;
let currentTime = 0;
let currentVideoId = null;

function setupTimeTracking() {
    const video = document.querySelector('video');
    if (!video) return;

    let lastTime = -1;
    const checkTime = () => {
        const newTime = Math.floor(video.currentTime);
        if (newTime !== lastTime) {
            lastTime = newTime;
            currentTime = newTime;
            requestAnimationFrame(updateHighlighting);
        }
        requestAnimationFrame(checkTime);
    };

    requestAnimationFrame(checkTime);
}

function setupVideoChangeTracking() {
    // Listen for YouTube's navigation events
    window.addEventListener('yt-navigate-start', () => {
        console.log("YouTube navigation started");
    });

    window.addEventListener('yt-navigate-finish', () => {
        const newVideoId = new URLSearchParams(window.location.search).get('v');
        if (newVideoId && newVideoId !== currentVideoId) {
            console.log("Video changed to:", newVideoId);
            currentVideoId = newVideoId;
            // Reset current time
            currentTime = 0;
            // Wait for a short moment to ensure the new video player is ready
            setTimeout(() => {
                // Find the new video player
                const newPlayer = document.querySelector("video");
                if (newPlayer) {
                    player = newPlayer;
                    setupTimeTracking();
                }
                // Update lists for new video
                loadCitationRequests();
                loadCitations();
            }, 500);
        }
    });

    // Also check for initial video ID
    currentVideoId = new URLSearchParams(window.location.search).get('v');
}

function parseTimestamp(timestamp) {
    const parts = timestamp.split(':').reverse();
    let seconds = 0;
    for (let i = 0; i < parts.length; i++) {
        seconds += parseInt(parts[i]) * Math.pow(60, i);
    }
    return seconds;
}

function seekToTime(seconds) {
    const video = document.querySelector('video');
    if (video) {
        video.currentTime = seconds;
    }
}



// Cache for current data to prevent unnecessary updates
let currentCitations = [];
let currentRequests = [];
let userVotes = {};
let currentSortOption = 'upvotes'; // Default to upvotes for citations

// Add sort function
function sortItems(items, sortBy, itemType = 'citation') {
    if (!items || !Array.isArray(items)) return [];
    
    // Helper function to check if an item is currently highlighted
    const isHighlighted = (item) => {
        const start = parseTimestamp(item.timestampStart);
        const end = parseTimestamp(item.timestampEnd);
        return currentTime >= start && currentTime <= end;
    };
    
    // Split items into highlighted and non-highlighted
    const highlighted = items.filter(isHighlighted);
    const normal = items.filter(item => !isHighlighted(item));
    
    // Sort function for both groups
    const sortFunction = (a, b) => {
        switch (sortBy) {
            case 'upvotes': {
                // Convert undefined/null scores to 0 and ensure we're dealing with numbers
                const scoreA = Number(a.voteScore ?? 0);
                const scoreB = Number(b.voteScore ?? 0);
                // Sort by score in descending order (higher scores first)
                if (scoreB !== scoreA) {
                    return scoreB - scoreA;
                }
                // If scores are equal, sort by date (newer first)
                const dateA = new Date(a.dateAdded).getTime();
                const dateB = new Date(b.dateAdded).getTime();
                return dateB - dateA;
            }
            case 'recent': {
                try {
                    const dateA = new Date(a.dateAdded);
                    const dateB = new Date(b.dateAdded);
                    if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
                        console.error('Invalid date values:', { 
                            itemA: { id: a.id, dateAdded: a.dateAdded },
                            itemB: { id: b.id, dateAdded: b.dateAdded }
                        });
                        return 0;
                    }
                    return dateB.getTime() - dateA.getTime();
                } catch (error) {
                    console.error('Error comparing dates:', error);
                    return 0;
                }
            }
            default:
                return 0;
        }
    };

    // Sort each group separately using the selected sort option
    const sortedHighlighted = [...highlighted].sort(sortFunction);
    const sortedNormal = [...normal].sort(sortFunction);

    // Return highlighted items first, followed by normal items, both sorted by the selected option
    return [...sortedHighlighted, ...sortedNormal];
}

async function loadCitationRequests() {
    const container = document.getElementById("citation-requests-container");
    if (!container) {
        console.log("Citation requests container not found");
        return;
    }

    const videoId = new URLSearchParams(window.location.search).get('v');
    console.log("Loading citation requests for video:", videoId);
    
    try {
        // Get requests and user votes in parallel, using same message types as citations
        const [requestsResponse, votesResponse] = await Promise.all([
            chrome.runtime.sendMessage({
                type: 'getCitationRequests',
                videoId: videoId
            }),
            chrome.runtime.sendMessage({
                type: 'getUserVotes',
                videoId: videoId,
                itemType: 'request'
            })
        ]);

        if (!requestsResponse.success) {
            throw new Error(requestsResponse.error);
        }

        const requests = requestsResponse.requests || [];
        console.log('Received requests from backend:', requests); // Debug log for request data
        
        // Validate and normalize vote scores and dates
        requests.forEach(request => {
            // Ensure voteScore is a number
            request.voteScore = Number(request.voteScore ?? 0);
            
            // Validate dateAdded
            if (!request.dateAdded) {
                console.warn('Request missing dateAdded:', request);
                request.dateAdded = new Date().toISOString();
            }
            try {
                const date = new Date(request.dateAdded);
                if (isNaN(date.getTime())) {
                    console.warn('Invalid dateAdded value:', request.dateAdded);
                    request.dateAdded = new Date().toISOString();
                }
            } catch (error) {
                console.error('Error parsing dateAdded:', error);
                request.dateAdded = new Date().toISOString();
            }
        });

        userVotes = votesResponse.success ? votesResponse.votes : {};
        
        // Sort the requests using the same sorting function as citations
        const sortedRequests = sortItems(requests, currentSortOption, 'request');
        console.log('Sorted requests:', sortedRequests.map(r => ({ title: r.title, score: r.voteScore })));
        
        // Only update DOM if container is visible and data has changed
        if (container.style.display !== 'none' && JSON.stringify(sortedRequests) !== JSON.stringify(currentRequests)) {
            currentRequests = sortedRequests;
            updateRequestsList(sortedRequests, container);
        }

        // Update the requests counter
        const counter = document.getElementById('requests-counter');
        if (counter) {
            counter.textContent = requests.length;
        }

    } catch (error) {
        console.error("Error loading citation requests:", error);
        if (container.style.display === 'block') {
            container.innerHTML = '<p>Error loading citation requests: ' + error.message + '</p>';
        }
    }
}

async function handleVote(itemId, voteType, itemType = 'citation') {
    try {
        const videoId = new URLSearchParams(window.location.search).get('v');
        if (!videoId) {
            throw new Error('Video ID not found');
        }

        // Check if user is logged in
        const username = await getYouTubeUsername();
        if (!username) {
            alert('You must be logged in to vote. Please log in to your YouTube account.');
            return;
        }

        // Get current vote state from UI
        const voteControls = document.querySelector(`[data-${itemType}-id="${itemId}"]`);
        if (!voteControls) return;

        const upvoteBtn = voteControls.querySelector('.upvote-btn');
        const downvoteBtn = voteControls.querySelector('.downvote-btn');
        const scoreElement = voteControls.querySelector('.vote-score');

        // Optimistically update UI
        const currentScore = parseInt(scoreElement.textContent || '0');
        const isUpvoted = upvoteBtn.classList.contains('voted');
        const isDownvoted = downvoteBtn.classList.contains('voted');

        // Calculate new score based on vote type
        let newScore = currentScore;
        if (voteType === 'up') {
            if (isUpvoted) {
                // Remove upvote
                newScore--;
                upvoteBtn.classList.remove('voted');
                upvoteBtn.title = 'Upvote';
            } else {
                // Add upvote
                newScore++;
                if (isDownvoted) {
                    // Remove previous downvote
                    newScore++;
                }
                upvoteBtn.classList.add('voted');
                downvoteBtn.classList.remove('voted');
                upvoteBtn.title = 'Remove upvote';
                downvoteBtn.title = 'Downvote';
            }
        } else {
            if (isDownvoted) {
                // Remove downvote
                newScore++;
                downvoteBtn.classList.remove('voted');
                downvoteBtn.title = 'Downvote';
            } else {
                // Add downvote
                newScore--;
                if (isUpvoted) {
                    // Remove previous upvote
                    newScore--;
                }
                downvoteBtn.classList.add('voted');
                upvoteBtn.classList.remove('voted');
                downvoteBtn.title = 'Remove downvote';
                upvoteBtn.title = 'Upvote';
            }
        }

        // Update score display
        scoreElement.textContent = newScore;

        // Send vote to Firebase
        const response = await chrome.runtime.sendMessage({
            type: 'updateVotes',
            itemId,
            voteType,
            itemType,
            videoId
        });

        if (!response.success) {
            // Revert UI changes on error
            if (itemType === 'citation') {
                loadCitations();
            } else {
                loadCitationRequests();
            }
            throw new Error(response.error);
        }

        // Quick reload of the list to ensure consistency
        if (itemType === 'citation') {
            loadCitations();
        } else {
            loadCitationRequests();
        }

    } catch (error) {
        console.error(`Error updating ${itemType} vote:`, error);
    }
}

// Add event listener for respond button
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('respond-btn')) {
        const button = e.target;
        window.respondWithCitation(
            button.dataset.start,
            button.dataset.end,
            `Response to request: ${button.dataset.reason || ''}`,
            button.dataset.title || ''
        );
    }
});

function forceUpdateTitle() {
    const titleElement = document.getElementById("citation-title");
    if (titleElement) {
        titleElement.style.display = 'none';
        setTimeout(() => titleElement.style.display = 'block', 0);
    }
}

async function migrateCitationsToNewFormat() {
    const videoId = new URLSearchParams(window.location.search).get('v');
    if (!videoId) return;

    try {
        const response = await chrome.runtime.sendMessage({
            type: 'migrateAllCitations',
            videoId
        });

        if (response.success) {
            console.log(`Successfully migrated ${response.migratedCount} citations`);
            // Refresh the citations list
            loadCitations();
        } else {
            console.error('Migration failed:', response.error);
        }
    } catch (error) {
        console.error('Error during migration:', error);
    }
}

function showAddForm(isRequestsTab) {
    const formContainer = document.getElementById('add-form-container');
    formContainer.innerHTML = `
        <form id="add-form">
            <div class="form-group">
                <input type="text" id="title-input" class="form-input" placeholder="${isRequestsTab ? 'Request Title' : 'Citation Title'}" required>
            </div>
            ${!isRequestsTab ? `
            <div class="form-group">
                <input type="text" id="author-input" class="form-input" placeholder="Author" required>
            </div>
            <div class="form-check">
                <input type="checkbox" id="anonymous-check" class="form-checkbox">
                <label for="anonymous-check">Post as Anonymous</label>
            </div>
            ` : ''}
            <div class="form-group">
                <textarea id="reason-input" class="form-textarea" placeholder="${isRequestsTab ? 'Reason for Request' : 'Description'}" required></textarea>
            </div>
            <div class="form-group">
                <input type="text" id="source-input" class="form-input" placeholder="Source URL" required>
            </div>
            <div class="form-actions">
                <button type="button" id="cancel-btn" class="cancel-btn">Cancel</button>
                <button type="submit" class="submit-btn">${isRequestsTab ? 'Submit Request' : 'Add Citation'}</button>
            </div>
        </form>
    `;
    
    formContainer.style.display = 'block';
    
    // Add event listeners
    document.getElementById('cancel-btn').addEventListener('click', () => {
        formContainer.style.display = 'none';
    });
    
    document.getElementById('add-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitForm(isRequestsTab);
    });
}

// Function to initialize the extension
async function initializeExtension() {
    // Remove any existing citation controls first
    const existingControls = document.getElementById('citation-controls');
    if (existingControls) {
        existingControls.remove();
    }

    // Wait for the secondary element to be available
    const checkForSecondary = setInterval(() => {
        const secondaryElement = document.querySelector("div#secondary.style-scope.ytd-watch-flexy");
        if (secondaryElement) {
            clearInterval(checkForSecondary);
            // Check again before inserting to prevent race conditions
            if (!document.getElementById('citation-controls')) {
                insertCitationButtons();
                setupSortingFunctionality();
            }
        }
    }, 1000);
}

// Call initialize only on YouTube navigation
document.addEventListener('yt-navigate-finish', initializeExtension);

// Update the createCitationElement function to properly handle response citations
function createCitationElement(citation, userVote) {
    const citationElement = document.createElement("div");
    citationElement.className = "citation-item";
    citationElement.dataset.start = parseTimestamp(citation.timestampStart);
    citationElement.dataset.end = parseTimestamp(citation.timestampEnd);
    
    console.log('Creating citation element with data:', citation);
    
    // Get current username from storage
    chrome.storage.local.get(['youtubeUsername'], (result) => {
        const currentUsername = result.youtubeUsername;
        const showDeleteButton = currentUsername && currentUsername === citation.username;
        
        // Create username display with link if not anonymous
        const usernameDisplay = citation.username === 'Anonymous' ? 
            'Anonymous' : 
            `<a href="https://youtube.com/@${citation.username.replace('@', '')}" target="_blank" class="username-link">${citation.username}</a>`;
        
        // Check if this is a response to a citation request
        const isResponse = citation.description.startsWith('Response to request:');
        let originalRequestToDisplay = '';
        let userResponseToDisplay = '';

        if (isResponse) {
            console.log('--- Parsing Response Citation ---');
            console.log('Full Description:', citation.description);

            const separator = '\n\n';
            const separatorIndex = citation.description.indexOf(separator);

            if (separatorIndex !== -1) {
                // Case 1: New response citation with user-typed content (has the \n\n separator).
                originalRequestToDisplay = citation.description.substring(0, separatorIndex).replace('Response to request:', '').trim();
                userResponseToDisplay = citation.description.substring(separatorIndex + separator.length).trim();
                console.log('Case: New Response (has separator)');
            } else {
                // Case 2: Older response citation (or new one without typed content if bypasses required).
                // No \n\n separator found. Display original request clean, and full description in response.
                originalRequestToDisplay = citation.description.replace('Response to request:', '').trim();
                userResponseToDisplay = citation.description; // Display full original string for old responses
                console.log('Case: Old Response (no separator)');
            }

            console.log('Original Request Display (extracted):', originalRequestToDisplay);
            console.log('User Response Display (extracted):', userResponseToDisplay);
            console.log('-----------------------------------');

            citationElement.innerHTML = `
            <div style="display: flex; flex-direction: column; min-height: 200px;">
                <div class="citation-title">${citation.citationTitle}</div>
                <div style="flex: 1; padding: 16px;">
                    <div class="time-range">
                        <span class="timestamp-link" data-time="${parseTimestamp(citation.timestampStart)}">${citation.timestampStart}</span>
                        <span class="time-separator">to</span>
                        <span class="timestamp-link" data-time="${parseTimestamp(citation.timestampEnd)}">${citation.timestampEnd}</span>
                    </div>
                    <div class="citation-meta">
                        <span>${usernameDisplay}</span>
                        <span>•</span>
                        <span>${new Intl.DateTimeFormat('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                        }).format(new Date(citation.dateAdded))}</span>
                    </div>
                    <div class="citation-description">
                        <div class="original-request">${originalRequestToDisplay}</div>
                        <div class="response">${userResponseToDisplay}</div>
                    </div>
                    ${citation.source ? `<div class="citation-source"><a href="${citation.source}" target="_blank">${citation.source}</a></div>` : ''}
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0 16px 16px;">
                    <div class="vote-controls" data-citation-id="${citation.id}">
                        <button class="vote-btn upvote-btn ${userVote === 'up' ? 'voted' : ''}" 
                                title="${userVote === 'up' ? 'Remove upvote' : 'Upvote'}">
                            <span class="vote-icon">▲</span>
                        </button>
                        <span class="vote-score">${citation.voteScore || 0}</span>
                        <button class="vote-btn downvote-btn ${userVote === 'down' ? 'voted' : ''}" 
                                title="${userVote === 'down' ? 'Remove downvote' : 'Downvote'}">
                            <span class="vote-icon">▼</span>
                        </button>
                    </div>
                    <div class="action-buttons">
                        ${showDeleteButton ? `
                            <button class="action-btn delete-btn" title="Delete citation">
                                Delete
                            </button>
                        ` : ''}
                        <button class="action-btn report-btn" title="Report citation">
                            Report
                        </button>
                    </div>
                </div>
            </div>
        `;
        } else {
            // Case 3: Normal citation (not a response to a request).
            userResponseToDisplay = citation.description; // Assign for consistency, though not used in HTML below.
            citationElement.innerHTML = `
            <div style="display: flex; flex-direction: column; min-height: 200px;">
                <div class="citation-title">${citation.citationTitle}</div>
                <div style="flex: 1; padding: 16px;">
                    <div class="time-range">
                        <span class="timestamp-link" data-time="${parseTimestamp(citation.timestampStart)}">${citation.timestampStart}</span>
                        <span class="time-separator">to</span>
                        <span class="timestamp-link" data-time="${parseTimestamp(citation.timestampEnd)}">${citation.timestampEnd}</span>
                    </div>
                    <div class="citation-meta">
                        <span>${usernameDisplay}</span>
                        <span>•</span>
                        <span>${new Intl.DateTimeFormat('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                        }).format(new Date(citation.dateAdded))}</span>
                    </div>
                    <div class="citation-description">${citation.description}</div>
                    ${citation.source ? `<div class="citation-source"><a href="${citation.source}" target="_blank">${citation.source}</a></div>` : ''}
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0 16px 16px;">
                    <div class="vote-controls" data-citation-id="${citation.id}">
                        <button class="vote-btn upvote-btn ${userVote === 'up' ? 'voted' : ''}" 
                                title="${userVote === 'up' ? 'Remove upvote' : 'Upvote'}">
                            <span class="vote-icon">▲</span>
                        </button>
                        <span class="vote-score">${citation.voteScore || 0}</span>
                        <button class="vote-btn downvote-btn ${userVote === 'down' ? 'voted' : ''}" 
                                title="${userVote === 'down' ? 'Remove downvote' : 'Downvote'}">
                            <span class="vote-icon">▼</span>
                        </button>
                    </div>
                    <div class="action-buttons">
                        ${showDeleteButton ? `
                            <button class="action-btn delete-btn" title="Delete citation">
                                Delete
                            </button>
                        ` : ''}
                        <button class="action-btn report-btn" title="Report citation">
                            Report
                        </button>
                    </div>
                </div>
            </div>
        `;
        }

        // Add click handlers for timestamp links
        citationElement.querySelectorAll('.timestamp-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const time = parseInt(e.target.dataset.time);
                if (player && !isNaN(time)) {
                    player.currentTime = time;
                    player.play();
                }
            });
        });

        // Add vote event listeners
        const voteControls = citationElement.querySelector('.vote-controls');
        const upvoteBtn = voteControls.querySelector('.upvote-btn');
        const downvoteBtn = voteControls.querySelector('.downvote-btn');
        
        upvoteBtn.addEventListener('click', () => handleVote(citation.id, 'up'));
        downvoteBtn.addEventListener('click', () => handleVote(citation.id, 'down'));

        // Add delete button event listener if it exists
        if (showDeleteButton) {
            const deleteBtn = citationElement.querySelector('.action-btn.delete-btn');
            deleteBtn.addEventListener('click', async () => {
                if (confirm('Are you sure you want to delete this citation? This action cannot be undone.')) {
                    try {
                        const response = await chrome.runtime.sendMessage({
                            type: 'deleteCitation',
                            citationId: citation.id,
                            videoId: new URLSearchParams(window.location.search).get('v')
                        });

                        if (response.success) {
                            citationElement.remove();
                            loadCitations();
                        } else {
                            throw new Error(response.error);
                        }
                    } catch (error) {
                        console.error('Error deleting citation:', error);
                        alert('Failed to delete citation. Please try again.');
                    }
                }
            });
        }

        // Add report button event listener
        const reportBtn = citationElement.querySelector('.action-btn.report-btn');
        reportBtn.addEventListener('click', () => {
            showReportDialog(citation.id, 'citation');
        });
    });
    
    return citationElement;
}

function updateCitationsList(citations, container) {
    if (!container) return;
    
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    if (citations.length === 0) {
        const noCitations = document.createElement('p');
        noCitations.textContent = 'No citations found for this video.';
        fragment.appendChild(noCitations);
    } else {
        citations.forEach(citation => {
            const citationElement = createCitationElement(citation, userVotes[citation.id] || null);
            fragment.appendChild(citationElement);
        });
    }

    container.appendChild(fragment);
}

// Add CSS for highlighting and recorded segments panel
const style = document.createElement('style');
style.textContent = `
    #citation-controls {
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        background-color: white;
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 4px;
    }
    
    .citations-scroll-container {
        overflow-y: auto;
        padding: 0;
        display: flex;
        flex-direction: column;
        margin-top: -8px; /* Reduce space after header */
    }

    .header-actions {
        padding: 0 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px; /* Reduced from default */
    }

    #add-form-container {
        padding: 12px 16px; /* Reduced top/bottom padding */
        background-color: white;
        border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    }
    
    #citations-container,
    #citation-requests-container {
        padding: 8px 16px 16px; /* Reduced top padding */
        overflow-y: auto;
    }

    .section-header {
        font-weight: 500;
        padding: 8px 16px; /* Reduced padding */
        border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        margin-bottom: 12px; /* Reduced margin */
        color: #030303;
        font-size: 14px;
        background-color: #f8f8f8;
        border-radius: 4px;
    }

    .citation-item:first-child {
        margin-top: 8px; /* Add a small margin to first item */
    }

    .citation-item {
        margin-bottom: 12px; /* Reduced from 16px */
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 8px;
        background-color: white;
        transition: background-color 0.2s ease;
        overflow: hidden;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }

    .citation-item:hover {
        background-color: #f8f9fa;
    }

    .active-citation {
        border-left: 4px solid #1a73e8;
        background-color: #f8f9fa;
    }

    .vote-controls {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .vote-btn {
        background: none;
        border: none;
        padding: 4px 8px;
        cursor: pointer;
        color: #606060;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
    }

    .vote-btn:hover .vote-icon {
        color: #030303;
    }

    .vote-btn.upvote-btn .vote-icon {
        color: #606060;
    }

    .vote-btn.downvote-btn .vote-icon {
        color: #606060;
    }

    .vote-btn.upvote-btn:hover .vote-icon {
        color: #1a73e8;
    }

    .vote-btn.downvote-btn:hover .vote-icon {
        color: #dc3545;
    }

    .vote-btn.upvote-btn.voted .vote-icon {
        color: #1a73e8;
    }

    .vote-btn.downvote-btn.voted .vote-icon {
        color: #dc3545;
    }

    .vote-score {
        font-weight: 500;
        color: #606060;
        min-width: 20px;
        text-align: center;
    }

    .action-btn {
        padding: 8px 16px;
        border: none;
        border-radius: 18px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        color: white;
        min-width: 100px;
        text-align: center;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }

    .action-btn.delete-btn {
        background-color: #dc3545;
    }

    .action-btn.respond-btn {
        background-color: #1a73e8;
    }

    .action-btn:hover {
        opacity: 0.9;
    }

    .add-btn {
        padding: 8px 16px;
        border: none;
        border-radius: 18px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        background-color: #1a73e8;
        color: white;
    }

    .add-btn:hover {
        opacity: 0.9;
    }

    .citation-title, .request-title {
        padding: 12px 16px;
        font-size: 16px;
        font-weight: 500;
        background-color: #f8f9fa;
        border-bottom: 1px solid rgba(0,0,0,0.1);
        color: #202124;
    }

    .time-range {
        margin-bottom: 8px;
        font-size: 14px;
        color: #5f6368;
        display: flex;
        align-items: center;
    }

    .timestamp-link {
        color: #1a73e8;
        cursor: pointer;
        text-decoration: none;
    }

    .timestamp-link:hover {
        text-decoration: underline;
    }

    .time-separator {
        margin: 0 6px;
        color: #5f6368;
    }

    .citation-meta, .request-meta {
        font-size: 13px;
        color: #5f6368;
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 12px;
    }

    .username-link {
        color: #1a73e8;
        text-decoration: none;
    }

    .username-link:hover {
        text-decoration: underline;
    }

    .citation-description, .request-description {
        margin-top: 12px;
        font-size: 14px;
        line-height: 1.5;
        color: #202124;
    }

    .citation-source {
        margin-top: 12px;
        font-size: 13px;
    }

    .citation-source a {
        color: #1a73e8;
        text-decoration: none;
        word-break: break-all;
    }

    .citation-source a:hover {
        text-decoration: underline;
    }
`;
document.head.appendChild(style);

// Update highlighting every second
setInterval(updateHighlighting, 1000);

// Function to update the requests list
function updateRequestsList(requests, container) {
    if (!container) return;
    
    // Clear existing content
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();

    if (!requests || requests.length === 0) {
        const noRequests = document.createElement('p');
        noRequests.textContent = 'No citation requests available.';
        noRequests.className = 'no-items-message';
        fragment.appendChild(noRequests);
        container.appendChild(fragment);
        return;
    }

    requests.forEach(request => {
        // Add user's vote to the request object
        request.userVote = userVotes[request.id];
        const requestElement = createRequestElement(request);
        fragment.appendChild(requestElement);
    });

    container.appendChild(fragment);
}

// Function to create a request element
function createRequestElement(request) {
    const requestElement = document.createElement("div");
    requestElement.className = "citation-item";
    requestElement.dataset.start = parseTimestamp(request.timestampStart);
    requestElement.dataset.end = parseTimestamp(request.timestampEnd);
    requestElement.dataset.requestId = request.id;
    
    requestElement.innerHTML = `
        <div style="display: flex; flex-direction: column; min-height: 200px;">
            <div class="request-title">${request.title || 'Untitled Request'}</div>
            <div style="flex: 1; padding: 16px;">
                <div class="time-range">
                    <span class="timestamp-link" data-time="${parseTimestamp(request.timestampStart)}">${request.timestampStart}</span>
                    <span class="time-separator">to</span>
                    <span class="timestamp-link" data-time="${parseTimestamp(request.timestampEnd)}">${request.timestampEnd}</span>
                </div>
                <div class="request-meta">
                    <span><a href="https://youtube.com/@${request.username.replace('@', '')}" target="_blank" class="username-link">${request.username}</a></span>
                    <span>•</span>
                    <span>${new Intl.DateTimeFormat('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    }).format(new Date(request.dateAdded))}</span>
                </div>
                <div class="request-description">${request.reason || ''}</div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0 16px 16px;">
                <div class="vote-controls" data-request-id="${request.id}">
                    <button class="vote-btn upvote-btn ${request.userVote === 'up' ? 'voted' : ''}" title="Upvote">
                        <span class="vote-icon">▲</span>
                    </button>
                    <span class="vote-score">${request.voteScore || 0}</span>
                    <button class="vote-btn downvote-btn ${request.userVote === 'down' ? 'voted' : ''}" title="Downvote">
                        <span class="vote-icon">▼</span>
                    </button>
                </div>
                <div class="action-buttons" style="display: flex; align-items: center; gap: 8px;">
                    <button class="action-btn respond-btn" title="Respond with Citation" data-start="${request.timestampStart}" data-end="${request.timestampEnd}" data-reason="${request.reason || ''}" data-title="${request.title || ''}">
                        Respond
                    </button>
                    <button class="action-btn report-btn" title="Report request" style="height: 36px; line-height: 36px; display: flex; align-items: center;">
                        Report
                    </button>
                </div>
            </div>
        </div>
    `;

    // Add click handlers for timestamp links
    requestElement.querySelectorAll('.timestamp-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const time = parseInt(e.target.dataset.time);
            if (player && !isNaN(time)) {
                player.currentTime = time;
                player.play();
            }
        });
    });

    // Add event listeners for voting buttons
    const upvoteBtn = requestElement.querySelector('.upvote-btn');
    const downvoteBtn = requestElement.querySelector('.downvote-btn');
    const respondBtn = requestElement.querySelector('.respond-btn');
    const reportBtn = requestElement.querySelector('.report-btn');

    upvoteBtn.addEventListener('click', () => handleVote(request.id, 'up', 'request'));
    downvoteBtn.addEventListener('click', () => handleVote(request.id, 'down', 'request'));
    respondBtn.addEventListener('click', (e) => {
        console.log('Request data:', request); 
        const button = e.target;
        window.respondWithCitation(
            button.dataset.start,
            button.dataset.end,
            `Response to request: ${button.dataset.reason || ''}`,
            button.dataset.title || ''
        );
    });
    reportBtn.addEventListener('click', () => {
        showReportDialog(request.id, 'request');
    });

    return requestElement;
}

// Function to handle request actions (accept/reject)
async function handleRequestAction(requestId, action) {
    try {
        const response = await chrome.runtime.sendMessage({
            type: action === 'accept' ? 'acceptCitationRequest' : 'rejectCitationRequest',
            data: { requestId }
        });

        if (response.success) {
            // Refresh the requests list
            loadCitationRequests();
            // Show success message
            alert(`Citation request ${action}ed successfully`);
        } else {
            alert(`Failed to ${action} citation request. Please try again.`);
        }
    } catch (error) {
        console.error(`Error ${action}ing citation request:`, error);
        alert(`An error occurred while ${action}ing the citation request. Please try again.`);
    }
}

// Update highlighting function to trigger resort when highlighting changes
function updateHighlighting() {
    const player = document.querySelector('video');
    if (!player) return;

    const currentTime = player.currentTime;
    const citationsContainer = document.getElementById("citations-container");
    const requestsContainer = document.getElementById("citation-requests-container");

    // Function to create a section header
    const createSectionHeader = (text) => {
        const header = document.createElement('div');
        header.className = 'section-header';
        header.textContent = text;
        return header;
    };

    // Function to sort items by vote score
    const sortByVoteScore = (a, b) => {
        const scoreA = parseInt(a.querySelector('.vote-score')?.textContent || '0');
        const scoreB = parseInt(b.querySelector('.vote-score')?.textContent || '0');
        if (scoreB !== scoreA) {
            return scoreB - scoreA; // Sort by score first
        }
        // If scores are equal, sort by date
        const dateA = new Date(a.querySelector('p:nth-child(3)')?.textContent.split(': ')[1] || 0);
        const dateB = new Date(b.querySelector('p:nth-child(3)')?.textContent.split(': ')[1] || 0);
        return dateB - dateA;
    };

    // Function to sort items by date
    const sortByDate = (a, b) => {
        const dateA = new Date(a.querySelector('p:nth-child(3)')?.textContent.split(': ')[1] || 0);
        const dateB = new Date(b.querySelector('p:nth-child(3)')?.textContent.split(': ')[1] || 0);
        return dateB - dateA;
    };

    // Function to update a container's content
    const updateContainer = (container, items) => {
        if (!container || items.length === 0) return;

        const highlighted = [];
        const normal = [];
        let highlightStateChanged = false;

        items.forEach(item => {
            const start = parseFloat(item.dataset.start);
            const end = parseFloat(item.dataset.end);
            const wasHighlighted = item.classList.contains('active-citation');
            const isHighlighted = currentTime >= start && currentTime <= end;
            
            // Only update highlight state if not being hovered
            if (!item.matches(':hover')) {
                if (wasHighlighted !== isHighlighted) {
                    highlightStateChanged = true;
                }
                item.classList.toggle('active-citation', isHighlighted);
            }
            
            if (item.classList.contains('active-citation')) {
                highlighted.push(item);
            } else {
                normal.push(item);
            }
        });

        // Only resort if highlight state changed
        if (highlightStateChanged) {
            // Sort highlighted items by vote score
            highlighted.sort(sortByVoteScore);
            
            // Sort normal items by vote score
            normal.sort(sortByVoteScore);
            
            // Clear container
            container.innerHTML = '';
            
            // Add highlighted section if there are highlighted items
            if (highlighted.length > 0) {
                container.appendChild(createSectionHeader('Current Timestamps'));
                highlighted.forEach(item => container.appendChild(item));
            }
            
            // Add normal section if there are normal items
            if (normal.length > 0) {
                if (highlighted.length > 0) {
                    container.appendChild(document.createElement('br'));
                }
                container.appendChild(createSectionHeader('Other Citations'));
                normal.forEach(item => container.appendChild(item));
            }
        }
    };

    // Update citations
    if (citationsContainer && citationsContainer.style.display !== 'none') {
        const citations = Array.from(citationsContainer.querySelectorAll('.citation-item'));
        updateContainer(citationsContainer, citations);
    }

    // Update requests
    if (requestsContainer && requestsContainer.style.display !== 'none') {
        const requests = Array.from(requestsContainer.querySelectorAll('.citation-item'));
        updateContainer(requestsContainer, requests);
    }
}

// Function to show simple tooltip
function showSimpleTooltip() {
    console.log('Attempting to show tooltip...');
    
    // Prevent multiple tooltips
    if (document.querySelector('.simple-tooltip')) {
        console.log('Tooltip already exists, skipping');
        return;
    }
    
    // Wait for both player and record button to be available
    const checkForElements = setInterval(() => {
        const recordBtn = document.querySelector('.record-start-btn');
        const player = getPlayer();
        console.log('Checking for elements:', {
            recordBtn: recordBtn ? 'found' : 'not found',
            player: player ? 'found' : 'not found'
        });
        
        if (recordBtn && player) {
            clearInterval(checkForElements);
            console.log('Elements found, creating tooltip');
            
            // Create tooltip
            const tooltip = document.createElement('div');
            tooltip.className = 'simple-tooltip';
            tooltip.innerHTML = `
                <span class="extension-name">Citation Tool:</span> 
                Click to start creating citation segments.
            `;
            
            // Add to page first so we can get dimensions
            document.body.appendChild(tooltip);
            console.log('Tooltip added to page');
            
            // Function to update tooltip position
            const updateTooltipPosition = () => {
                const btnRect = recordBtn.getBoundingClientRect();
                const playerRect = player.getBoundingClientRect();
                const tooltipRect = tooltip.getBoundingClientRect();
                
                // Calculate position
                const isTheaterMode = document.documentElement.classList.contains('ytd-watch-flexy');
                const offset = isTheaterMode ? 0 : playerRect.left;
                
                tooltip.style.position = 'fixed';
                tooltip.style.left = `${offset + btnRect.left + (btnRect.width / 2)}px`;
                tooltip.style.top = `${btnRect.top - tooltipRect.height - 8}px`;
                tooltip.style.transform = 'translateX(-50%)';
            };

            // Update position initially and on resize/theater mode change
            updateTooltipPosition();
            window.addEventListener('resize', updateTooltipPosition);
            
            // Watch for theater mode changes
            const observer = new MutationObserver(() => {
                updateTooltipPosition();
            });
            
            observer.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['class']
            });
            
            // Show tooltip immediately
            requestAnimationFrame(() => {
                tooltip.style.opacity = '1';
                console.log('Tooltip fade in');
            });
            
            // Remove after delay
            setTimeout(() => {
                tooltip.style.opacity = '0';
                console.log('Tooltip fade out');
                setTimeout(() => {
                    tooltip.remove();
                    observer.disconnect();
                    window.removeEventListener('resize', updateTooltipPosition);
                    console.log('Tooltip removed');
                }, 300);
            }, 3000);
        }
    }, 500);

    // Clear interval if elements not found
    setTimeout(() => clearInterval(checkForElements), 10000);
}

// Update tooltip styles
const tooltipStyles = `
    .simple-tooltip {
        position: absolute;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 13px;
        z-index: 10000;
        max-width: 220px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.3s ease, transform 0.2s ease;
        border: 1px solid rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(4px);
        will-change: transform;
    }

    .simple-tooltip:after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border: 6px solid transparent;
        border-top-color: rgba(0, 0, 0, 0.9);
    }

    .simple-tooltip .extension-name {
        color: #4285f4;
        font-weight: 500;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    }
`;

// Add the styles to the page
const styleEl = document.createElement('style');
styleEl.textContent = tooltipStyles;
document.head.appendChild(styleEl);

// Add CSS for the new buttons
const buttonStyles = `
    .citation-record-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2px;
        border-radius: 4px;
        background: rgba(0, 0, 0, 0.6);
        margin: 0 4px;
        border: 1px solid rgba(255, 0, 0, 0.5);
    }
    
    .record-start-btn.recording-active .citation-record-btn {
        animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
        0% { background: rgba(0, 0, 0, 0.6); border-color: rgba(255, 0, 0, 0.5); }
        50% { background: rgba(255, 0, 0, 0.2); border-color: rgba(255, 0, 0, 0.8); }
        100% { background: rgba(0, 0, 0, 0.6); border-color: rgba(255, 0, 0, 0.5); }
    }

    .citation-record-btn:hover {
        background: rgba(255, 0, 0, 0.2);
        border-color: rgba(255, 0, 0, 0.8);
    }
`;

// Call showSimpleTooltip when a new video loads
function onVideoLoad() {
    console.log('Video loaded, scheduling tooltip');
    // Wait for player to be ready
    const waitForPlayer = setInterval(() => {
        const player = getPlayer();
        if (player) {
            clearInterval(waitForPlayer);
            setTimeout(showSimpleTooltip, 1500);
        }
    }, 500);
    
    // Clear interval after 10 seconds if player not found
    setTimeout(() => clearInterval(waitForPlayer), 10000);
}

// Update the init function to ensure player is ready
function init() {
    console.log('Initializing extension...');
    
    // Clear any existing controls first to prevent duplicates
    const existingControls = document.getElementById('citation-controls');
    if (existingControls) {
        console.log('Removing existing citation controls');
        existingControls.remove();
    }
    
    insertCitationButtons();
    observeTheaterMode();
    
    // Initialize forms if they exist
    const citationForm = document.getElementById('citation-form');
    if (citationForm) {
        initializeCitationForm();
    }
    const requestForm = document.getElementById('request-form');
    if (requestForm) {
        initializeRequestForm();
    }
    
    // Ensure recorded segments panel exists
    setupRecordedSegmentsPanel();
}

// Function to get YouTube player
function getPlayer() {
    const player = document.querySelector('#movie_player');
    return player;
}

// Listen for video navigation
let lastUrl = location.href;
const observer = new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
        console.log('URL changed from', lastUrl, 'to', currentUrl);
        lastUrl = currentUrl;
        if (currentUrl.includes('youtube.com/watch')) {
            console.log('New video detected, triggering tooltip');
            onVideoLoad();
        }
    }
});

// Start observing
observer.observe(document, { subtree: true, childList: true });

// Show on initial page load if it's a video
if (location.href.includes('youtube.com/watch')) {
    console.log('Initial video page load detected');
    onVideoLoad();
}

// Add the styles to the page
const styleEl2 = document.createElement('style');
styleEl2.textContent = buttonStyles;
document.head.appendChild(styleEl2);

// Add CSS for the dropdown functionality
const dropdownStyles = `
    .extension-header {
        display: flex;
        align-items: center;
        padding: 8px;
        background-color: #f8f8f8;
        border-radius: 4px 4px 0 0;
    }

    .toggle-extension-btn {
        background: none;
        border: none;
        padding: 4px 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 8px;
        color: #606060;
        transition: transform 0.2s ease;
    }

    .toggle-extension-btn:hover {
        color: #030303;
    }

    .toggle-icon {
        font-size: 16px;
        transition: transform 0.2s ease;
    }

    .extension-content {
        transition: max-height 0.3s ease-out;
    }

    .extension-content.collapsed {
        max-height: 0;
        overflow: hidden;
    }
`;

// Add the styles to the page
const dropdownStyleEl = document.createElement('style');
dropdownStyleEl.textContent = dropdownStyles;
document.head.appendChild(dropdownStyleEl);

// Function to update the stored width value
function updateStoredWidth() {
    const secondaryElement = document.querySelector("div#secondary.style-scope.ytd-watch-flexy");
    if (secondaryElement) {
        storedSecondaryWidth = secondaryElement.offsetWidth;
        
        // Update any existing citation controls
        const ccDiv = document.querySelector("#citation-controls");
        if (ccDiv) {
            ccDiv.style.width = storedSecondaryWidth + 'px';
        }
    }
}

// Call updateStoredWidth on window resize for additional reliability
window.addEventListener('resize', updateStoredWidth);

// Add CSS for the recorded segments panel
const recordedSegmentsStyle = document.createElement('style');
recordedSegmentsStyle.textContent = `
    .recorded-segments-panel {
        position: fixed;
        top: 20%;
        right: 0;
        background-color: white;
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 4px 0 0 4px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        z-index: 2000;
        transition: transform 0.3s ease;
        width: 460px;
        max-width: 95%;
        display: flex;
        overflow: visible; /* Changed from hidden to allow button to maintain size */
    }
    
    .recorded-segments-panel.collapsed {
        transform: translateX(calc(100% - 20px));
    }
    
    .recorded-segments-panel .toggle-btn {
        position: absolute;
        left: -20px; /* Position button outside the panel */
        top: 0;
        transform: none;
        background: #1a73e8;
        color: white;
        border: none;
        border-radius: 4px 0 0 4px;
        padding: 0;
        cursor: pointer;
        width: 20px;
        height: 100%;
        min-height: 40px; /* Added minimum height */
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        margin: 0;
        z-index: 1; /* Ensure button stays above other elements */
    }
    
    .recorded-segments-panel .panel-content {
        padding: 16px;
        width: 100%;
        margin-left: 0; /* Removed margin since button is now outside */
        max-height: 80vh;
        overflow-y: auto;
        min-width: 430px;
        border-left: none; /* Removed since button is outside */
    }
    
    .recorded-segment {
        padding: 16px;
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 4px;
        margin-bottom: 12px;
        background-color: #f8f9fa;
    }
    
    .recorded-segment .time-range {
        font-weight: 500;
        margin-bottom: 8px;
        cursor: pointer;
        color: #1a73e8;
    }
    
    .recorded-segment .time-range:hover {
        text-decoration: underline;
    }
    
    .recorded-segment .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }
    
    .recorded-segment .actions button {
        flex: 1;
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        font-size: 13px;
        cursor: pointer;
        min-width: 80px;
        white-space: nowrap;
        font-weight: 500;
    }
    
    .recorded-segment .actions .cite-btn,
    .recorded-segment .actions .request-btn {
        background-color: #1a73e8;
        color: white;
    }
    
    .recorded-segment .actions .delete-btn {
        background-color: #ea4335;
        color: white;
    }
`;
document.head.appendChild(recordedSegmentsStyle);

// Fix and ensure the record functionality works correctly
function ensureRecordingFeatureWorks() {
    console.log('Ensuring recording feature is working correctly...');
    
    // Make sure the record button is setup properly
    setupRecordButtons();
    
    // If the record button is missing, retry after a delay
    const checkRecordButton = setInterval(() => {
        const recordBtn = document.querySelector('.record-start-btn');
        if (!recordBtn) {
            console.log('Record button not found, recreating...');
            setupRecordButtons();
        } else {
            console.log('Record button found, clearing interval');
            clearInterval(checkRecordButton);
        }
    }, 2000);
    
    // Clear the interval after 20 seconds to avoid infinite checking
    setTimeout(() => clearInterval(checkRecordButton), 20000);
}

// Call this function when the page loads and after navigation
window.addEventListener('yt-navigate-finish', () => {
    setTimeout(ensureRecordingFeatureWorks, 1500);
});

// Also run on initial page load
if (location.href.includes('youtube.com/watch')) {
    setTimeout(ensureRecordingFeatureWorks, 1500);
}

// Add report dialog styles
const reportDialogStyles = `
    .report-dialog {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        width: 400px;
        max-width: 90vw;
    }

    .report-dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 9999;
    }

    .report-dialog h3 {
        margin: 0 0 16px;
        color: #202124;
        font-size: 18px;
    }

    .report-dialog select,
    .report-dialog textarea {
        width: 100%;
        padding: 8px 12px;
        margin-bottom: 16px;
        border: 1px solid #dadce0;
        border-radius: 4px;
        font-size: 14px;
    }

    .report-dialog textarea {
        min-height: 100px;
        resize: vertical;
    }

    .report-dialog-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }

    .report-dialog-buttons button {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        cursor: pointer;
    }

    .report-dialog-buttons .cancel-btn {
        background: #f1f3f4;
        color: #202124;
    }

    .report-dialog-buttons .submit-btn {
        background: #1a73e8;
        color: white;
    }

    .action-buttons {
        display: flex;
        gap: 8px;
    }

    .action-btn.report-btn {
        background-color: #ea4335;
    }
`;

// Add the styles to the page
const reportStyleEl = document.createElement('style');
reportStyleEl.textContent = reportDialogStyles;
document.head.appendChild(reportStyleEl);

// Function to show report dialog
async function showReportDialog(itemId, itemType) {
    // Check if user is logged in first
    const username = await getYouTubeUsername();
    if (!username) {
        alert('You must be logged in to report. Please log in to your YouTube account.');
        return;
    }

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'report-dialog-overlay';
    
    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'report-dialog';
    dialog.innerHTML = `
        <h3>Report ${itemType === 'citation' ? 'Citation' : 'Request'}</h3>
        <select id="report-reason" required>
            <option value="">Select a reason</option>
            <option value="inappropriate_content">Inappropriate Content</option>
            <option value="spam">Spam</option>
            <option value="misinformation">Misinformation</option>
            <option value="harassment">Harassment</option>
            <option value="other">Other</option>
        </select>
        <textarea id="report-details" placeholder="Please provide additional details (optional)"></textarea>
        <div class="report-dialog-buttons">
            <button class="cancel-btn">Cancel</button>
            <button class="submit-btn">Submit Report</button>
        </div>
    `;
    
    // Add to page
    document.body.appendChild(overlay);
    document.body.appendChild(dialog);
    
    // Handle cancel
    const cancelBtn = dialog.querySelector('.cancel-btn');
    cancelBtn.addEventListener('click', () => {
        overlay.remove();
        dialog.remove();
    });
    
    // Handle submit
    const submitBtn = dialog.querySelector('.submit-btn');
    submitBtn.addEventListener('click', async () => {
        const reason = dialog.querySelector('#report-reason').value;
        const details = dialog.querySelector('#report-details').value;
        
        if (!reason) {
            alert('Please select a reason for reporting');
            return;
        }
        
        try {
            const videoId = new URLSearchParams(window.location.search).get('v');
            const response = await chrome.runtime.sendMessage({
                type: 'reportItem',
                data: {
                    videoId,
                    itemId,
                    itemType,
                    reason,
                    additionalInfo: details,
                    username: username // Include the username in the report
                }
            });
            
            if (response.success) {
                alert('Report submitted successfully');
                overlay.remove();
                dialog.remove();
            } else {
                throw new Error(response.error);
            }
        } catch (error) {
            console.error('Error submitting report:', error);
            alert('Failed to submit report. Please try again.');
        }
    });
    
    // Close on overlay click
    overlay.addEventListener('click', () => {
        overlay.remove();
        dialog.remove();
    });
}
