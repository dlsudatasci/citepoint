// Function to attach event listeners for forms
function setupFormListeners() {
    const form = document.getElementById('citation-form');
    if (form && !form.dataset.listener) {
        form.dataset.listener = "true"; // Prevent duplicate event listeners
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            alert('Citation Submitted!');
            form.reset();
        });
    }

    const requestForm = document.getElementById('request-form');
    if (requestForm && !requestForm.dataset.listener) {
        requestForm.dataset.listener = "true"; // Prevent duplicate event listeners
        requestForm.addEventListener('submit', (e) => {
            e.preventDefault();
            alert('Citation Request Submitted!');
            requestForm.reset();
        });
    }
}

// Function to handle vote updates
async function updateVote(citationId, value) {
    const videoId = await getCurrentVideoId();
    const response = await chrome.runtime.sendMessage({
        type: 'updateCitationVotes',
        videoId,
        citationId,
        voteValue: value,
        userVote: value > 0 ? 'up' : 'down'
    });

    if (response.success) {
        // Update the UI
        const voteScoreElement = document.querySelector(`#vote-score-${citationId}`);
        if (voteScoreElement) {
            voteScoreElement.textContent = value;
        }
    }
}

// Function to create vote buttons
function createVoteButtons(citation) {
    const voteContainer = document.createElement('div');
    voteContainer.className = 'vote-container';

    const upvoteBtn = document.createElement('button');
    upvoteBtn.innerHTML = '▲';
    upvoteBtn.className = 'vote-btn upvote';
    upvoteBtn.onclick = () => updateVote(citation.id, citation.voteScore + 1);

    const voteScore = document.createElement('span');
    voteScore.id = `vote-score-${citation.id}`;
    voteScore.className = 'vote-score';
    voteScore.textContent = citation.voteScore;

    const downvoteBtn = document.createElement('button');
    downvoteBtn.innerHTML = '▼';
    downvoteBtn.className = 'vote-btn downvote';
    downvoteBtn.onclick = () => updateVote(citation.id, citation.voteScore - 1);

    voteContainer.appendChild(upvoteBtn);
    voteContainer.appendChild(voteScore);
    voteContainer.appendChild(downvoteBtn);

    return voteContainer;
}

// Run `setupFormListeners()` after the page is fully loaded
document.addEventListener("DOMContentLoaded", () => {
    setupFormListeners();
});
