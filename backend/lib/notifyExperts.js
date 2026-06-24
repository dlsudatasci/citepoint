const Expert       = require('../models/Expert');
const UserProfile  = require('../models/UserProfile');
const Notification = require('../models/Notification');

async function notifyExpertsForCategory(category, { videoId, itemId, itemType, title, excludeUsername }) {
    try {
        const experts = await Expert.find({ categories: category }).lean();

        const notifications = [];
        for (const expert of experts) {
            if (expert.username === excludeUsername) continue;

            // Check if expert has muted this category
            const profile = await UserProfile.findOne({ username: expert.username }).lean();
            const muted = profile?.mutedCategories || [];
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
