// browser-polyfill.js (loaded before this file) makes `browser` available with a
// Promise-based API in both Chrome and Firefox — prefer it, falling back to the
// native `chrome` callback API only if the polyfill somehow didn't load.
const _ext = (typeof browser !== 'undefined' && browser.tabs) ? browser : chrome;

// Add event listener for when the popup DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add click event to open YouTube in a new tab
    const openYouTubeBtn = document.getElementById('open-youtube');
    if (openYouTubeBtn) {
        openYouTubeBtn.addEventListener('click', function() {
            _ext.tabs.create({ url: 'https://www.youtube.com' });
        });
    }

    const openDashboardBtn = document.getElementById('open-dashboard');
    if (openDashboardBtn) {
        openDashboardBtn.addEventListener('click', function() {
            _ext.tabs.create({ url: _ext.runtime.getURL('dashboard/dashboard.html') });
        });
    }

    // Theme Selector Logic
    if (typeof initTheme === 'function') initTheme();
    
    const themeSelector = document.getElementById('theme-selector');
    if (themeSelector && typeof AVAILABLE_THEMES !== 'undefined') {
        AVAILABLE_THEMES.forEach(theme => {
            const option = document.createElement('option');
            option.value = theme.id;
            option.textContent = theme.label;
            themeSelector.appendChild(option);
        });

        chrome.storage.local.get('theme', (res) => {
            themeSelector.value = res.theme || 'light';
        });

        themeSelector.addEventListener('change', (e) => {
            chrome.storage.local.set({ theme: e.target.value });
        });
        
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.theme) {
                themeSelector.value = changes.theme.newValue || 'light';
            }
        });
    }

    // Collapse/expand sections if needed
    const featureHeadings = document.querySelectorAll('.feature h2');
    featureHeadings.forEach(heading => {
        heading.addEventListener('click', function() {
            const content = this.nextElementSibling;
            const feature = this.parentElement;
            
            // Toggle expanded class
            feature.classList.toggle('expanded');
            
            // Toggle visibility of steps and tips
            const steps = feature.querySelector('.steps');
            const tip = feature.querySelector('.tip');
            
            if (steps) {
                steps.style.display = steps.style.display === 'none' ? 'block' : 'none';
            }
            
            if (tip) {
                tip.style.display = tip.style.display === 'none' ? 'block' : 'none';
            }
        });
    });

    // Check if extension is being used on YouTube
    _ext.tabs.query({ active: true, currentWindow: true }).then(function(tabs) {
        const activeTab = tabs[0];
        const isYouTube = !!activeTab?.url?.includes('youtube.com/watch');

        // Show a message if not on YouTube video page
        const notOnYouTubeMsg = document.getElementById('not-on-youtube');
        if (notOnYouTubeMsg) {
            notOnYouTubeMsg.style.display = isYouTube ? 'none' : 'block';
        }
    });
}); 