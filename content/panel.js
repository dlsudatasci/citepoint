// ─────────────────────────────────────────────
// panel.js
// Builds the citation sidebar panel DOM,
// wires up tabs, sort menu, toggle, and add button.
// Depends on: citations.js, forms.js, utils.js
// ─────────────────────────────────────────────

let storedSecondaryWidth = 0;

// ── Panel construction ────────────────────────

function insertCitationButtons() {
    const secondary = _getSecondaryColumn();
    if (!secondary) { console.log('[panel] Secondary element not found'); return; }

    storedSecondaryWidth = secondary.offsetWidth;

    const panel = document.createElement('div');
    panel.id        = 'citation-controls';
    panel.className = 'citation-controls';
    panel.style.width = storedSecondaryWidth + 'px';
    
    if (typeof _currentTheme !== 'undefined' && _currentTheme !== 'light') {
        panel.setAttribute('data-cp-theme', _currentTheme);
    }

    panel.innerHTML = `
        <div class="extension-header" id="extension-header">
            <span class="minimized-logo">CitePoint</span>
            <div class="button-container" id="tab-container" role="tablist">
                <button id="citation-requests-btn" class="tab-btn cp-tab disabled" role="tab" aria-selected="false" aria-controls="citation-requests-container">
                    Citation Requests
                    <span class="tab-counter" id="requests-counter">0</span>
                </button>
                <button id="citations-btn" class="tab-btn cp-tab disabled" role="tab" aria-selected="true" aria-controls="citations-container">
                    Citations
                    <span class="tab-counter" id="citations-counter">0</span>
                </button>
            </div>
            <hr class="minimized-divider">
            <button id="toggle-extension" class="minimized-expand-btn" title="Expand CitePoint">
                <span class="toggle-icon" id="toggle-icon">▼</span>
            </button>
        </div>
        <div id="extension-content" class="extension-content" style="display:none;">
            <div class="header-actions">
                <button id="add-item-btn" class="add-btn">+ Add Citation</button>
                <div class="category-filter-container">
                    <button class="category-filter-button">
                        <span class="category-filter-text">All categories</span>
                        <span class="category-filter-caret">
                            <svg viewBox="0 0 24 24" width="18" height="18">
                                <path d="M7 10l5 5 5-5z" fill="currentColor"/>
                            </svg>
                        </span>
                    </button>
                    <div class="category-filter-menu" style="display:none;">
                        <button class="category-filter-item" data-value="">
                            <span class="category-filter-item-text">All categories</span>
                            <span class="category-filter-check">✓</span>
                        </button>
                        ${CATEGORIES.map(c => `
                        <button class="category-filter-item" data-value="${_escapeHtml(c)}">
                            <span class="category-filter-item-text">${_escapeHtml(c)}</span>
                        </button>`).join('')}
                        <button class="category-filter-item" data-value="${DEFAULT_CATEGORY}">
                            <span class="category-filter-item-text">${DEFAULT_CATEGORY}</span>
                        </button>
                    </div>
                </div>
                <div class="sort-container">
                    <button class="sort-button">
                        <span class="sort-icon">
                            <svg viewBox="0 0 24 24" width="18" height="18">
                                <path d="M21,6H3V5h18V6z M15,11H3v1h12V11z M9,17H3v1h6V17z" fill="currentColor"/>
                            </svg>
                        </span>
                        <span class="sort-text">Sort</span>
                        <span class="sort-caret">
                            <svg viewBox="0 0 24 24" width="18" height="18">
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
                <button id="open-dashboard-btn" class="dashboard-btn" title="Open Dashboard">
                    <svg viewBox="0 0 24 24" width="16" height="16">
                        <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" fill="currentColor"/>
                    </svg>
                </button>
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
    _wireCategoryFilter();
    _wireDashboardButton();


    // Load initial data then start polling
    document.getElementById('citations-btn').classList.add('active');
    document.getElementById('citations-container').style.display = 'block';
    _votesLoaded = false;
    _votesVideoId = null;
    _citationsLoading = false;
    loadCitationCount();
    loadRequestCount();
    loadCitations();
    startPolling();

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopPolling();
        else startPolling();
    });
}

// ── Theater mode ──────────────────────────────

function _isTheaterMode() {
    const flexy = document.querySelector('ytd-watch-flexy');
    if (!flexy) return false;

    if (flexy.hasAttribute('theater')) return true;
    if (flexy.classList.contains('theater-mode') ||
        flexy.classList.contains('ytd-watch-flexy--theater')) return true;

    const player = document.querySelector('#ytd-player, #movie_player');
    if (player && player.getBoundingClientRect().width > window.innerWidth * 0.75) return true;

    return false;
}

function _getSecondaryColumn() {
    return (
        document.querySelector('div#secondary.style-scope.ytd-watch-flexy') ||
        document.querySelector('#secondary') ||
        document.querySelector('ytd-watch-flexy [id="secondary"]') ||
        null
    );
}

function _getPlayerContainer() {
    return (
        document.querySelector('#ytd-player') ||
        document.querySelector('#movie_player') ||
        document.querySelector('ytd-player') ||
        null
    );
}

function observeTheaterMode() {
    const ytdWatchFlexy = document.querySelector('ytd-watch-flexy');
    if (!ytdWatchFlexy) {
        console.warn('[panel] ytd-watch-flexy not found — theater mode observation skipped');
        return;
    }

    new MutationObserver(() => {
        const isTheater = _isTheaterMode();
        const ccDiv     = document.getElementById('citation-controls');
        if (!ccDiv) return;

        const secondary = _getSecondaryColumn();
        if (!secondary) {
            console.warn('[panel] Could not find secondary column');
            return;
        }

        // Always keep panel inside #secondary — just toggle sticky pinning
        secondary.insertBefore(ccDiv, secondary.firstChild);
        if (isTheater) {
            ccDiv.classList.add('theater-mode');
            ccDiv.style.position = 'relative'; 
            ccDiv.style.top = 'auto';   
        } else {
            ccDiv.classList.remove('theater-mode');
            ccDiv.style.cssText = '';
        }
        ccDiv.style.width = storedSecondaryWidth + 'px';
    }).observe(ytdWatchFlexy, {
        attributes: true,
        attributeFilter: ['theater', 'class'],
    });
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
    const content      = document.getElementById('extension-content');
    const toggleBtn    = document.getElementById('toggle-extension');
    const icon         = document.getElementById('toggle-icon');
    const header       = document.getElementById('extension-header');
    const requestsBtn  = document.getElementById('citation-requests-btn');
    const citationsBtn = document.getElementById('citations-btn');
    let expanded       = false;

    function toggle() {
        expanded = !expanded;
        if (expanded) {
            content.style.display = 'block';
            icon.textContent      = '▲';
            header.classList.add('expanded');
            requestsBtn.classList.remove('disabled');
            citationsBtn.classList.remove('disabled');
            startPolling();
        } else {
            content.style.display = 'none';
            icon.textContent      = '▼';
            header.classList.remove('expanded');
            requestsBtn.classList.add('disabled');
            citationsBtn.classList.add('disabled');
            stopPolling();
        }
    }

    toggleBtn.addEventListener('click', toggle);
}

function _updateMinimizedCounts() {
    // Counts are shown directly in tab counters which are always visible — no-op
}

function _wireTabs() {
    document.getElementById('citations-btn').addEventListener('click', function () {
        if (this.classList.contains('disabled')) return;
        this.classList.add('active');
        this.setAttribute('aria-selected', 'true');
        const requestsBtn = document.getElementById('citation-requests-btn');
        requestsBtn.classList.remove('active');
        requestsBtn.setAttribute('aria-selected', 'false');
        document.getElementById('citations-container').style.display = 'block';
        document.getElementById('citation-requests-container').style.display = 'none';
        document.getElementById('add-item-btn').textContent = '+ Add Citation';
        document.getElementById('add-form-container').style.display = 'none';
        // Always fetch fresh on tab switch — silent only if data already loaded
        _votesLoaded = false;
        _votesVideoId = null;
        loadCitations(1, currentCitations.length > 0);
    });

    document.getElementById('citation-requests-btn').addEventListener('click', function () {
        if (this.classList.contains('disabled')) return;
        this.classList.add('active');
        this.setAttribute('aria-selected', 'true');
        const citationsBtn = document.getElementById('citations-btn');
        citationsBtn.classList.remove('active');
        citationsBtn.setAttribute('aria-selected', 'false');
        document.getElementById('citations-container').style.display = 'none';
        document.getElementById('citation-requests-container').style.display = 'block';
        document.getElementById('add-item-btn').textContent = '+ Add Request';
        document.getElementById('add-form-container').style.display = 'none';
        loadCitationRequests(1, currentRequests.length > 0);
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

        sortMenu.querySelectorAll('.sort-menu-item').forEach(el => {
            el.innerHTML = `
                <span class="sort-menu-text">${el.dataset.value === 'upvotes' ? 'Most Upvoted' : 'Newest first'}</span>
                ${el.dataset.value === currentSortOption ? '<span class="sort-check">✓</span>' : ''}
            `;
        });

        sortMenu.style.display = 'none';
        sortBtn.classList.remove('active');

        // Re-sort in-memory — no network call, no skeleton flash
        debouncedSortAndUpdate();
    });

    document.addEventListener('click', e => {
        if (!e.target.closest('.sort-container')) {
            sortMenu.style.display = 'none';
            sortBtn.classList.remove('active');
        }
    });
}

// ── Category filter ───────────────────────────

function _wireCategoryFilter() {
    const filterBtn  = document.querySelector('.category-filter-button');
    const filterMenu = document.querySelector('.category-filter-menu');
    const filterText = document.querySelector('.category-filter-text');

    filterBtn.addEventListener('click', e => {
        e.stopPropagation();
        const visible = filterMenu.style.display === 'block';
        filterMenu.style.display = visible ? 'none' : 'block';
        filterBtn.classList.toggle('active', !visible);
    });

    filterMenu.addEventListener('click', e => {
        const item = e.target.closest('.category-filter-item');
        if (!item) return;

        _currentCategoryFilter = item.dataset.value;
        filterText.textContent = item.dataset.value || 'All categories';

        filterMenu.querySelectorAll('.category-filter-item').forEach(el => {
            const check = el.querySelector('.category-filter-check');
            if (check) check.remove();
            if (el.dataset.value === _currentCategoryFilter) {
                el.querySelector('.category-filter-item-text').insertAdjacentHTML(
                    'afterend', '<span class="category-filter-check">✓</span>'
                );
            }
        });

        filterMenu.style.display = 'none';
        filterBtn.classList.remove('active');

        _applyCategoryFilter();
    });

    document.addEventListener('click', e => {
        if (!e.target.closest('.category-filter-container')) {
            filterMenu.style.display = 'none';
            filterBtn.classList.remove('active');
        }
    });
}

function _applyCategoryFilter() {
    const filter = _currentCategoryFilter;

    document.querySelectorAll('#citations-container > .citation-item, #citation-requests-container > .citation-item').forEach(item => {
        if (item.classList.contains('request-response-group')) {
            let anyVisible = !filter || item.dataset.category === filter;
            item.querySelectorAll('.rg-response-entry').forEach(r => {
                const match = !filter || r.dataset.category === filter;
                r.style.display = match ? '' : 'none';
                if (match) anyVisible = true;
            });
            item.style.display = anyVisible ? '' : 'none';
        } else {
            const match = !filter || item.dataset.category === filter;
            item.style.display = match ? '' : 'none';
        }
    });
}

// ── Dashboard ──────────────────────────────────

function _wireDashboardButton() {
    document.getElementById('open-dashboard-btn').addEventListener('click', () => {
        window.open(chrome.runtime.getURL('dashboard/dashboard.html'), '_blank');
    });
}

