'use client';

import React from 'react';
import api from '@/lib/api';

// ─── Mini SVG previews — 54×68px (4:5 ratio) for each template ───────────────

function PreviewBold() {
  return (
    <svg width="54" height="68" viewBox="0 0 54 68" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="54" height="68" fill="#060810"/>
      {/* blue glow blob */}
      <ellipse cx="27" cy="22" rx="22" ry="16" fill="#3b82f6" fillOpacity="0.18"/>
      {/* top eyebrow */}
      <rect x="8" y="9" width="14" height="2" rx="1" fill="#3b82f6" fillOpacity="0.7"/>
      {/* big impact number */}
      <text x="27" y="34" textAnchor="middle" fontFamily="serif" fontSize="22" fontWeight="bold" fill="#fff">93%</text>
      {/* subtext lines */}
      <rect x="10" y="38" width="34" height="2" rx="1" fill="#ffffff" fillOpacity="0.25"/>
      <rect x="14" y="43" width="26" height="2" rx="1" fill="#ffffff" fillOpacity="0.15"/>
      {/* bottom brand line */}
      <rect x="8" y="58" width="10" height="1.5" rx="0.75" fill="#3b82f6" fillOpacity="0.6"/>
      <rect x="21" y="57.5" width="25" height="2" rx="1" fill="#ffffff" fillOpacity="0.2"/>
    </svg>
  );
}

function PreviewEditorial() {
  return (
    <svg width="54" height="68" viewBox="0 0 54 68" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* top half dark */}
      <rect width="54" height="34" fill="#0f1117"/>
      {/* bottom half light */}
      <rect y="34" width="54" height="34" fill="#f4f4f5"/>
      {/* tag */}
      <rect x="8" y="8" width="14" height="4" rx="2" fill="#3b82f6"/>
      {/* headline dark */}
      <rect x="8" y="16" width="30" height="3" rx="1.5" fill="#ffffff" fillOpacity="0.9"/>
      <rect x="8" y="22" width="22" height="2.5" rx="1.25" fill="#ffffff" fillOpacity="0.6"/>
      {/* stats row */}
      <rect x="8" y="28" width="8" height="3" rx="1.5" fill="#3b82f6" fillOpacity="0.8"/>
      <rect x="19" y="28" width="8" height="3" rx="1.5" fill="#3b82f6" fillOpacity="0.8"/>
      <rect x="30" y="28" width="8" height="3" rx="1.5" fill="#3b82f6" fillOpacity="0.8"/>
      {/* headline light */}
      <rect x="8" y="40" width="26" height="3" rx="1.5" fill="#18181b" fillOpacity="0.8"/>
      <rect x="8" y="46" width="18" height="2.5" rx="1.25" fill="#18181b" fillOpacity="0.4"/>
      {/* grid items */}
      <rect x="8" y="53" width="17" height="7" rx="2" fill="#18181b" fillOpacity="0.08" stroke="#18181b" strokeWidth="0.5" strokeOpacity="0.2"/>
      <rect x="29" y="53" width="17" height="7" rx="2" fill="#18181b" fillOpacity="0.08" stroke="#18181b" strokeWidth="0.5" strokeOpacity="0.2"/>
    </svg>
  );
}



function PreviewEditorialSci() {
  return (
    <svg width="54" height="68" viewBox="0 0 54 68" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* dark bg */}
      <rect width="54" height="68" fill="#050a10"/>
      {/* hero image area */}
      <rect x="0" y="0" width="54" height="44" fill="#0a1a2a"/>
      <rect x="8" y="6" width="38" height="32" rx="3" fill="#0d2035"/>
      {/* cyan accent lines */}
      <line x1="8" y1="6" x2="8" y2="38" stroke="#00e5ff" strokeWidth="1.5" strokeOpacity="0.7"/>
      {/* image placeholder cross */}
      <line x1="20" y1="14" x2="34" y2="28" stroke="#00e5ff" strokeWidth="0.5" strokeOpacity="0.25"/>
      <line x1="34" y1="14" x2="20" y2="28" stroke="#00e5ff" strokeWidth="0.5" strokeOpacity="0.25"/>
      {/* bottom headline bar */}
      <rect y="44" width="54" height="24" fill="#0d1a26"/>
      <rect x="6" y="49" width="32" height="3" rx="1.5" fill="#fff" fillOpacity="0.85"/>
      <rect x="6" y="55" width="20" height="2" rx="1" fill="#00e5ff" fillOpacity="0.7"/>
      <rect x="6" y="60" width="26" height="1.5" rx="0.75" fill="#fff" fillOpacity="0.25"/>
    </svg>
  );
}

