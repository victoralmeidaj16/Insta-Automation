# 🤖 AI Instructions - Project Context

This file serves as a comprehensive context-setting document for any AI assistant working on the **Insta-Automation** project.

## 📝 Project Overview
**Insta-Automation** is a platform for Instagram growth focused on high-end, editorial-style content. It uses Puppeteer for humanized automation and Gemini/OpenAI for content generation and refinement.

### Tech Stack:
- **Frontend:** Next.js (React), Tailwind CSS.
- **Backend:** Node.js (Express), Puppeteer.
- **Database/Cloud:** Firebase (Firestore, Storage, Auth).
- **AI Engines:** Google Gemini API (Imagen 3), OpenAI (GPT-4o).

## 🎨 Core Design Logic

### Aspect Ratio Enforcement
The platform enforces ideal Instagram dimensions:
- **Feed (Static/Carousel):** 4:5 ratio (1080x1350). *Note: Gemini maps this to 3:4.*
- **Stories:** 9:16 ratio (1080x1920).
- **Threshold:** The UI allows for up to **10% deviation** before showing a warning.

### Image Reformatting (The "Magic Wand")
- **Feature:** Recreate images at the target ratio without cropping.
- **Method:** Image-to-image pipeline via Gemini.
- **Prompt Logic:** Keep 100% of original content, extend the background/edges intelligently to fill the new dimensions.

### "Inner Boost" Branding
- Specific logic for "Inner Boost" profile:
  - Automatically attaches the logo during AI refinement.
  - Pre-configures prompts for "Editorial Dark Psychology" aesthetics.

## 📂 Key Files to Monitor

### Backend:
- `src/routes/library.js`: Logic for image formatting and library management.
- `src/services/aiService.js`: Core AI generation and image-to-image calls.
- `src/services/historyService.js`: Image persistence (Storage) and Firestore updates.

### Frontend:
- `src/app/dashboard/library/page.tsx`: Main library UI, dimension detection, and formatting triggers.

---

## 🚀 Copy-Paste Startup Prompt for AI
*Give this to the AI at the start of a new session:*

> "I am working on **Insta-Automation**, a Next.js/Node.js/Firebase project. 
> 
> **Key Rules:**
> 1. Focus on **Editorial Aesthetic** (Dark Psychology/Premium).
> 2. Aspect ratios: **4:5 (Feed)** and **9:16 (Story)**.
> 3. Use **Gemini Imagen 3** for image-to-image reformatting (extending edges, no cropping).
> 4. The Library UI uses a **10% threshold** for 'Out of Format' detection.
> 5. **Inner Boost** profile has special logo-attachment rules.
> 
> Please read `README.md` and `AI_INSTRUCTIONS.md` for full implementation details before proposing changes."
