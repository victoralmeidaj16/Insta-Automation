
import { generateVariations } from '../../services/aiService.js';

export const generatePostVariations = async (req, res) => {
    try {
        const { baseIdea, count, profileContext } = req.body;

        if (!baseIdea) {
            return res.status(400).json({ error: 'Base idea is required' });
        }

        const variations = await generateVariations(baseIdea, count || 3, profileContext || {});

        res.status(200).json({ variations });
    } catch (error) {
        console.error('Error generating variations:', error);
        res.status(500).json({ error: 'Failed to generate variations' });
    }
};