function PreviewPhoto() {
  return (
    <svg width="54" height="68" viewBox="0 0 54 68" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* full-bleed photo area */}
      <rect width="54" height="68" fill="#141414"/>
      <rect width="54" height="68" fill="url(#photoGrad)"/>
      <defs>
        <linearGradient id="photoGrad" x1="27" y1="0" x2="27" y2="68" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1a1209" stopOpacity="0.7"/>
          <stop offset="60%" stopColor="#060810" stopOpacity="0.3"/>
          <stop offset="100%" stopColor="#060810" stopOpacity="0.97"/>
        </linearGradient>
      </defs>
      {/* grain texture lines */}
      <rect x="0" y="0" width="54" height="68" fill="#c9a84c" fillOpacity="0.03"/>
      {/* portrait circle top right */}
      <circle cx="40" cy="16" r="9" fill="#1a1209" stroke="#c9a84c" strokeWidth="1" strokeOpacity="0.6"/>
      <circle cx="40" cy="14" r="5" fill="#2a1e0e" fillOpacity="0.8"/>
      {/* gold accent bar */}
      <rect x="8" y="44" width="3" height="1.5" rx="0.75" fill="#c9a84c"/>
      <rect x="14" y="44" width="16" height="1.5" rx="0.75" fill="#fff" fillOpacity="0.5"/>
      {/* bottom title */}
      <rect x="8" y="49" width="30" height="3" rx="1.5" fill="#fff" fillOpacity="0.9"/>
      <rect x="8" y="55" width="22" height="2.5" rx="1.25" fill="#fff" fillOpacity="0.55"/>
      {/* gold divider */}
      <line x1="8" y1="62" x2="24" y2="62" stroke="#c9a84c" strokeWidth="0.75" strokeOpacity="0.6"/>
      <circle cx="27" cy="62" r="1" fill="#c9a84c" fillOpacity="0.6"/>
      <line x1="30" y1="62" x2="46" y2="62" stroke="#c9a84c" strokeWidth="0.75" strokeOpacity="0.6"/>
    </svg>
  );
}

function PreviewMoodboard() {
  return (
    <svg width="54" height="68" viewBox="0 0 54 68" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* dark background */}
      <rect width="54" height="68" fill="#0c0b09"/>
      {/* big polaroid rotated */}
      <g transform="rotate(-7 27 34)">
        <rect x="6" y="8" width="26" height="30" rx="1.5" fill="#e8e0d0" stroke="#d4c9b0" strokeWidth="0.5"/>
        <rect x="9" y="11" width="20" height="20" rx="1" fill="#c4a882" fillOpacity="0.4"/>
        <rect x="9" y="11" width="20" height="20" rx="1" fill="url(#mbGrad)"/>
        <defs>
          <linearGradient id="mbGrad" x1="19" y1="11" x2="19" y2="31">
            <stop stopColor="#c4a882" stopOpacity="0.3"/>
            <stop offset="1" stopColor="#6b4c2a" stopOpacity="0.5"/>
          </linearGradient>
        </defs>
        <rect x="9" y="33" width="20" height="3" rx="0.5" fill="#f5f0e8"/>
      </g>
      {/* small polaroid right */}
      <g transform="rotate(5 40 30)">
        <rect x="30" y="20" width="18" height="22" rx="1.5" fill="#e8e0d0" stroke="#d4c9b0" strokeWidth="0.5"/>
        <rect x="33" y="23" width="12" height="14" rx="1" fill="#b85c38" fillOpacity="0.3"/>
        <rect x="33" y="38" width="12" height="2" rx="0.5" fill="#f5f0e8"/>
      </g>
      {/* film strip left */}
      <rect x="3" y="42" width="8" height="20" rx="1" fill="#1c1a17"/>
      <rect x="4" y="44" width="6" height="4" rx="0.5" fill="#c4a882" fillOpacity="0.3"/>
      <rect x="4" y="50" width="6" height="4" rx="0.5" fill="#c4a882" fillOpacity="0.3"/>
      <rect x="4" y="56" width="6" height="4" rx="0.5" fill="#c4a882" fillOpacity="0.3"/>
      {/* bottom text */}
      <rect x="14" y="55" width="20" height="2.5" rx="1.25" fill="#f5f0e8" fillOpacity="0.7"/>
      <rect x="14" y="60" width="14" height="1.5" rx="0.75" fill="#c9a84c" fillOpacity="0.7"/>
    </svg>
  );
}

