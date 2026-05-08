// ─────────────────────────────────────────────
// panel.js
// Builds the citation sidebar panel DOM,
// wires up tabs, sort menu, toggle, and add button.
// Depends on: citations.js, forms.js, utils.js
// ─────────────────────────────────────────────

let storedSecondaryWidth = 0;

// ── Panel construction ────────────────────────

function insertCitationButtons() {
    const secondary = document.querySelector('div#secondary.style-scope.ytd-watch-flexy');
    if (!secondary) { console.log('[panel] Secondary element not found'); return; }

    storedSecondaryWidth = secondary.offsetWidth;

    const panel = document.createElement('div');
    panel.id        = 'citation-controls';
    panel.className = 'citation-controls';
    panel.style.width = storedSecondaryWidth + 'px';

    panel.innerHTML = `
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
                                <path d="M21,6H3V5h18V6z M15,11H3v1h12V11z M9,17H3v1h6V17z" fill="currentColor"/>
                            </svg>
                        </span>
                        <span class="sort-text">Sort by</span>
                        <span class="sort-caret">
                            <svg viewBox="0 0 24 24" width="24" height="24">
                                <path d="M7 10l5 5 5-5z" fill="currentColor"/>
                            </svg>
                        </span>
                    </button>
                    <div class="sort-menu" style="display:none;">
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
                <div id="add-form-container" style="display:none;"></div>
                <div id="citations-container"></div>
                <div id="citation-requests-container" style="display:none;"></div>
            </div>
        </div>
    `;

    secondary.prepend(panel);
    _wireResizeObserver(secondary, panel);
    _wireToggle();
    _wireTabs();
    _wireAddButton();
    _wireSortMenu();

    // Load initial data
    document.getElementById('citations-btn').classList.add('active');
    document.getElementById('citations-container').style.display = 'block';
    loadCitations();
}

// ── Theater mode ──────────────────────────────

function observeTheaterMode() {
    const ytdWatchFlexy = document.querySelector('ytd-watch-flexy');
    if (!ytdWatchFlexy) return;

    new MutationObserver(() => {
        const isTheater = ytdWatchFlexy.hasAttribute('theater');
        const ccDiv     = document.getElementById('citation-controls');
        if (!ccDiv) return;

        if (isTheater) {
            const playerContainer = document.querySelector('#ytd-player');
            playerContainer?.appendChild(ccDiv);
            Object.assign(ccDiv.style, {
                position:        'absolute',
                top:             '0',
                right:           '0',
                zIndex:          '999',
                width:           storedSecondaryWidth + 'px',
                backgroundColor: 'white',
                boxShadow:       '0 2px 10px rgba(0,0,0,0.1)',
            });
        } else {
            const secondary = document.querySelector('div#secondary.style-scope.ytd-watch-flexy');
            if (secondary) {
                ccDiv.removeAttribute('style');
                ccDiv.style.width = storedSecondaryWidth + 'px';
                secondary.insertBefore(ccDiv, secondary.firstChild);
            }
        }
    }).observe(ytdWatchFlexy, { attributes: true });
}

// ── Private wiring helpers ────────────────────

function _wireResizeObserver(secondary, panel) {
    new ResizeObserver(entries => {
        for (const entry of entries) {
            if (entry.target === secondary) {
                storedSecondaryWidth = entry.target.offsetWidth;
                panel.style.width    = storedSecondaryWidth + 'px';
            }
        }
    }).observe(secondary);
}

function _wireToggle() {
    const toggleBtn      = document.getElementById('toggle-extension');
    const content        = document.getElementById('extension-content');
    const icon           = toggleBtn.querySelector('.toggle-icon');
    const tabBtns        = document.querySelectorAll('.tab-btn');

    toggleBtn.addEventListener('click', () => {
        const collapsed = content.style.display === 'none';
        content.style.display = collapsed ? 'block' : 'none';
        icon.textContent      = collapsed ? '▼' : '▶';
        tabBtns.forEach(btn => {
            btn.style.pointerEvents = collapsed ? 'auto' : 'none';
            btn.classList.toggle('disabled', !collapsed);
        });
    });
}

function _wireTabs() {
    document.getElementById('citations-btn').addEventListener('click', function () {
        if (this.classList.contains('disabled')) return;
        this.classList.add('active');
        document.getElementById('citation-requests-btn').classList.remove('active');
        document.getElementById('citation-title').textContent = 'Citations';
        document.getElementById('citations-container').style.display = 'block';
        document.getElementById('citation-requests-container').style.display = 'none';
        document.getElementById('add-item-btn').textContent = '+ Add Citation';
        document.getElementById('add-form-container').style.display = 'none';
        loadCitations();
    });

    document.getElementById('citation-requests-btn').addEventListener('click', function () {
        if (this.classList.contains('disabled')) return;
        this.classList.add('active');
        document.getElementById('citations-btn').classList.remove('active');
        document.getElementById('citation-title').textContent = 'Citation Requests';
        document.getElementById('citations-container').style.display = 'none';
        document.getElementById('citation-requests-container').style.display = 'block';
        document.getElementById('add-item-btn').textContent = '+ Add Request';
        document.getElementById('add-form-container').style.display = 'none';
        loadCitationRequests();
    });
}

function _wireAddButton() {
    document.getElementById('add-item-btn').addEventListener('click', () => {
        const formContainer  = document.getElementById('add-form-container');
        const addBtn         = document.getElementById('add-item-btn');
        const isRequestsTab  = document.getElementById('citation-requests-container').style.display === 'block';

        if (formContainer.style.display === 'none') {
            formContainer.style.display = 'block';
            addBtn.textContent = isRequestsTab ? '- Add Request' : '- Add Citation';
            if (isRequestsTab) {
                loadPage('forms/youtube_extension_request.html', 'add-form-container', initializeRequestForm);
            } else {
                loadPage('forms/youtube_extension_citation.html', 'add-form-container', initializeCitationForm);
            }
        } else {
            formContainer.style.display = 'none';
            addBtn.textContent = isRequestsTab ? '+ Add Request' : '+ Add Citation';
        }
    });
}

function _wireSortMenu() {
    const sortBtn  = document.querySelector('.sort-button');
    const sortMenu = document.querySelector('.sort-menu');

    sortBtn.addEventListener('click', e => {
        e.stopPropagation();
        const visible = sortMenu.style.display === 'block';
        sortMenu.style.display = visible ? 'none' : 'block';
        sortBtn.classList.toggle('active', !visible);
    });

    sortMenu.addEventListener('click', e => {
        const item = e.target.closest('.sort-menu-item');
        if (!item) return;

        currentSortOption = item.dataset.value;

        // Update checkmark
        sortMenu.querySelectorAll('.sort-menu-item').forEach(el => {
            el.innerHTML = `
                <span class="sort-menu-text">${el.dataset.value === 'upvotes' ? 'Most Upvoted' : 'Newest first'}</span>
                ${el.dataset.value === currentSortOption ? '<span class="sort-check">✓</span>' : ''}
            `;
        });

        sortMenu.style.display = 'none';
        sortBtn.classList.remove('active');

        const citContainer = document.getElementById('citations-container');
        const reqContainer = document.getElementById('citation-requests-container');
        if (citContainer?.style.display === 'block') loadCitations();
        else if (reqContainer?.style.display === 'block') loadCitationRequests();
    });

    document.addEventListener('click', e => {
        if (!e.target.closest('.sort-container')) {
            sortMenu.style.display = 'none';
            sortBtn.classList.remove('active');
        }
    });
}