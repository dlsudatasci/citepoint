const Expert       = require('../models/Expert');
const UserProfile  = require('../models/UserProfile');
const Notification = require('../models/Notification');

// NOTE: Expert.topics is a subject-matter taxonomy (e.g. "History"), while `category`
// here is a claim-type taxonomy (e.g. "Quote / Misattribution") — they're different
// dimensions (see backend/config/constants.js). Citations/requests aren't currently
// run through the topic-classification pipeline (only backend/routes/videos.js is),
// so this match against Expert.topics will find no experts until that's wired up.
// Kept as `category` (not silently dropped) so this starts working the moment
// citation/request topic classification lands, without another schema change here.
async function notifyExpertsForCategory(category, { videoId, itemId, itemType, title, excludeUsername }) {
    try {
        const experts = await Expert.find({ topics: category }).lean();

        const notifications = [];
        for (const expert of experts) {
            if (expert.username === excludeUsername) continue;

            // Check if expert has muted this category
            const profile = await UserProfile.findOne({ username: expert.username }).lean();
            const muted = profile?.mutedTopics || [];
            if (muted.includes(category)) continue;

            notifications.push({
                username: expert.username,
                type:     itemType === 'citation' ? 'new_citation' : 'new_request',
                category,
                videoId,
                itemId,
                itemType,
                title:    title || `New ${itemType} in ${category}`,
            });
        }

        if (notifications.length > 0) {
            await Notification.insertMany(notifications);
        }
    } catch (err) {
        console.error('[notifyExperts] Error:', err);
    }
}

module.exports = { notifyExpertsForCategory };