function PreviewInstagram() {
  return (
    <svg width="54" height="68" viewBox="0 0 54 68" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* instagram card white bg */}
      <rect width="54" height="68" rx="4" fill="#fff"/>
      {/* header */}
      <rect y="0" width="54" height="12" rx="4" fill="#fafafa"/>
      <rect y="6" width="54" height="6" fill="#fafafa"/>
      {/* avatar */}
      <circle cx="9" cy="6" r="4" fill="#e0e0e0"/>
      <circle cx="9" cy="5" r="2" fill="#bdbdbd"/>
      {/* handle text */}
      <rect x="16" y="4" width="14" height="2" rx="1" fill="#262626" fillOpacity="0.7"/>
      <rect x="16" y="8" width="10" height="1.5" rx="0.75" fill="#8e8e8e" fillOpacity="0.7"/>
      {/* slide area gradient */}
      <rect x="0" y="12" width="54" height="40" fill="#f0f0f0"/>
      <rect x="0" y="12" width="54" height="40" fill="url(#igGrad)"/>
      <defs>
        <linearGradient id="igGrad" x1="27" y1="12" x2="27" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#C9A84C" stopOpacity="0.15"/>
          <stop offset="100%" stopColor="#1a0533" stopOpacity="0.7"/>
        </linearGradient>
      </defs>
      {/* slide content */}
      <rect x="8" y="26" width="22" height="3" rx="1.5" fill="#fff" fillOpacity="0.9"/>
      <rect x="8" y="32" width="32" height="2" rx="1" fill="#fff" fillOpacity="0.6"/>
      <rect x="8" y="37" width="18" height="2" rx="1" fill="#fff" fillOpacity="0.4"/>
      {/* progress dots */}
      <circle cx="22" cy="50" r="1.5" fill="#C9A84C"/>
      <circle cx="27" cy="50" r="1" fill="#fff" fillOpacity="0.4"/>
      <circle cx="31" cy="50" r="1" fill="#fff" fillOpacity="0.4"/>
      {/* ig actions */}
      <rect x="4" y="55" width="6" height="1.5" rx="0.75" fill="#262626" fillOpacity="0.5"/>
      <rect x="12" y="55" width="6" height="1.5" rx="0.75" fill="#262626" fillOpacity="0.5"/>
      <rect x="20" y="55" width="6" height="1.5" rx="0.75" fill="#262626" fillOpacity="0.5"/>
      <rect x="42" y="55" width="6" height="1.5" rx="0.75" fill="#262626" fillOpacity="0.5"/>
      {/* caption */}
      <rect x="4" y="60" width="30" height="1.5" rx="0.75" fill="#262626" fillOpacity="0.35"/>
      <rect x="4" y="64" width="20" height="1.5" rx="0.75" fill="#8e8e8e" fillOpacity="0.4"/>
    </svg>
  );
}

