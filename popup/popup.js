// Add event listener for when the popup DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add click event to open YouTube in a new tab
    const openYouTubeBtn = document.getElementById('open-youtube');
    if (openYouTubeBtn) {
        openYouTubeBtn.addEventListener('click', function() {
            chrome.tabs.create({ url: 'https://www.youtube.com' });
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
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const activeTab = tabs[0];
        const isYouTube = activeTab.url.includes('youtube.com/watch');
        
        // Show a message if not on YouTube video page
        const notOnYouTubeMsg = document.getElementById('not-on-youtube');
        if (notOnYouTubeMsg) {
            notOnYouTubeMsg.style.display = isYouTube ? 'none' : 'block';
        }
    });
}); 