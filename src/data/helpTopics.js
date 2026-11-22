// In-app Help (#220 I): a short How-do-I list. Each answer is two to four short
// lines; the detail lives in docs/ only, and `guide` names the docs heading
// (file#GitHub-anchor) that holds it. `image` is a file in public/guide/.
// src/test/helpTopics.test.js keeps the answers short and the links real.

export const GUIDE_BASE = 'https://github.com/Pritesh1980/sable/blob/main/docs/'

export function guideUrl(guide) {
  return `${GUIDE_BASE}${guide}`
}

export const HELP_GROUPS = [
  {
    label: 'Getting started',
    topics: [
      {
        id: 'get-around',
        question: 'How do I get around?',
        steps: [
          'Home shows your top artists, ideas and concepts, and one suggested next step.',
          'The bar along the bottom (along the top on a laptop) has Home, Artists, Ideas, AI and More.',
          'More holds Find (Plan, Radar, Studios) and App (Settings, Help).',
        ],
        image: 'nav-more.png',
        guide: '01-getting-started.md#moving-around',
      },
    ],
  },
  {
    label: 'Artists and photos',
    topics: [
      {
        id: 'add-artist',
        question: 'How do I add an artist?',
        steps: [
          'Artists → + Add.',
          'Attach screenshots: Choose files, drop them in, or tap Paste.',
          'Type their Instagram handle or profile link, then tap Save.',
          'Already saved? Drag a photo onto their tile on the Wall, or paste (⌘V) while their photo is open.',
        ],
        image: 'artist-capture.png',
        guide: '02-managing-artists.md#add-an-artist--the-quick-way',
      },
      {
        id: 'no-artist',
        question: 'How do I save a photo when I don’t know the artist?',
        steps: [
          'Artists → + Add, attach the photo, and tap Save without artist.',
          'It goes to the front of the Wall, marked No artist yet.',
          'Once you know who made it, open it and tap Give this an artist.',
        ],
        guide: '02-managing-artists.md#save-a-photo-without-an-artist',
      },
      {
        id: 'viewer',
        question: 'How do I look through photos?',
        steps: [
          'Tap any photo on the Wall and it fills the screen.',
          'On a phone, swipe left or right for this artist’s photos, up for the next artist, and down to close.',
          'On a laptop, use the arrow keys, and Esc to close.',
          'Tap the photo, or More, for the artist’s details and tools.',
        ],
        image: 'wall-viewer.png',
        guide: '01-getting-started.md#the-full-screen-viewer--one-click-in',
      },
      {
        id: 'favourite',
        question: 'How do I keep the photos I like best?',
        steps: [
          'Open a photo and tap the heart (F on a laptop).',
          'Tap Filter, then Favourites, to see only those photos.',
        ],
        guide: '02-managing-artists.md#favourite-a-photo',
      },
      {
        id: 'similar',
        question: 'How do I find work like a photo I like?',
        steps: [
          'Open the photo and tap More like this (M on a laptop; in the bottom panel on a phone).',
          'It shows the three closest artists, then the most similar photos.',
          'The first time, tap Build style index. It runs on this device, and your photos never leave it.',
          'To see one style on the Wall, tap Filter and pick it.',
        ],
        guide: '02-managing-artists.md#more-like-this',
      },
      {
        id: 'rank',
        question: 'How do I put my artists in order?',
        steps: [
          'Your Top 5 sits above the Wall: drag a rank number to reorder them.',
          'Reorder top 5 opens the full list, with ▲ and ▼ on every artist.',
          'Tools → Rank shows artists one at a time to judge: Pass, Maybe or Top.',
          'All of these set the same single ranking.',
        ],
        image: 'ranking-swipe.png',
        guide: '03-gallery-and-ranking.md#ranking-your-favourites',
      },
    ],
  },
  {
    label: 'Ideas and AI',
    topics: [
      {
        id: 'idea',
        question: 'How do I write down a tattoo idea?',
        steps: [
          'Ideas → +.',
          'Give it a title, styles, a placement and reference photos, then Save.',
          'Artists with matching styles appear in the editor: tap one to link them.',
          'The Boards tab groups ideas together.',
        ],
        image: 'brief-idea-editor.png',
        guide: '04-brief-and-boards.md#create-or-edit-an-idea',
      },
      {
        id: 'plan',
        question: 'Which artist should do my idea?',
        steps: [
          'More → Plan lists each open idea with up to three of your artists.',
          'Artists you linked come first, then those sharing the most styles, then your rank.',
          'A pin means they have a guest spot nearby soon.',
        ],
        image: 'plan.png',
        guide: '01-getting-started.md#the-plan-page',
      },
      {
        id: 'concept',
        question: 'How do I make an AI design?',
        steps: [
          'AI → + New concept. Or press G on an open photo to work in that artist’s style.',
          'Describe your idea and pick a placement.',
          'Generate image needs your own OpenAI or Gemini key, added in AI setup.',
          'No key? Tap Copy prompt instead, run it in ChatGPT or Gemini, then paste the image back in.',
        ],
        image: 'concepts.png',
        guide: '06-concepts.md#the-composer',
      },
      {
        id: 'try-on',
        question: 'How do I see a design on my arm?',
        steps: [
          'On an AI result with an image, choose View on arm in 3D. From an idea, tap On arm on a reference photo.',
          'Drag to turn the arm and pinch to resize; the size shows in centimetres.',
          'Try on skin puts the design over your live camera instead.',
        ],
        image: 'concept-arm.png',
        guide: '06-concepts.md#see-a-concept-on-the-arm-in-3d',
      },
      {
        id: 'print',
        question: 'How do I 3D print a design?',
        steps: [
          'On an AI result with an image, choose Make STL. From an idea, tap 3D print on a reference photo.',
          'Pick a style, check the 3D preview, then tap Download STL.',
          'From a photo of a real tattoo, Lift the tattoo (needs a Gemini key) redraws the ink flat first.',
        ],
        guide: '06-concepts.md#export-a-relief-stl',
      },
    ],
  },
  {
    label: 'Shows and your library',
    topics: [
      {
        id: 'conventions',
        question: 'Which conventions are my artists going to?',
        steps: [
          'More → Radar lists conventions, nearest to Milton Keynes first.',
          'On a card, tap Edit under Your artists attending to mark who is going.',
          'Artist index lists a show’s line-up and says which of them you already have.',
        ],
        image: 'conventions.png',
        guide: '05-conventions-and-studios.md#convention-radar',
      },
      {
        id: 'backup',
        question: 'How do I back up my library?',
        steps: [
          'More → Settings → Export Backup downloads one file with your artists, ideas, concepts and photos.',
          'Check the file saved, and keep a copy off this device.',
          'Import Backup restores a file, replacing what is here now.',
          'Your library stays on this device: only cloud-storage builds sync to your other devices.',
        ],
        image: 'settings.png',
        guide: '07-backup-and-settings.md#export-a-backup',
      },
    ],
  },
]