function PreviewComparison() {
  return (
    <svg width="54" height="68" viewBox="0 0 54 68" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="54" height="68" fill="#06060e"/>
      {/* grid hint */}
      <rect width="54" height="68" fill="#6366f1" fillOpacity="0.03"/>
      {/* eyebrow */}
      <rect x="8" y="7" width="10" height="1.5" rx="0.75" fill="#6366f1" fillOpacity="0.8"/>
      {/* headline */}
      <rect x="8" y="12" width="28" height="2.5" rx="1.25" fill="#fff" fillOpacity="0.85"/>
      <rect x="8" y="17" width="20" height="2" rx="1" fill="#fff" fillOpacity="0.4"/>
      {/* before frame */}
      <rect x="6" y="23" width="19" height="33" rx="3" fill="#111" stroke="rgba(255,255,255,0.12)" strokeWidth="0.75"/>
      <rect x="7" y="24" width="17" height="26" rx="2" fill="#1c1c2e" fillOpacity="0.7"/>
      {/* X cross for before image placeholder */}
      <line x1="9" y1="26" x2="22" y2="47" stroke="#fff" strokeWidth="0.4" strokeOpacity="0.15"/>
      <line x1="22" y1="26" x2="9" y2="47" stroke="#fff" strokeWidth="0.4" strokeOpacity="0.15"/>
      {/* before label */}
      <rect x="9" y="51" width="13" height="3" rx="1.5" fill="rgba(255,255,255,0.07)"/>
      <rect x="11" y="52" width="9" height="1.5" rx="0.75" fill="#fff" fillOpacity="0.3"/>
      {/* after frame — branded */}
      <rect x="29" y="23" width="19" height="33" rx="3" fill="#111" stroke="#6366f1" strokeWidth="1"/>
      <rect x="30" y="24" width="17" height="26" rx="2" fill="#1a1a30" fillOpacity="0.7"/>
      {/* glow on after */}
      <rect x="29" y="23" width="19" height="33" rx="3" fill="#6366f1" fillOpacity="0.06"/>
      {/* check mark for after */}
      <text x="38.5" y="40" textAnchor="middle" fontSize="10" fill="#818cf8" fillOpacity="0.7">✦</text>
      {/* after label */}
      <rect x="31" y="51" width="13" height="3" rx="1.5" fill="rgba(99,102,241,0.2)"/>
      <rect x="33" y="52" width="9" height="1.5" rx="0.75" fill="#818cf8" fillOpacity="0.6"/>
      {/* nav dot */}
      <circle cx="27" cy="63" r="2" fill="#6366f1" fillOpacity="0.7"/>
      <circle cx="33" cy="63" r="1" fill="#fff" fillOpacity="0.2"/>
      <circle cx="38" cy="63" r="1" fill="#fff" fillOpacity="0.2"/>
    </svg>
  );
}

function PreviewFitswapSwap() {
  return (
    <svg width="54" height="68" viewBox="0 0 54 68" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* light bg */}
      <rect width="54" height="68" fill="#f8faf5"/>
      {/* brand dot + name */}
      <circle cx="8" cy="7" r="2" fill="#A6F000"/>
      <rect x="12" y="5.5" width="16" height="2" rx="1" fill="#111827" fillOpacity="0.5"/>
      {/* headline */}
      <rect x="6" y="13" width="30" height="3" rx="1.5" fill="#111827" fillOpacity="0.85"/>
      <rect x="6" y="18" width="20" height="2" rx="1" fill="#111827" fillOpacity="0.35"/>
      {/* dual food frames */}
      <rect x="5" y="23" width="20" height="28" rx="3" fill="#e8ede4" stroke="#111827" strokeWidth="0.5" strokeOpacity="0.15"/>
      <rect x="6" y="24" width="18" height="22" rx="2" fill="#d4dbd0" fillOpacity="0.6"/>
      <line x1="8" y1="26" x2="22" y2="43" stroke="#fff" strokeWidth="0.4" strokeOpacity="0.4"/>
      <line x1="22" y1="26" x2="8" y2="43" stroke="#fff" strokeWidth="0.4" strokeOpacity="0.4"/>
      <rect x="6" y="46" width="18" height="4" rx="1.5" fill="rgba(17,24,39,0.06)"/>
      <rect x="9" y="47.5" width="12" height="1.5" rx="0.75" fill="#111827" fillOpacity="0.3"/>
      {/* after frame — lime accent */}
      <rect x="29" y="23" width="20" height="28" rx="3" fill="#e8ede4" stroke="#A6F000" strokeWidth="1.5"/>
      <rect x="30" y="24" width="18" height="22" rx="2" fill="#c8e89a" fillOpacity="0.35"/>
      <rect x="29" y="23" width="20" height="28" rx="3" fill="#A6F000" fillOpacity="0.04"/>
      <text x="39" y="38" textAnchor="middle" fontSize="10" fill="#3d5900" fillOpacity="0.6">✦</text>
      <rect x="31" y="46" width="16" height="4" rx="1.5" fill="rgba(166,240,0,0.2)"/>
      <rect x="33" y="47.5" width="12" height="1.5" rx="0.75" fill="#3d5900" fillOpacity="0.5"/>
      {/* nav dots */}
      <rect x="18" y="62" width="12" height="2" rx="1" fill="#A6F000"/>
      <circle cx="33" cy="63" r="1.5" fill="#111827" fillOpacity="0.15"/>
      <circle cx="37" cy="63" r="1.5" fill="#111827" fillOpacity="0.15"/>
    </svg>
  );
}

function PreviewTemplate1() {
  return (
    <svg width="54" height="68" viewBox="0 0 54 68" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="54" height="68" fill="#0d0014"/>
      <rect width="54" height="68" fill="url(#t1Grad)"/>
      <defs>
        <linearGradient id="t1Grad" x1="27" y1="0" x2="27" y2="68" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ec4899" stopOpacity="0.3"/>
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.2"/>
        </linearGradient>
      </defs>
      {/* glow */}
      <ellipse cx="27" cy="20" rx="18" ry="14" fill="#ec4899" fillOpacity="0.12"/>
      <rect x="8" y="10" width="12" height="1.5" rx="0.75" fill="#ec4899" fillOpacity="0.6"/>
      <rect x="8" y="16" width="30" height="3.5" rx="1.75" fill="#fff" fillOpacity="0.85"/>
      <rect x="8" y="22" width="22" height="2.5" rx="1.25" fill="#fff" fillOpacity="0.5"/>
      <rect x="8" y="30" width="38" height="1.5" rx="0.75" fill="#fff" fillOpacity="0.2"/>
      <rect x="8" y="34" width="30" height="1.5" rx="0.75" fill="#fff" fillOpacity="0.15"/>
      <rect x="8" y="45" width="20" height="8" rx="4" fill="#ec4899" fillOpacity="0.8"/>
      <rect x="10" y="55" width="34" height="1.5" rx="0.75" fill="#fff" fillOpacity="0.15"/>
    </svg>
  );
}

function PreviewFree() {
  return (
    <svg width="54" height="68" viewBox="0 0 54 68" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="54" height="68" fill="#0d001a"/>
      <rect width="54" height="68" fill="url(#freeGrad)"/>
      <defs>
        <linearGradient id="freeGrad" x1="0" y1="0" x2="54" y2="68" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.35"/>
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.2"/>
        </linearGradient>
      </defs>
      {/* sparkle dots */}
      <circle cx="12" cy="12" r="1.5" fill="#a855f7" fillOpacity="0.8"/>
      <circle cx="42" cy="18" r="1" fill="#3b82f6" fillOpacity="0.8"/>
      <circle cx="30" cy="8" r="1" fill="#a855f7" fillOpacity="0.5"/>
      <circle cx="8" cy="32" r="0.75" fill="#a855f7" fillOpacity="0.4"/>
      <circle cx="48" cy="45" r="1" fill="#3b82f6" fillOpacity="0.5"/>
      {/* AI icon */}
      <text x="27" y="26" textAnchor="middle" fontSize="16" fill="#a855f7" fillOpacity="0.8">✦</text>
      {/* "IA" text */}
      <text x="27" y="36" textAnchor="middle" fontFamily="sans-serif" fontSize="8" fontWeight="bold" fill="#fff" fillOpacity="0.7">IA LIVRE</text>
      {/* wavy lines suggesting freedom */}
      <path d="M8 44 Q16 40 24 44 Q32 48 40 44 Q46 41 46 44" stroke="#a855f7" strokeWidth="1" strokeOpacity="0.5" fill="none"/>
      <path d="M8 50 Q18 46 27 50 Q36 54 46 50" stroke="#3b82f6" strokeWidth="1" strokeOpacity="0.4" fill="none"/>
      <rect x="12" y="56" width="30" height="1.5" rx="0.75" fill="#fff" fillOpacity="0.15"/>
    </svg>
  );
}

function PreviewTudy() {
  return (
    <svg width="54" height="68" viewBox="0 0 54 68" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* dark bg */}
      <rect width="54" height="68" fill="#0F1113"/>
      {/* blurred bg image hint */}
      <rect width="54" height="68" fill="url(#tudyBg)"/>
      <defs>
        <linearGradient id="tudyBg" x1="54" y1="0" x2="0" y2="68" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2257F5" stopOpacity="0.15"/>
          <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.1"/>
        </linearGradient>
      </defs>
      {/* avatar + handle */}
      <circle cx="9" cy="8" r="3.5" fill="#2257F5"/>
      <rect x="14" y="6.5" width="14" height="2" rx="1" fill="#F4F7FA" fillOpacity="0.6"/>
      {/* badge pill */}
      <rect x="6" y="16" width="18" height="5" rx="2.5" fill="#F4F7FA" fillOpacity="0.05" stroke="#F4F7FA" strokeWidth="0.5" strokeOpacity="0.15"/>
      <rect x="8" y="17.5" width="14" height="2" rx="1" fill="#F4F7FA" fillOpacity="0.4"/>
      {/* headline */}
      <rect x="6" y="24" width="38" height="4" rx="2" fill="#fff" fillOpacity="0.9"/>
      <rect x="6" y="30" width="28" height="3" rx="1.5" fill="#2257F5" fillOpacity="0.8"/>
      {/* ui-card */}
      <rect x="6" y="36" width="42" height="20" rx="4" fill="#191C20" stroke="#F4F7FA" strokeWidth="0.5" strokeOpacity="0.08"/>
      {/* card top accent line */}
      <rect x="6" y="36" width="42" height="1.5" rx="4" fill="url(#cardLine)"/>
      <defs>
        <linearGradient id="cardLine" x1="6" y1="0" x2="48" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2257F5"/>
          <stop offset="1" stopColor="#7C3AED"/>
        </linearGradient>
      </defs>
      <rect x="10" y="40" width="20" height="2" rx="1" fill="#fff" fillOpacity="0.5"/>
      <rect x="10" y="44" width="30" height="2" rx="1" fill="#fff" fillOpacity="0.25"/>
      <rect x="10" y="48" width="16" height="2" rx="1" fill="#fff" fillOpacity="0.15"/>
      {/* nav dots */}
      <rect x="6" y="62" width="14" height="2" rx="1" fill="#2257F5"/>
      <circle cx="24" cy="63" r="1.5" fill="#fff" fillOpacity="0.2"/>
      <circle cx="28" cy="63" r="1.5" fill="#fff" fillOpacity="0.2"/>
    </svg>
  );
}

const TEMPLATE_PREVIEWS: Record<string, React.FC> = {
  bold:            PreviewBold,
  editorial:       PreviewEditorial,
  'editorial-sci': PreviewEditorialSci,
  photo:           PreviewPhoto,
  moodboard:       PreviewMoodboard,
  instagram:       PreviewInstagram,
  comparison:      PreviewComparison,
  'fitswap-swap':  PreviewFitswapSwap,
  template1:       PreviewTemplate1,
  free:            PreviewFree,
  tudy:            PreviewTudy,
};

// ─── Template metadata ─────────────────────────────────────────────────────────

interface TemplateOption {
  id: string;
  name: string;
  description: string;
  slides: number | string;
  badge: string;
  color: string;
  previewTemplateId?: string;
}

const TEMPLATES: TemplateOption[] = [
  { id: 'bold',          name: 'Bold Overlay',      description: 'Dark + glow + números de impacto',         slides: 7,     badge: 'Sem imagens', color: '#3b82f6', previewTemplateId: 'bold' },
  { id: 'editorial',     name: 'Editorial Premium', description: 'Layout light/dark alternado com grid',     slides: 7,     badge: 'Sem imagens', color: '#3b82f6', previewTemplateId: 'editorial' },

  { id: 'editorial-sci', name: 'Scientific',        description: 'Hero image + headline bold com destaque',  slides: '3–7', badge: '1+ imagem',    color: '#00e5ff', previewTemplateId: 'editorial-sci' },
  { id: 'photo',         name: 'Cinematic Photo',   description: 'Foto full-bleed + Ken Burns + mockups',   slides: 7,     badge: 'Biblioteca',  color: '#c9a84c', previewTemplateId: 'photo' },
  { id: 'moodboard',     name: 'Moodboard',         description: 'Frames polaroid + film strip vintage',     slides: 6,     badge: 'Biblioteca',  color: '#c4a882', previewTemplateId: 'moodboard' },
  { id: 'instagram',     name: 'Instagram Native',  description: 'Chrome realista do Instagram',             slides: 5,     badge: 'CSS puro',    color: '#C9A84C', previewTemplateId: 'instagram' },
  { id: 'comparison',    name: 'Before & After',    description: 'Dois mockups no 1º slide: Sem vs. Com o produto — imagens geradas por IA', slides: 6, badge: 'IA imagens', color: '#6366f1', previewTemplateId: 'comparison' },
  { id: 'fitswap-swap',  name: 'Food Swap',         description: 'Hook com 2 fotos de refeição + mito + trocas X→Y + impacto numérico + aperitivo do app', slides: 6, badge: 'IA imagens', color: '#A6F000', previewTemplateId: 'fitswap-swap' },
  { id: 'tudy',          name: 'Tudy Style',        description: 'Dark tech: badge, card, flow, chart e CTA',   slides: 7,     badge: 'Biblioteca',  color: '#2257F5', previewTemplateId: 'tudy' },
  { id: 'template1',     name: 'Bold Overlay (IA)', description: 'Design gerado livremente pela IA',         slides: '4–8', badge: 'IA livre',    color: '#ec4899' },
  { id: 'free',          name: 'Livre (IA)',        description: 'Estrutura criada do zero pela IA',         slides: '4–8', badge: 'IA livre',    color: '#a855f7' },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface SavedTemplate {
  id: string;
  name: string;
  createdAt: string;
}

interface Props {
  selected: string;
  onChange: (id: string) => void;
  primaryColor?: string;
  savedTemplates?: SavedTemplate[];
  selectedCustomTemplateId?: string | null;
  onSelectCustomTemplate?: (id: string | null) => void;
  onDeleteCustomTemplate?: (id: string) => void;
}

export default function ElevepicTemplatePicker({
  selected,
  onChange,
  primaryColor,
  savedTemplates = [],
  selectedCustomTemplateId,
  onSelectCustomTemplate,
  onDeleteCustomTemplate,
}: Props) {
  const [previewTpl, setPreviewTpl] = React.useState<TemplateOption | null>(null);

  const apiBaseUrl = (
    process.env.NEXT_PUBLIC_API_URL
    || api.defaults.baseURL
    || 'http://localhost:3011'
  ).replace(/\/$/, '');

  return (
    <>
      <div style={{ marginBottom: '1.5rem', background: 'rgba(236, 72, 153, 0.05)', border: '1px solid rgba(236, 72, 153, 0.2)', padding: '1rem', borderRadius: '0.75rem' }}>
        <div style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#e4e4e7', marginBottom: '0.75rem' }}>
          🎨 Template do Carrossel
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', maxHeight: '520px', overflowY: 'auto', paddingRight: '2px' }}>
          {TEMPLATES.map((tpl) => {
            const isSelected = selected === tpl.id;
            const accentColor = isSelected ? (primaryColor || tpl.color) : '#27272a';
            const Preview = TEMPLATE_PREVIEWS[tpl.id];
            return (
              <div
                key={tpl.id}
                onClick={() => onChange(tpl.id)}
                style={{
                  display: 'flex',
                  gap: '0.625rem',
                  padding: '0.625rem',
                  background: isSelected ? `${accentColor}1a` : '#18181b',
                  border: `1px solid ${isSelected ? accentColor : '#27272a'}`,
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                {/* Thumbnail preview */}
                {Preview && (
                  <div style={{
                    flexShrink: 0,
                    borderRadius: '4px',
                    overflow: 'hidden',
                    border: `1px solid ${isSelected ? accentColor + '66' : '#3f3f46'}`,
                    boxShadow: isSelected ? `0 0 8px ${accentColor}44` : 'none',
                    transition: 'box-shadow 0.15s',
                  }}>
                    <Preview />
                  </div>
                )}

                {/* Info */}
                <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.25rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: isSelected ? '#fff' : '#d4d4d8', lineHeight: 1.2 }}>{tpl.name}</span>
                      <span style={{
                        flexShrink: 0,
                        fontSize: '0.6rem',
                        fontWeight: 600,
                        color: tpl.color,
                        background: `${tpl.color}22`,
                        border: `1px solid ${tpl.color}44`,
                        borderRadius: '4px',
                        padding: '1px 4px',
                        whiteSpace: 'nowrap',
                      }}>{tpl.badge}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.67rem', color: '#71717a', lineHeight: 1.35 }}>{tpl.description}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.375rem' }}>
                    <span style={{ fontSize: '0.62rem', color: '#52525b' }}>
                      {typeof tpl.slides === 'number'
                        ? `${tpl.slides} slide${tpl.slides !== 1 ? 's' : ''}`
                        : `${tpl.slides} slides`}
                    </span>
                    {tpl.previewTemplateId && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewTpl(tpl);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          padding: '2px 7px',
                          fontSize: '0.6rem',
                          fontWeight: 600,
                          color: tpl.color,
                          background: `${tpl.color}18`,
                          border: `1px solid ${tpl.color}44`,
                          borderRadius: '4px',
                          cursor: 'pointer',
                          lineHeight: 1.6,
                          position: 'relative',
                          zIndex: 2,
                        }}
                      >
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                          <line x1="8" y1="21" x2="16" y2="21"/>
                          <line x1="12" y1="17" x2="12" y2="21"/>
                        </svg>
                        Ver exemplo
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Meus Modelos salvos */}
      {savedTemplates.length > 0 && (
        <div style={{ marginBottom: '1.5rem', background: 'rgba(168, 85, 247, 0.05)', border: '1px solid rgba(168, 85, 247, 0.2)', padding: '1rem', borderRadius: '0.75rem' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#e4e4e7', marginBottom: '0.75rem' }}>
            📐 Meus Modelos Salvos
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {savedTemplates.map((tpl) => {
              const isActive = selectedCustomTemplateId === tpl.id;
              return (
                <div
                  key={tpl.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem',
                    background: isActive ? 'rgba(168, 85, 247, 0.18)' : '#18181b',
                    border: `1px solid ${isActive ? '#a855f7' : '#27272a'}`,
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onClick={() => onSelectCustomTemplate?.(isActive ? null : tpl.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                    <span style={{ fontSize: '0.85rem' }}>📄</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: isActive ? '#e9d5ff' : '#d4d4d8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tpl.name}
                    </span>
                    {isActive && (
                      <span style={{ flexShrink: 0, fontSize: '0.6rem', fontWeight: 700, color: '#a855f7', background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.4)', borderRadius: '4px', padding: '1px 5px' }}>
                        ATIVO
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDeleteCustomTemplate?.(tpl.id); }}
                    style={{ flexShrink: 0, background: 'transparent', border: 'none', color: '#52525b', cursor: 'pointer', fontSize: '0.75rem', padding: '2px 4px', lineHeight: 1 }}
                    title="Excluir modelo"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          {selectedCustomTemplateId && (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.67rem', color: '#71717a' }}>
              A IA usará este modelo como base para o próximo carrossel gerado.
            </p>
          )}
        </div>
      )}

      {/* Inline preview modal */}
      {previewTpl && (
        <div
          onClick={() => setPreviewTpl(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem',
              maxHeight: '90vh',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: '100%', justifyContent: 'space-between' }}>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: '1rem' }}>{previewTpl.name}</span>
              <button
                type="button"
                onClick={() => setPreviewTpl(null)}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >✕</button>
            </div>
            <div style={{ borderRadius: '0.75rem', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.6)', width: '420px', height: '525px', flexShrink: 0 }}>
              <iframe
                src={`${apiBaseUrl}/api/ai/template-preview/${previewTpl.previewTemplateId}`}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                title={`Preview ${previewTpl.name}`}
              />
            </div>
            <p style={{ color: '#71717a', fontSize: '0.72rem', margin: 0 }}>Clique fora para fechar • Arraste para navegar os slides</p>
          </div>
        </div>
      )}
    </>
  );
}
